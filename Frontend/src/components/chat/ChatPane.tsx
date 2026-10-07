"use client";

import { MessageSquareX } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { ChatHeader } from "@/components/chat/ChatHeader";
import { Composer } from "@/components/chat/Composer";
import { MessageList } from "@/components/chat/MessageList";
import { GroupDetailsDrawer } from "@/components/chat/GroupDetailsDrawer";
import { EmptyChatPane } from "@/components/chat/EmptyChatPane";
import { api } from "@/lib/api";
import type { ConversationDetail, Message } from "@/lib/types";
import { socket } from "@/lib/ws";
import { sendReadReceipt } from "@/hooks/useSocketEvents";
import { useAuthStore } from "@/stores/auth";
import { useConversationsStore } from "@/stores/conversations";
import { useMessagesStore } from "@/stores/messages";
import { useUiStore } from "@/stores/ui";

/**
 * The chat pane: loads a conversation, marks it read, sends messages.
 *
 * Sending is *optimistic*: the bubble appears immediately with status
 * "sending", the socket carries it to the server, and `message.ack` swaps the
 * placeholder for the stored message (matched by `client_id`). If nothing comes
 * back within 10s the bubble flips to "failed" with a retry button - safe to
 * retry because the server de-duplicates on (sender_id, client_id).
 */
export function ChatPane({ conversationId }: { conversationId: number }) {
  const me = useAuthStore((state) => state.user);
  const setActive = useConversationsStore((state) => state.setActive);
  const conversationRow = useConversationsStore((state) => state.byId(conversationId));
  const loadMessages = useMessagesStore((state) => state.loadInitial);
  const addMessage = useMessagesStore((state) => state.addMessage);
  const markFailed = useMessagesStore((state) => state.markFailed);
  const retryMessage = useMessagesStore((state) => state.retryMessage);
  const toast = useUiStore((state) => state.toast);
  const confirmDialog = useUiStore((state) => state.confirm);

  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  // Set when the detail request fails (deleted chat, or a conversation this
  // account is not a member of) so the pane can say so instead of looking empty.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [highlightId, setHighlightId] = useState<number | null>(null);

  const refreshConversation = useCallback(async () => {
    try {
      const detail = await api.conversation(conversationId);
      setConversation(detail);
      setLoadError(null);
      useConversationsStore.getState().upsert(detail);
      return detail;
    } catch (error) {
      setConversation(null);
      setLoadError((error as Error).message || "This conversation could not be loaded");
      return null;
    }
  }, [conversationId]);

  /* --- open a conversation --------------------------------------------- */
  useEffect(() => {
    setActive(conversationId);
    setReplyTo(null);
    setShowDetails(false);
    setLoadError(null);
    void loadMessages(conversationId);
    void refreshConversation();
  }, [conversationId, loadMessages, refreshConversation, setActive]);

  /* --- mark read: on open, on new messages, and when the tab is refocused - */
  useEffect(() => {
    if (!conversation) return;

    const markRead = () => {
      const messages = useMessagesStore.getState().byConversation[conversationId] ?? [];
      const incoming = messages.filter(
        (message) => message.sender_id !== me?.id && message.kind !== "system" && message.id > 0,
      );
      const last = incoming[incoming.length - 1];
      if (last) sendReadReceipt(conversationId, last.id);
    };

    markRead();
    const messages = useMessagesStore.getState().byConversation[conversationId] ?? [];
    void messages;

    const onVisible = () => {
      if (document.visibilityState === "visible") markRead();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [conversation, conversationId, me?.id]);

  // re-run mark-read whenever a new message lands in this conversation
  const messageCount = useMessagesStore((state) => state.byConversation[conversationId]?.length ?? 0);
  useEffect(() => {
    const messages = useMessagesStore.getState().byConversation[conversationId] ?? [];
    const incoming = messages.filter(
      (message) => message.sender_id !== me?.id && message.kind !== "system" && message.id > 0,
    );
    const last = incoming[incoming.length - 1];
    if (last && conversation) sendReadReceipt(conversationId, last.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageCount, conversationId]);

  if (!conversation && loadError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
        <MessageSquareX className="h-10 w-10 text-ink-tertiary" />
        <p className="text-[15px] font-medium text-ink">{loadError}</p>
        <p className="max-w-[360px] text-[13px] leading-5 text-ink-secondary">
          It may have been deleted, or it belongs to somebody else&apos;s account. Pick another chat
          from the list.
        </p>
        <Link
          href="/chats"
          className="mt-1 rounded-btn bg-brand px-4 py-2 text-[13px] font-medium text-white hover:bg-brand-hover"
        >
          Back to chats
        </Link>
      </div>
    );
  }

  if (!conversation) {
    if (conversationRow) {
      // the row is known (from the list) but the detail request is still in flight
      return (
        <div className="flex h-full items-center justify-center">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-brand" />
        </div>
      );
    }
    return <EmptyChatPane />;
  }

  const canSend =
    conversation.type === "direct" ||
    conversation.role === "admin" ||
    !conversation.only_admins_can_send;

  /* --- actions ---------------------------------------------------------- */
  const handleSend = (body: string) => {
    const clientId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const optimistic: Message = {
      id: -Date.now(),
      conversation_id: conversationId,
      sender_id: me?.id ?? null,
      sender_name: me?.display_name ?? null,
      client_id: clientId,
      kind: "text",
      body,
      system_event: null,
      system_payload: null,
      reply_to: replyTo
        ? {
            id: replyTo.id,
            sender_id: replyTo.sender_id,
            sender_name: replyTo.sender_id === me?.id ? "You" : replyTo.sender_name,
            body: replyTo.body,
          }
        : null,
      reactions: [],
      attachments: [],
      status: "sending",
      created_at: new Date().toISOString(),
      edited_at: null,
      deleted_at: null,
      expires_at: null,
    };

    addMessage(optimistic);
    socket.send("message.send", {
      conversation_id: conversationId,
      client_id: clientId,
      body,
      reply_to_id: replyTo?.id ?? null,
    });
    setReplyTo(null);

    // no ack within 10s -> offer a retry instead of silently losing the message
    setTimeout(() => {
      const current = (useMessagesStore.getState().byConversation[conversationId] ?? []).find(
        (message) => message.client_id === clientId,
      );
      if (current && current.status === "sending") {
        markFailed(clientId);
        toast("Message not delivered — tap retry", { tone: "error" });
      }
    }, 10_000);
  };

  const handleAttach = async (file: File) => {
    try {
      const message = await api.uploadAttachment(conversationId, file);
      addMessage(message);
      await refreshConversation();
    } catch (error) {
      toast((error as Error).message || "Upload failed", { tone: "error" });
    }
  };

  const handleReact = (message: Message, emoji: string | null) => {
    socket.send("reaction.set", { message_id: message.id, emoji });
  };

  const handleDelete = (message: Message, scope: "me" | "everyone") => {
    confirmDialog({
      title: scope === "everyone" ? "Delete for everyone" : "Delete for me",
      body:
        scope === "everyone"
          ? "This message will be replaced with a deleted-message notice for everyone in this chat."
          : "This message will be removed from your own devices.",
      confirmLabel: "Delete",
      destructive: true,
      onConfirm: async () => {
        await api.deleteMessage(message.id, scope);
        if (scope === "me") {
          useMessagesStore.getState().removeMessage(conversationId, message.id);
        } else {
          useMessagesStore.getState().updateMessage({
            ...message,
            body: null,
            deleted_at: new Date().toISOString(),
          });
        }
        void refreshConversation();
      },
    });
  };

  return (
    <div className="flex h-full min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col bg-chat">
        <ChatHeader conversation={conversation} onOpenDetails={() => setShowDetails(true)} />
        <MessageList
          conversation={conversation}
          highlightId={highlightId}
          onReply={(message) => {
            setReplyTo(message);
            setHighlightId(message.id);
            setTimeout(() => setHighlightId(null), 1200);
          }}
          onReact={handleReact}
          onDelete={handleDelete}
          onRetry={(message) => message.client_id && retryMessage(conversationId, message.client_id)}
        />
        <Composer
          conversationId={conversationId}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          onSend={handleSend}
          onAttach={handleAttach}
          disabled={!canSend}
          disabledReason="Only admins can send messages in this group."
        />
      </div>

      {showDetails && (
        <GroupDetailsDrawer
          conversation={conversation}
          onClose={() => setShowDetails(false)}
          onRefresh={refreshConversation}
        />
      )}
    </div>
  );
}
