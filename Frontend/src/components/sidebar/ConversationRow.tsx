"use client";

import { BellOff, Check, CheckCheck, Pin, Timer } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Avatar } from "@/components/ui/Avatar";
import { Menu } from "@/components/ui/Menu";
import { api } from "@/lib/api";
import { formatListTimestamp } from "@/lib/format";
import type { Conversation, MessageStatus } from "@/lib/types";
import { useAuthStore } from "@/stores/auth";
import { useConversationsStore } from "@/stores/conversations";
import { useMessagesStore } from "@/stores/messages";
import { useShallow } from "zustand/react/shallow";

import { usePresenceStore } from "@/stores/presence";
import { useUiStore } from "@/stores/ui";

/** 16px tick that mirrors the bubble ticks (signal's status language). */
export function StatusTick({ status, className = "" }: { status: MessageStatus; className?: string }) {
  const common = `h-4 w-4 ${className}`;
  if (status === "sending")
    return <span className={`${common} animate-pulse rounded-full border border-current opacity-70`} />;
  if (status === "sent") return <Check className={common} strokeWidth={2} opacity={0.7} />;
  if (status === "delivered") return <CheckCheck className={common} strokeWidth={2} opacity={0.7} />;
  if (status === "failed") return <span className={`${common} text-danger`}>!</span>;
  return <CheckCheck className={common} strokeWidth={2.4} />; // read: full opacity
}

export function ConversationRow({ conversation }: { conversation: Conversation }) {
  const router = useRouter();
  const activeId = useConversationsStore((state) => state.activeId);
  const setActive = useConversationsStore((state) => state.setActive);
  const meId = useAuthStore((state) => state.user?.id);
  const typingUserIds = useMessagesStore(useShallow((state) => state.typingUserIds(conversation.id)));
  const online = usePresenceStore((state) => state.byUser[conversation.peer?.id ?? -1]?.online);
  const toast = useUiStore((state) => state.toast);
  const setMobilePane = useUiStore((state) => state.setMobilePane);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);

  const isActive = activeId === conversation.id;
  const last = conversation.last_message;
  const isMine = last?.sender_id != null && last.sender_id === meId;
  const isTyping = typingUserIds.length > 0;

  const open = () => {
    setActive(conversation.id);
    setMobilePane("chat");
    router.push(`/chats/${conversation.id}`);
  };

  /* --- preview line: "typing…" > sender prefix > body ------------------- */
  let preview: string = last?.body ?? "";
  if (last?.kind === "attachment") preview = last.body ? `${last.body}` : "📎 Attachment";
  if (last?.kind === "system") preview = last.body ?? "";
  if (conversation.type === "group" && last?.sender_name && last.kind !== "system") {
    preview = `${isMine ? "You" : last.sender_name}: ${preview}`;
  }

  const pinned = conversation.pinned;
  const onlineDot = conversation.type === "direct" ? (online ?? conversation.is_online) : false;

  return (
    <>
      <li
        onContextMenu={(event) => {
          event.preventDefault();
          setMenuPosition({ x: event.clientX, y: event.clientY });
        }}
      >
        <button
          onClick={open}
          aria-current={isActive}
          className={`flex w-full items-center gap-3 rounded-btn px-2 py-2.5 text-left transition-colors duration-fast
            ${isActive ? "bg-selected" : "hover:bg-hover"}`}
        >
          <Avatar
            name={conversation.title}
            id={conversation.peer?.id ?? conversation.id}
            src={conversation.peer?.avatar_url ?? conversation.avatar_url}
            color={conversation.avatar_color}
            isGroup={conversation.type === "group"}
            online={onlineDot}
            size={48}
          />

          <span className="min-w-0 flex-1">
            <span className="flex items-baseline gap-2">
              <span
                className={`truncate text-[15px] leading-5 text-ink ${
                  conversation.unread_count > 0 ? "font-semibold" : "font-medium"
                }`}
              >
                {conversation.title}
              </span>
              <span
                className={`ml-auto shrink-0 text-[12px] leading-4 ${
                  conversation.unread_count > 0 ? "text-brand" : "text-ink-tertiary"
                }`}
              >
                {formatListTimestamp(conversation.last_message_at)}
              </span>
            </span>

            <span className="mt-0.5 flex items-center gap-1.5">
              {isMine && last && (
                <span className="shrink-0 text-ink-tertiary">
                  <StatusTick status={last.status} className="h-3.5 w-3.5" />
                </span>
              )}
              {conversation.disappearing_secs > 0 && (
                <Timer className="h-3.5 w-3.5 shrink-0 text-ink-tertiary" aria-label="Disappearing messages on" />
              )}
              {isTyping ? (
                <span className="truncate text-[13px] italic text-brand">typing…</span>
              ) : last?.deleted_at ? (
                <span className="truncate text-[13px] italic text-ink-tertiary">This message was deleted</span>
              ) : (
                <span className="truncate text-[13px] leading-[18px] text-ink-secondary">
                  {preview || (last?.kind === "attachment" ? "📎 Attachment" : "")}
                </span>
              )}

              <span className="ml-auto flex shrink-0 items-center gap-1">
                {pinned && <Pin className="h-3.5 w-3.5 text-ink-tertiary" aria-label="Pinned" />}
                {conversation.muted && (
                  <BellOff className="h-3.5 w-3.5 text-ink-tertiary" aria-label="Muted" />
                )}
                {conversation.unread_count > 0 && (
                  <span
                    className={`flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold
                      ${conversation.muted ? "bg-line text-ink-secondary" : "bg-brand text-white"}`}
                  >
                    {conversation.unread_count}
                  </span>
                )}
              </span>
            </span>
          </span>
        </button>
      </li>

      {/* right-click context menu, positioned at the pointer like Signal */}
      {menuPosition && (
        <div
          className="fixed z-50"
          style={{ left: menuPosition.x, top: menuPosition.y }}
          onMouseLeave={() => setMenuPosition(null)}
        >
          <Menu
            align="left"
            trigger={<span className="sr-only">Conversation actions</span>}
            items={[
              {
                label: pinned ? "Unpin chat" : "Pin chat",
                icon: <Pin className="h-4 w-4" />,
                onSelect: async () => {
                  const updated = await api.patchMembership(conversation.id, { pinned: !pinned });
                  useConversationsStore.getState().upsert(updated);
                },
              },
              {
                label: conversation.muted ? "Unmute" : "Mute",
                icon: <BellOff className="h-4 w-4" />,
                onSelect: async () => {
                  const updated = await api.patchMembership(conversation.id, { muted: !conversation.muted });
                  useConversationsStore.getState().upsert(updated);
                  toast(updated.muted ? "Chat muted" : "Chat unmuted");
                },
              },
              {
                label: "Archive chat",
                separatorBefore: true,
                onSelect: async () => {
                  await api.patchMembership(conversation.id, { archived: true });
                  useConversationsStore.getState().remove(conversation.id);
                  toast("Chat archived");
                },
              },
              {
                label: "Mark as read",
                onSelect: async () => {
                  if (last) {
                    await api.markRead(conversation.id, last.id);
                    useConversationsStore.getState().markReadLocally(conversation.id);
                  }
                },
              },
            ]}
          />
        </div>
      )}
    </>
  );
}
