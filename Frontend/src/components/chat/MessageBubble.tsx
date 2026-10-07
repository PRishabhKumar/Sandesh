"use client";

import { Copy, MoreVertical, Reply, RotateCw, SmilePlus, Timer, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";

import { StatusTick } from "@/components/sidebar/ConversationRow";
import { Avatar } from "@/components/ui/Avatar";
import { IconButton } from "@/components/ui/IconButton";
import { Menu } from "@/components/ui/Menu";
import { fileUrl } from "@/lib/api";
import { REACTION_EMOJIS } from "@/lib/constants";
import { formatBytes, formatCountdown, formatTime } from "@/lib/format";
import { nameColor } from "@/lib/palette";
import type { Message } from "@/lib/types";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";

type BubbleProps = {
  message: Message;
  isMine: boolean;
  isFirstInCluster: boolean;
  isLastInCluster: boolean;
  showSenderName: boolean;
  senderName: string | null;
  senderId: number | null;
  avatar?: { src?: string | null; color?: string | null; isGroup?: boolean };
  onReply: (message: Message) => void;
  onReact: (message: Message, emoji: string | null) => void;
  onDelete: (message: Message, scope: "me" | "everyone") => void;
  onRetry?: (message: Message) => void;
  highlighted?: boolean;
};

/**
 * One message bubble.
 *
 * Layout note: hover actions sit on the side *opposite the tail* (Signal's
 * habit) - left of an outgoing bubble, right of an incoming one - so the two
 * orders are rendered explicitly instead of relying on flex `order`, which is
 * brittle when classes collide.
 *
 * Corners: the outer corners stay 18px while the corners touching a neighbour
 * in the same run collapse to 4px. The list decides the grouping.
 */
export function MessageBubble({
  message,
  isMine,
  isFirstInCluster,
  isLastInCluster,
  showSenderName,
  senderName,
  senderId,
  avatar,
  onReply,
  onReact,
  onDelete,
  onRetry,
  highlighted = false,
}: BubbleProps) {
  const meId = useAuthStore((state) => state.user?.id);
  const toast = useUiStore((state) => state.toast);
  const [showEmojiRow, setShowEmojiRow] = useState(false);

  const myReaction = message.reactions.find((reaction) => reaction.user_id === meId);
  const groupedReactions = message.reactions.reduce<Record<string, number>>((accumulator, reaction) => {
    accumulator[reaction.emoji] = (accumulator[reaction.emoji] ?? 0) + 1;
    return accumulator;
  }, {});

  const outgoing = isMine;
  const deleted = Boolean(message.deleted_at);

  /* --- system messages: centred grey pill ------------------------------- */
  if (message.kind === "system") {
    return (
      <div className="my-2 flex justify-center px-4">
        <span className="rounded-full bg-hover px-3 py-1 text-center text-[11px] leading-4 text-ink-secondary">
          {message.body}
        </span>
      </div>
    );
  }

  const outer = "var(--radius-bubble)";
  const inner = "var(--radius-bubble-tight)";
  const radius = outgoing
    ? {
        borderTopLeftRadius: outer,
        borderTopRightRadius: isFirstInCluster ? outer : inner,
        borderBottomRightRadius: isLastInCluster ? outer : inner,
        borderBottomLeftRadius: outer,
      }
    : {
        borderTopLeftRadius: isFirstInCluster ? outer : inner,
        borderTopRightRadius: outer,
        borderBottomLeftRadius: isLastInCluster ? outer : inner,
        borderBottomRightRadius: outer,
      };

  const avatarSlot =
    !outgoing && avatar?.isGroup ? (
      <span className="mb-1 w-8 shrink-0">
        {isLastInCluster && (
          <Avatar
            name={senderName ?? "?"}
            id={senderId ?? 0}
            src={avatar.src}
            color={avatar.color}
            size={32}
          />
        )}
      </span>
    ) : null;

  const hoverActions = (
    <div className="flex shrink-0 items-center gap-0.5 self-center opacity-0 transition-opacity duration-150 group-hover/message:opacity-100 focus-within:opacity-100">
      <div className="relative">
        <IconButton label="React" onClick={() => setShowEmojiRow((value) => !value)} className="h-8 w-8">
          <SmilePlus className="h-4 w-4" />
        </IconButton>
        {showEmojiRow && (
          <div
            className={`absolute bottom-full z-30 mb-1 flex gap-0.5 rounded-full border border-line bg-app px-1.5 py-1 shadow-menu
              ${outgoing ? "left-0" : "right-0"}`}
          >
            {REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => {
                  onReact(message, myReaction?.emoji === emoji ? null : emoji);
                  setShowEmojiRow(false);
                }}
                className="rounded-full p-1 text-lg leading-none hover:bg-hover"
                aria-label={`React with ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>

      <IconButton label="Reply" onClick={() => onReply(message)} className="h-8 w-8">
        <Reply className="h-4 w-4" />
      </IconButton>

      <Menu
        trigger={
          <IconButton label="More actions" className="h-8 w-8">
            <MoreVertical className="h-4 w-4" />
          </IconButton>
        }
        items={[
          {
            label: "Copy text",
            icon: <Copy className="h-4 w-4" />,
            onSelect: async () => {
              await navigator.clipboard.writeText(message.body ?? "");
              toast("Copied to clipboard", { tone: "success" });
            },
          },
          { label: "Reply", icon: <Reply className="h-4 w-4" />, onSelect: () => onReply(message) },
          {
            label: "Delete for me",
            icon: <Trash2 className="h-4 w-4" />,
            separatorBefore: true,
            onSelect: () => onDelete(message, "me"),
          },
          {
            label: "Delete for everyone",
            icon: <Trash2 className="h-4 w-4" />,
            danger: true,
            disabled: !isMine,
            onSelect: () => onDelete(message, "everyone"),
          },
        ]}
      />
    </div>
  );

  const bubble = (
    <div className="relative max-w-[min(75%,540px)] sm:max-w-[min(65%,540px)]">
      <div
        style={radius}
        className={`relative px-3 py-2 text-[15px] leading-[22px]
          ${outgoing ? "bg-out text-out-text" : "bg-incoming text-incoming-text"}`}
      >
        {showSenderName && !outgoing && senderName && (
          <p className="mb-0.5 text-[13px] font-semibold" style={{ color: nameColor(senderId) }}>
            {senderName}
          </p>
        )}

        {message.reply_to && (
          <button
            onClick={() =>
              document
                .getElementById(`message-${message.reply_to?.id}`)
                ?.scrollIntoView({ behavior: "smooth", block: "center" })
            }
            className={`mb-1.5 block w-full rounded-md border-l-[3px] px-2 py-1 text-left text-[13px] leading-[18px]
              ${outgoing ? "border-white/70 bg-white/15 text-white/90" : "border-brand bg-black/[.04] text-ink-secondary"}`}
          >
            <span className="block font-semibold">{message.reply_to.sender_name ?? "Message"}</span>
            <span className="line-clamp-2 block">
              {message.reply_to.body ?? "This message was deleted"}
            </span>
          </button>
        )}

        {deleted ? (
          <p className={`italic ${outgoing ? "text-white/80" : "text-ink-tertiary"}`}>
            This message was deleted
          </p>
        ) : (
          <>
            {message.attachments.map((attachment) =>
              attachment.mime_type.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={attachment.id}
                  src={fileUrl(attachment.url)}
                  alt={attachment.file_name}
                  className="mb-1 max-h-[320px] w-full rounded-lg object-cover"
                />
              ) : (
                <a
                  key={attachment.id}
                  href={fileUrl(attachment.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mb-1 flex items-center gap-2 rounded-lg bg-black/10 px-2 py-1.5 text-[13px]"
                >
                  📄
                  <span className="flex-1 truncate">{attachment.file_name}</span>
                  <span className="opacity-70">{formatBytes(attachment.size_bytes)}</span>
                </a>
              ),
            )}
            {message.body && <Linkified text={message.body} outgoing={outgoing} />}
          </>
        )}

        <span
          className={`float-right ml-2 mt-1 flex translate-y-0.5 items-center gap-1 text-[11px] leading-4
            ${outgoing ? "text-white/70" : "text-ink-tertiary"}`}
        >
          {message.expires_at && !deleted && (
            <span className="flex items-center gap-0.5" title="Disappearing message">
              <Timer className="h-3 w-3" />
              {formatCountdown(message.expires_at)}
            </span>
          )}
          {formatTime(message.created_at)}
          {outgoing &&
            (message.status === "failed" ? (
              <button
                onClick={() => onRetry?.(message)}
                className="flex items-center gap-1 font-medium text-white"
                title="Tap to retry"
              >
                <RotateCw className="h-3 w-3" /> Retry
              </button>
            ) : (
              <StatusTick status={message.status} className="h-3.5 w-3.5" />
            ))}
        </span>
      </div>

      {Object.keys(groupedReactions).length > 0 && (
        <div className={`-mt-1.5 flex gap-1 px-2 ${outgoing ? "justify-end" : "justify-start"}`}>
          {Object.entries(groupedReactions).map(([emoji, count]) => {
            const mine = myReaction?.emoji === emoji;
            return (
              <button
                key={emoji}
                onClick={() => onReact(message, mine ? null : emoji)}
                className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[12px] shadow-sm transition-colors
                  ${mine ? "border-brand bg-selected text-brand" : "border-line bg-app text-ink-secondary hover:bg-hover"}`}
              >
                <span>{emoji}</span>
                {count > 1 && <span className="font-medium">{count}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div
      id={`message-${message.id}`}
      className={`group/message flex w-full items-end gap-2 px-4
        ${outgoing ? "flex-row-reverse justify-start" : "justify-start"}
        ${isFirstInCluster ? "mt-3" : "mt-0.5"}
        ${highlighted ? "rounded-btn bg-brand/10 transition-colors" : ""}`}
    >
      {avatarSlot}
      {outgoing ? (
        <>
          {hoverActions}
          {bubble}
        </>
      ) : (
        <>
          {bubble}
          {hoverActions}
        </>
      )}
    </div>
  );
}

/** Splits text on URLs and renders http/https links (nothing else is allowed). */
function Linkified({ text, outgoing }: { text: string; outgoing: boolean }): ReactNode {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return (
    <span className="whitespace-pre-wrap [overflow-wrap:anywhere]">
      {parts.map((part, index) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className={`underline underline-offset-2 ${outgoing ? "text-white" : "text-brand-link"}`}
          >
            {part}
          </a>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </span>
  );
}
