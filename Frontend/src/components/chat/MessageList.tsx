"use client";

import { ChevronDown, Lock } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { MessageBubble } from "@/components/chat/MessageBubble";
import { Avatar } from "@/components/ui/Avatar";
import { COPY, EMPTY_MESSAGES } from "@/lib/constants";
import { formatDayLabel, parseUtc } from "@/lib/format";
import type { ConversationDetail, Message } from "@/lib/types";
import { useAuthStore } from "@/stores/auth";
import { useMessagesStore } from "@/stores/messages";
import { usePresenceStore } from "@/stores/presence";

const CLUSTER_WINDOW_MS = 3 * 60 * 1000;
const NEAR_BOTTOM_PX = 140;

/**
 * The timeline.
 *
 * Renders day separators and message runs, and owns the scroll behaviour:
 *  - load older history when scrolled to the top
 *  - stick to the bottom when a new message arrives *and* you were already
 *    there; otherwise show a "jump to latest" button (never yank the view)
 *  - a one-time unread divider showing where you left off
 */
export function MessageList({
  conversation,
  onReply,
  onReact,
  onDelete,
  onRetry,
  highlightId,
}: {
  conversation: ConversationDetail;
  onReply: (message: Message) => void;
  onReact: (message: Message, emoji: string | null) => void;
  onDelete: (message: Message, scope: "me" | "everyone") => void;
  onRetry: (message: Message) => void;
  highlightId?: number | null;
}) {
  const meId = useAuthStore((state) => state.user?.id);
  const messages = useMessagesStore((state) => state.byConversation[conversation.id] ?? EMPTY_MESSAGES);
  const loading = useMessagesStore((state) => state.loading[conversation.id] ?? false);
  const hasMore = useMessagesStore((state) => state.hasMore[conversation.id] ?? false);
  const loadOlder = useMessagesStore((state) => state.loadOlder);
  const hasMoreTyping = useMessagesStore((state) => state.typingUserIds(conversation.id).length > 0);
  const typingNames = useMessagesStore(useShallow((state) => state.typingUserIds(conversation.id)));
  const onlineMap = usePresenceStore((state) => state.byUser);

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [unreadDividerId, setUnreadDividerId] = useState<number | null>(null);

  /* --- remember where the unread messages started (once per open) ------- */
  useEffect(() => {
    if (!messages.length || unreadDividerId !== null) return;
    const unread = conversation.unread_count;
    if (unread <= 0) return;
    const incoming = messages.filter((message) => message.sender_id !== meId && message.kind !== "system");
    const first = incoming[Math.max(0, incoming.length - unread)];
    if (first) setUnreadDividerId(first.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, conversation.id]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    bottomRef.current?.scrollIntoView({ behavior, block: "end" });
    setAtBottom(true);
  }, []);

  // jump to the newest message when the conversation opens
  useLayoutEffect(() => {
    setUnreadDividerId(null);
    requestAnimationFrame(() => scrollToBottom("auto"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id]);

  // keep the view pinned if the user is already at the bottom
  useEffect(() => {
    if (atBottom) requestAnimationFrame(() => scrollToBottom("auto"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, hasMoreTyping]);

  const onScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    setAtBottom(distanceFromBottom < NEAR_BOTTOM_PX);

    if (element.scrollTop < 80 && hasMore && !loading) {
      const previousHeight = element.scrollHeight;
      void loadOlder(conversation.id).then(() => {
        // keep the reading position stable after prepending older messages
        requestAnimationFrame(() => {
          if (!scrollRef.current) return;
          scrollRef.current.scrollTop += scrollRef.current.scrollHeight - previousHeight;
        });
      });
    }
  };

  /* --- grouping: same sender within 3 minutes --------------------------- */
  const rendered = useMemo(() => {
    return messages.map((message, index) => {
      const previous = messages[index - 1];
      const next = messages[index + 1];

      const sameSenderAsPrevious =
        previous &&
        previous.sender_id === message.sender_id &&
        previous.kind === message.kind &&
        message.kind !== "system" &&
        previous.kind !== "system" &&
        Math.abs(
          (parseUtc(message.created_at)?.getTime() ?? 0) - (parseUtc(previous.created_at)?.getTime() ?? 0),
        ) < CLUSTER_WINDOW_MS;

      const sameSenderAsNext =
        next &&
        next.sender_id === message.sender_id &&
        next.kind === message.kind &&
        message.kind !== "system" &&
        next.kind !== "system" &&
        Math.abs(
          (parseUtc(next.created_at)?.getTime() ?? 0) - (parseUtc(message.created_at)?.getTime() ?? 0),
        ) < CLUSTER_WINDOW_MS;

      const previousDay = previous ? parseUtc(previous.created_at)?.toDateString() : null;
      const currentDay = parseUtc(message.created_at)?.toDateString();
      const startsNewDay = previousDay !== currentDay;

      return {
        message,
        isFirstInCluster: !sameSenderAsPrevious || startsNewDay,
        isLastInCluster: !sameSenderAsNext,
        showSenderName:
          !sameSenderAsPrevious &&
          message.kind !== "system" &&
          conversation.type === "group" &&
          message.sender_id !== meId,
        startsNewDay,
      };
    });
  }, [messages, conversation.type, meId]);

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="scroll-thin h-full overflow-y-auto pb-3"
        role="log"
        aria-live="polite"
        aria-label={`Messages in ${conversation.title}`}
      >
        {/* encryption notice - honest about being simulated */}
        <div className="mx-auto mt-4 mb-2 flex max-w-[560px] flex-col items-center gap-1 px-6 text-center">
          <Lock className="h-4 w-4 text-ink-tertiary" />
          <p className="text-[11px] leading-4 text-ink-tertiary">{COPY.encryption}</p>
          {conversation.type === "group" && (
            <p className="text-[11px] leading-4 text-ink-tertiary">
              {conversation.member_count} members ·{" "}
              {conversation.members.map((member) => member.user.display_name).join(", ")}
            </p>
          )}
        </div>

        {hasMore && (
          <div className="flex justify-center py-2">
            <span className="text-[12px] text-ink-tertiary">
              {loading ? "Loading older messages…" : "Scroll up for older messages"}
            </span>
          </div>
        )}

        {rendered.map(({ message, isFirstInCluster, isLastInCluster, showSenderName, startsNewDay }) => {
          const senderMember = message.sender_id
            ? conversation.members.find((member) => member.user.id === message.sender_id)
            : undefined;

          return (
            <div key={message.id}>
              {startsNewDay && (
                <div className="my-3 flex justify-center">
                  <span className="rounded-full bg-hover px-3 py-1 text-[11px] font-medium text-ink-secondary">
                    {formatDayLabel(message.created_at)}
                  </span>
                </div>
              )}

              {unreadDividerId === message.id && (
                <div className="my-3 flex items-center gap-3 px-4">
                  <span className="h-px flex-1 bg-brand/30" />
                  <span className="text-[11px] font-medium text-brand">
                    {conversation.unread_count} unread message
                    {conversation.unread_count > 1 ? "s" : ""}
                  </span>
                  <span className="h-px flex-1 bg-brand/30" />
                </div>
              )}

              <MessageBubble
                message={message}
                isMine={message.sender_id === meId}
                isFirstInCluster={isFirstInCluster}
                isLastInCluster={isLastInCluster}
                showSenderName={showSenderName}
                senderName={message.sender_name ?? senderMember?.user.display_name ?? null}
                senderId={message.sender_id}
                avatar={
                  conversation.type === "group"
                    ? {
                        src: senderMember?.user.avatar_url,
                        color: senderMember?.user.avatar_color,
                        isGroup: true,
                      }
                    : undefined
                }
                onReply={onReply}
                onReact={onReact}
                onDelete={onDelete}
                onRetry={onRetry}
                highlighted={highlightId === message.id}
              />
            </div>
          );
        })}

        {/* typing bubble */}
        {hasMoreTyping && (
          <div className="mt-3 flex items-center gap-2 px-4">
            {conversation.type === "group" ? (
              <Avatar
                name={typingNames.length ? (conversation.members.find((m) => m.user.id === typingNames[0])?.user.display_name ?? "?") : "?"}
                id={typingNames[0] ?? 0}
                size={32}
                color={conversation.members.find((m) => m.user.id === typingNames[0])?.user.avatar_color}
              />
            ) : null}
            <div className="flex items-center gap-1 rounded-bubble bg-incoming px-3.5 py-3">
              {[0, 1, 2].map((dot) => (
                <span
                  key={dot}
                  className="h-1.5 w-1.5 animate-dot-bounce rounded-full bg-ink-tertiary"
                  style={{ animationDelay: `${dot * 150}ms` }}
                />
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} className="h-2" />
      </div>

      {!atBottom && (
        <button
          onClick={() => scrollToBottom("smooth")}
          className="absolute bottom-4 right-5 flex h-10 w-10 items-center justify-center rounded-full border border-line bg-app text-ink-secondary shadow-menu hover:bg-hover"
          aria-label="Jump to latest messages"
        >
          <ChevronDown className="h-5 w-5" />
          {onlineMap[-1]?.online ? null : null}
        </button>
      )}
    </div>
  );
}
