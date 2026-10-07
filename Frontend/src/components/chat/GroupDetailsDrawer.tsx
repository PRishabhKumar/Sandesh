"use client";

import { Check, Shield, Timer, Trash2, UserPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Menu } from "@/components/ui/Menu";
import { Switch, TextField } from "@/components/ui/Field";
import { api } from "@/lib/api";
import { COPY, DISAPPEARING_OPTIONS } from "@/lib/constants";
import { formatLastSeen } from "@/lib/format";
import type { ConversationDetail } from "@/lib/types";
import { useAuthStore } from "@/stores/auth";
import { useConversationsStore } from "@/stores/conversations";
import { usePresenceStore } from "@/stores/presence";
import { useUiStore } from "@/stores/ui";

/**
 * Right-hand details panel (desktop) for a group or a person.
 *
 * Every control is rendered only when the signed-in user is allowed to use it -
 * but that is *cosmetic*: the server re-checks the permission and answers 403,
 * which the QA script verifies with curl.
 */
export function GroupDetailsDrawer({
  conversation,
  onClose,
  onRefresh,
}: {
  conversation: ConversationDetail;
  onClose: () => void;
  onRefresh: () => Promise<ConversationDetail | null>;
}) {
  const router = useRouter();
  const me = useAuthStore((state) => state.user);
  const toast = useUiStore((state) => state.toast);
  const openModal = useUiStore((state) => state.openModal);
  const confirmDialog = useUiStore((state) => state.confirm);
  const presence = usePresenceStore((state) => state.byUser[conversation.peer?.id ?? -1]);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(conversation.title);
  const [description, setDescription] = useState(conversation.about ?? "");

  const isGroup = conversation.type === "group";
  const isAdmin = conversation.role === "admin";
  const canAddMembers = isAdmin || conversation.members_can_add;

  const timerLabel =
    DISAPPEARING_OPTIONS.find((option) => option.seconds === conversation.disappearing_secs)?.label ?? "Off";

  const saveGroupInfo = async () => {
    try {
      await api.updateGroup(conversation.id, { name: name.trim(), description });
      await onRefresh();
      setEditing(false);
      toast("Group updated", { tone: "success" });
    } catch (error) {
      toast((error as Error).message, { tone: "error" });
    }
  };

  const makeAdmin = async (userId: number, role: "admin" | "member") => {
    try {
      await api.setMemberRole(conversation.id, userId, role);
      await onRefresh();
      toast(role === "admin" ? "Promoted to admin" : "Admin removed", { tone: "success" });
    } catch (error) {
      toast((error as Error).message, { tone: "error" });
    }
  };

  const removeMember = (userId: number, displayName: string) =>
    confirmDialog({
      title: "Remove member",
      body: `${displayName} will be removed from ${conversation.title}. They can be added back later.`,
      confirmLabel: "Remove",
      destructive: true,
      onConfirm: async () => {
        try {
          await api.removeGroupMember(conversation.id, userId);
          await onRefresh();
          toast(`${displayName} was removed`);
        } catch (error) {
          toast((error as Error).message, { tone: "error" });
        }
      },
    });

  const leaveGroup = () =>
    confirmDialog({
      title: "Leave group",
      body: `You will stop receiving messages from ${conversation.title}.`,
      confirmLabel: "Leave",
      destructive: true,
      onConfirm: async () => {
        await api.removeGroupMember(conversation.id, me?.id ?? 0);
        useConversationsStore.getState().remove(conversation.id);
        toast("You left the group");
        router.push("/chats");
      },
    });

  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[380px] animate-slide-in-left flex-col border-l border-line bg-panel shadow-modal md:static md:z-auto md:w-[340px] md:animate-none md:shadow-none">
      <header className="flex h-16 shrink-0 items-center gap-2 px-3">
        <IconButton label="Close details" onClick={onClose}>
          <X className="h-5 w-5" />
        </IconButton>
        <h2 className="flex-1 text-center text-[15px] font-semibold text-ink">
          {isGroup ? "Group details" : "Contact info"}
        </h2>
        <span className="w-9" />
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 pb-6">
        {/* --- identity ---------------------------------------------------- */}
        <div className="flex flex-col items-center gap-3 py-4">
          <Avatar
            name={conversation.title}
            id={conversation.peer?.id ?? conversation.id}
            src={conversation.peer?.avatar_url ?? conversation.avatar_url}
            color={conversation.avatar_color}
            isGroup={isGroup}
            size={120}
          />

          {editing ? (
            <div className="w-full space-y-2">
              <TextField
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-label="Group name"
                placeholder="Group name"
              />
              <TextField
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                aria-label="Description"
                placeholder="Description (optional)"
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={saveGroupInfo}>
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <>
              <h3 className="text-center text-[19px] font-semibold text-ink">{conversation.title}</h3>
              {isGroup ? (
                <p className="text-center text-[13px] text-ink-secondary">
                  {conversation.member_count} members
                </p>
              ) : (
                <p className="text-center text-[13px] text-ink-secondary">
                  {presence?.online
                    ? COPY.online
                    : formatLastSeen(presence?.last_seen_at ?? conversation.peer?.last_seen_at)}
                </p>
              )}
              {conversation.about && (
                <p className="text-center text-[13px] leading-5 text-ink-secondary">{conversation.about}</p>
              )}
              {!isGroup && conversation.peer?.phone_number && (
                <p className="text-center text-[13px] text-ink-tertiary">{conversation.peer.phone_number}</p>
              )}
              {!isGroup && conversation.peer?.username && (
                <p className="text-center text-[13px] text-ink-tertiary">@{conversation.peer.username}</p>
              )}
              {isGroup && isAdmin && (
                <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                  Edit group info
                </Button>
              )}
            </>
          )}
        </div>

        {/* --- settings rows ---------------------------------------------- */}
        <section className="mt-2 divide-y divide-line border-y border-line">
          <button
            onClick={() => openModal("disappearing", { conversation })}
            className="flex w-full items-center gap-3 py-3 text-left hover:bg-hover"
          >
            <Timer className="h-5 w-5 text-ink-secondary" />
            <span className="flex-1 text-[14px] text-ink">Disappearing messages</span>
            <span className="text-[13px] text-ink-secondary">{timerLabel}</span>
          </button>

          {isGroup && (
            <>
              <div className="flex items-center gap-3 py-3">
                <UserPlus className="h-5 w-5 text-ink-secondary" />
                <span className="flex-1 text-[14px] text-ink">Members can add people</span>
                <Switch
                  label="Members can add people"
                  checked={conversation.members_can_add}
                  disabled={!isAdmin}
                  onChange={async (next) => {
                    await api.updateGroup(conversation.id, { members_can_add: next });
                    await onRefresh();
                  }}
                />
              </div>
              <div className="flex items-center gap-3 py-3">
                <Shield className="h-5 w-5 text-ink-secondary" />
                <span className="flex-1 text-[14px] text-ink">Only admins can send</span>
                <Switch
                  label="Only admins can send"
                  checked={conversation.only_admins_can_send}
                  disabled={!isAdmin}
                  onChange={async (next) => {
                    await api.updateGroup(conversation.id, { only_admins_can_send: next });
                    await onRefresh();
                  }}
                />
              </div>
            </>
          )}
        </section>

        {/* --- members ----------------------------------------------------- */}
        {isGroup && (
          <section className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-[13px] font-semibold uppercase tracking-wide text-ink-secondary">
                {conversation.member_count} members
              </h4>
              {canAddMembers && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => openModal("add-members", { conversation })}
                >
                  Add
                </Button>
              )}
            </div>

            <ul className="space-y-1">
              {conversation.members.map((member) => (
                <li key={member.user.id} className="flex items-center gap-3 rounded-btn px-1 py-2 hover:bg-hover">
                  <Avatar
                    name={member.user.display_name}
                    id={member.user.id}
                    src={member.user.avatar_url}
                    color={member.user.avatar_color}
                    size={36}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] text-ink">
                      {member.user.id === me?.id ? "You" : member.user.display_name}
                    </span>
                    <span className="block truncate text-[12px] text-ink-secondary">
                      {member.user.about ?? ""}
                    </span>
                  </span>
                  {member.role === "admin" && (
                    <span className="flex items-center gap-1 text-[11px] font-medium text-brand">
                      <Check className="h-3 w-3" /> Admin
                    </span>
                  )}
                  {isAdmin && member.user.id !== me?.id && (
                    <Menu
                      trigger={<IconButton label={`Actions for ${member.user.display_name}`}>⋮</IconButton>}
                      items={[
                        member.role === "admin"
                          ? {
                              label: "Remove admin",
                              onSelect: () => makeAdmin(member.user.id, "member"),
                            }
                          : { label: "Make admin", onSelect: () => makeAdmin(member.user.id, "admin") },
                        {
                          label: "Remove from group",
                          danger: true,
                          separatorBefore: true,
                          onSelect: () => removeMember(member.user.id, member.user.display_name),
                        },
                      ]}
                    />
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* --- danger zone ------------------------------------------------- */}
        <section className="mt-6 space-y-2">
          {isGroup && (
            <Button variant="ghost" className="w-full justify-start text-danger" onClick={leaveGroup}>
              <Trash2 className="h-4 w-4" /> Leave group
            </Button>
          )}
          <Button
            variant="ghost"
            className="w-full justify-start text-danger"
            onClick={() =>
              confirmDialog({
                title: isGroup ? "Delete group" : "Delete chat",
                body: "Deleting removes the conversation from your list. Messages are kept for other members.",
                confirmLabel: "Delete",
                destructive: true,
                onConfirm: async () => {
                  await api.patchMembership(conversation.id, { archived: true });
                  useConversationsStore.getState().remove(conversation.id);
                  router.push("/chats");
                },
              })
            }
          >
            <Trash2 className="h-4 w-4" /> {isGroup ? "Delete group" : "Delete chat"}
          </Button>
        </section>
      </div>
    </aside>
  );
}
