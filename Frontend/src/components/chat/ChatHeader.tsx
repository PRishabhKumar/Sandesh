"use client";

import {
  Archive,
  BellOff,
  ChevronLeft,
  Info,
  Phone,
  Pin,
  Search,
  ShieldCheck,
  Timer,
  Trash2,
  UserPlus,
  Video,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useShallow } from "zustand/react/shallow";

import { Avatar } from "@/components/ui/Avatar";
import { IconButton } from "@/components/ui/IconButton";
import { Menu } from "@/components/ui/Menu";
import { api } from "@/lib/api";
import { COPY } from "@/lib/constants";
import { formatDuration, formatLastSeen } from "@/lib/format";
import type { ConversationDetail } from "@/lib/types";
import { useAuthStore } from "@/stores/auth";
import { useConversationsStore } from "@/stores/conversations";
import { useMessagesStore } from "@/stores/messages";
import { usePresenceStore } from "@/stores/presence";
import { useUiStore } from "@/stores/ui";

/**
 * Chat pane header: avatar, name, live presence line, the (placeholder) call
 * buttons and the conversation menu.
 *
 * The subtitle is a good example of "real where it matters": it shows
 * "typing…", then "Online", then a real last-seen time - and hides the
 * last-seen entirely when that user turned "show last seen" off.
 */
export function ChatHeader({
  conversation,
  onOpenDetails,
}: {
  conversation: ConversationDetail;
  onOpenDetails: () => void;
}) {
  const router = useRouter();
  const toast = useUiStore((state) => state.toast);
  const openModal = useUiStore((state) => state.openModal);
  const confirmDialog = useUiStore((state) => state.confirm);
  const meId = useAuthStore((state) => state.user?.id);
  const setMobilePane = useUiStore((state) => state.setMobilePane);
  const presence = usePresenceStore((state) => state.byUser[conversation.peer?.id ?? -1]);
  const typingIds = useMessagesStore(useShallow((state) => state.typingUserIds(conversation.id)));

  const isGroup = conversation.type === "group";
  const online = presence?.online ?? conversation.is_online;

  const typingLabel = (() => {
    if (!typingIds.length) return null;
    if (!isGroup) return COPY.typing;
    const names = typingIds
      .map(
        (id) =>
          conversation.members.find((member) => member.user.id === id)?.user.display_name ?? "Someone",
      )
      .filter((name) => name !== "Someone");
    if (names.length === 1) return `${names[0]} is typing…`;
    return `${names.slice(0, 2).join(", ")} are typing…`;
  })();

  const subtitle = (() => {
    if (typingLabel) return <span className="text-brand">{typingLabel}</span>;
    if (isGroup)
      return `${conversation.member_count} members${
        conversation.disappearing_secs ? ` · ${formatDuration(conversation.disappearing_secs)} timer` : ""
      }`;
    if (online) return COPY.online;
    return formatLastSeen(presence?.last_seen_at ?? conversation.peer?.last_seen_at);
  })();

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line bg-panel px-3 md:px-4">
      <IconButton
        label="Back to chats"
        className="md:hidden"
        onClick={() => {
          setMobilePane("list");
          router.push("/chats");
        }}
      >
        <ChevronLeft className="h-5 w-5" />
      </IconButton>

      <button
        onClick={onOpenDetails}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-btn px-1 py-1 text-left hover:bg-hover"
      >
        <Avatar
          name={conversation.title}
          id={conversation.peer?.id ?? conversation.id}
          src={conversation.peer?.avatar_url ?? conversation.avatar_url}
          color={conversation.avatar_color}
          isGroup={isGroup}
          online={!isGroup && online}
          size={36}
        />
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-semibold leading-5 text-ink">
            {conversation.title}
          </span>
          <span className="block truncate text-[12px] leading-4 text-ink-secondary">{subtitle}</span>
        </span>
      </button>

      <div className="flex items-center gap-0.5">
        <IconButton
          label="Voice call (coming soon)"
          onClick={() => openModal("coming-soon", { feature: "Voice calls" })}
        >
          <Phone className="h-[20px] w-[20px]" />
        </IconButton>
        <IconButton
          label="Video call (coming soon)"
          onClick={() => openModal("coming-soon", { feature: "Video calls" })}
        >
          <Video className="h-[20px] w-[20px]" />
        </IconButton>
        <IconButton label="Search in chat (coming soon)" onClick={() => toast(COPY.comingSoon)}>
          <Search className="h-[20px] w-[20px]" />
        </IconButton>

        <Menu
          trigger={
            <IconButton label="Conversation menu">
              <span className="text-lg leading-none">⋮</span>
            </IconButton>
          }
          items={[
            {
              label: "View info",
              icon: <Info className="h-4 w-4" />,
              onSelect: onOpenDetails,
            },
            ...(isGroup
              ? [
                  {
                    label: "Add members",
                    icon: <UserPlus className="h-4 w-4" />,
                    onSelect: () => openModal("add-members", { conversation }),
                  },
                ]
              : []),
            {
              label: "Disappearing messages",
              icon: <Timer className="h-4 w-4" />,
              onSelect: () => openModal("disappearing", { conversation }),
            },
            {
              label: conversation.pinned ? "Unpin chat" : "Pin chat",
              icon: <Pin className="h-4 w-4" />,
              onSelect: async () => {
                const updated = await api.patchMembership(conversation.id, {
                  pinned: !conversation.pinned,
                });
                useConversationsStore.getState().upsert(updated);
              },
            },
            {
              label: conversation.muted ? "Unmute" : "Mute notifications",
              icon: <BellOff className="h-4 w-4" />,
              onSelect: async () => {
                const updated = await api.patchMembership(conversation.id, {
                  muted: !conversation.muted,
                });
                useConversationsStore.getState().upsert(updated);
                toast(updated.muted ? "Notifications muted" : "Notifications unmuted");
              },
            },
            {
              label: "Archive chat",
              icon: <Archive className="h-4 w-4" />,
              separatorBefore: true,
              onSelect: async () => {
                await api.patchMembership(conversation.id, { archived: true });
                useConversationsStore.getState().remove(conversation.id);
                toast("Chat archived");
                router.push("/chats");
              },
            },
            {
              label: "Safety number",
              icon: <ShieldCheck className="h-4 w-4" />,
              onSelect: () => openModal("safety-number", { conversation }),
            },
            {
              label: isGroup ? "Leave group" : "Block contact",
              icon: <Trash2 className="h-4 w-4" />,
              danger: true,
              separatorBefore: true,
              onSelect: () =>
                isGroup
                  ? confirmDialog({
                      title: "Leave group",
                      body: `You will stop receiving messages from ${conversation.title}.`,
                      confirmLabel: "Leave",
                      destructive: true,
                      onConfirm: async () => {
                        await api.removeGroupMember(conversation.id, meId ?? 0);
                        useConversationsStore.getState().remove(conversation.id);
                        toast("You left the group");
                        router.push("/chats");
                      },
                    })
                  : toast(COPY.comingSoon),
            },
          ]}
        />
      </div>
    </header>
  );
}
