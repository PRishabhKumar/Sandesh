"use client";

import { Paperclip, Plus, SendHorizontal, Smile, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { IconButton } from "@/components/ui/IconButton";
import { EMOJI_PICKER } from "@/lib/constants";
import type { Message } from "@/lib/types";
import { socket } from "@/lib/ws";

const TYPING_REFRESH_MS = 3000; // throttle: at most one typing event per 3s
const TYPING_IDLE_MS = 3000; // stop after 3s without typing

/**
 * The composer: auto-growing textarea, emoji picker, attachment button, reply
 * strip and the send button that appears once there is text.
 *
 * Enter sends, Shift+Enter adds a newline. Typing events are *throttled* on the
 * way out (never more than one every 3s) and stopped automatically when the
 * user pauses - which is also how the receiving side expires the indicator.
 */
export function Composer({
  conversationId,
  replyTo,
  onCancelReply,
  onSend,
  onAttach,
  disabled = false,
  disabledReason,
}: {
  conversationId: number;
  replyTo: Message | null;
  onCancelReply: () => void;
  onSend: (body: string) => void;
  onAttach: (file: File) => Promise<void>;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [value, setValue] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [uploading, setUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingSentAt = useRef(0);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // focus the field when the conversation changes or a reply is started
  useEffect(() => {
    textareaRef.current?.focus();
  }, [conversationId, replyTo]);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
  }, [value]);

  const signalTyping = () => {
    const now = Date.now();
    if (now - typingSentAt.current > TYPING_REFRESH_MS) {
      typingSentAt.current = now;
      socket.send("typing.start", { conversation_id: conversationId });
    }
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      typingSentAt.current = 0;
      socket.send("typing.stop", { conversation_id: conversationId });
    }, TYPING_IDLE_MS);
  };

  const stopTyping = () => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    typingSentAt.current = 0;
    socket.send("typing.stop", { conversation_id: conversationId });
  };

  const submit = () => {
    const body = value.trim();
    if (!body || disabled) return;
    onSend(body);
    setValue("");
    stopTyping();
    setShowEmoji(false);
  };

  return (
    <div className="shrink-0 border-t border-line bg-panel px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2">
      {/* reply strip */}
      {replyTo && (
        <div className="reply-strip mb-2 flex items-start gap-2 rounded-r-md bg-hover px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold text-ink">
              Replying to {replyTo.sender_name ?? "message"}
            </p>
            <p className="truncate text-[13px] text-ink-secondary">{replyTo.body ?? "Attachment"}</p>
          </div>
          <IconButton label="Cancel reply" onClick={onCancelReply} className="h-7 w-7">
            <X className="h-4 w-4" />
          </IconButton>
        </div>
      )}

      {disabled ? (
        <p className="py-3 text-center text-[13px] text-ink-secondary">
          {disabledReason ?? "You cannot send messages here."}
        </p>
      ) : (
        <div className="flex items-end gap-2">
          <IconButton
            label="Attach a file"
            onClick={() => fileInputRef.current?.click()}
            className="mb-0.5 h-9 w-9"
          >
            {uploading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-brand" />
            ) : (
              <Plus className="h-[22px] w-[22px]" />
            )}
          </IconButton>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setUploading(true);
              try {
                await onAttach(file);
              } finally {
                setUploading(false);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }
            }}
          />

          <div className="relative flex flex-1 items-end rounded-[20px] border border-line bg-field px-3 py-1.5 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand-soft/50">
            <textarea
              ref={textareaRef}
              rows={1}
              value={value}
              placeholder="Message"
              aria-label="Message"
              onChange={(event) => {
                setValue(event.target.value);
                signalTyping();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
              className="scroll-thin max-h-[160px] flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-[22px] text-ink outline-none placeholder:text-ink-tertiary"
            />

            <div className="relative">
              <IconButton
                label="Emoji"
                onClick={() => setShowEmoji((open) => !open)}
                className="mb-0.5 h-8 w-8"
              >
                <Smile className="h-5 w-5" />
              </IconButton>
              {showEmoji && (
                <div className="absolute bottom-full right-0 z-30 mb-2 grid w-[248px] grid-cols-8 gap-1 rounded-card border border-line bg-app p-2 shadow-menu">
                  {EMOJI_PICKER.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => {
                        setValue((current) => current + emoji);
                        textareaRef.current?.focus();
                      }}
                      className="rounded p-1 text-lg leading-none hover:bg-hover"
                      aria-label={`Insert ${emoji}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <IconButton
              label="Send message"
              onClick={submit}
              disabled={!value.trim()}
              className={`mb-0.5 h-8 w-8 ${value.trim() ? "text-brand" : "text-ink-tertiary"}`}
            >
              <SendHorizontal className="h-5 w-5" />
            </IconButton>
          </div>

          {/* microphone placeholder - Signal shows one when the field is empty */}
          {!value.trim() && (
            <IconButton
              label="Voice message (coming soon)"
              onClick={() => {}}
              className="mb-0.5 h-9 w-9"
            >
              <Paperclip className="h-[18px] w-[18px]" />
            </IconButton>
          )}
        </div>
      )}
    </div>
  );
}
