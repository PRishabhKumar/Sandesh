"use client";

/**
 * Wires every backend WebSocket event to the stores.
 *
 * This hook is the single place where "something happened on the server" turns
 * into UI state, which keeps components free of socket details. It is mounted
 * once, inside <Providers>.
 */

import { useEffect } from "react";

import { socket } from "@/lib/ws";
import { useAuthStore } from "@/stores/auth";
import { useConversationsStore } from "@/stores/conversations";
import { useMessagesStore } from "@/stores/messages";
import { usePresenceStore } from "@/stores/presence";
import { useUiStore } from "@/stores/ui";
import type {
  Message,
  WsConversationUpdated,
  WsError,
  WsGroupUpdated,
  WsMessageAck,
  WsMessageBatch,
  WsMessageDeleted,
  WsMessageNew,
  WsPresence,
  WsReceiptUpdate,
  WsTyping,
} from "@/lib/types";

/**
 * Tell the server we have seen everything up to this message.
 *
 * Read receipts are only sent while the tab is actually visible (an open tab in
 * the background is not "read"), which is what Signal does too - and the
 * backend decides whether a read receipt may be shown at all.
 */
export function sendReadReceipt(conversationId: number, upToMessageId: number) {
  if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
  socket.send("message.read", { conversation_id: conversationId, up_to_message_id: upToMessageId });
  useConversationsStore.getState().markReadLocally(conversationId);
}

export function useSocketEvents() {
  useEffect(() => {
    const messages = useMessagesStore.getState();
    const conversations = useConversationsStore.getState();
    const ui = useUiStore.getState();

    const unsubscribers = [
      /* --- outgoing message confirmed by the server (sending -> sent) ---- */
      socket.on<WsMessageAck>("message.ack", ({ data }) => {
        const pendingClientId = data.client_id;
        if (pendingClientId) {
          useMessagesStore.getState().replacePending(pendingClientId, data.message);
        } else {
          useMessagesStore.getState().addMessage(data.message);
        }
        useConversationsStore.getState().applyIncoming(data.message);
      }),

      /* --- a new message arrived ---------------------------------------- */
      socket.on<WsMessageNew>("message.new", ({ data }) => {
        const message = data.message as Message;
        useMessagesStore.getState().addMessage(message);
        useConversationsStore.getState().applyIncoming(message);

        const meId = useAuthStore.getState().user?.id;
        const isMine = message.sender_id === meId;
        const isOpen = useConversationsStore.getState().activeId === message.conversation_id;

        if (!isMine && isOpen) sendReadReceipt(message.conversation_id, message.id);

        if (!isMine && !isOpen) {
          // Lightweight notification: a toast, honouring the user's
          // "notification content" preference.
          const settings = useAuthStore.getState().settings;
          const conversation = useConversationsStore.getState().byId(message.conversation_id);
          if (settings?.notification_content !== "none" && !conversation?.muted) {
            const sender = settings?.notification_content === "name_only" ? "" : `: ${message.body ?? ""}`;
            ui.toast(`${message.sender_name ?? conversation?.title ?? "New message"}${sender}`);
          }
        }
      }),

      /* --- offline catch-up when a socket reconnects --------------------- */
      socket.on<WsMessageBatch>("message.batch", ({ data }) => {
        useMessagesStore.getState().addMessages(data.messages);
        const last = data.messages[data.messages.length - 1];
        if (last) useConversationsStore.getState().applyIncoming(last);

        const meId = useAuthStore.getState().user?.id;
        const openId = useConversationsStore.getState().activeId;
        const incoming = data.messages.filter(
          (message) => message.conversation_id === openId && message.sender_id !== meId,
        );
        if (incoming.length) {
          sendReadReceipt(openId!, incoming[incoming.length - 1].id);
        }
      }),

      /* --- delivered / read ticks --------------------------------------- */
      socket.on<WsReceiptUpdate>("receipt.update", ({ data }) => {
        useMessagesStore.getState().updateStatuses(data.conversation_id, data.message_ids, data.status);
      }),

      /* --- reactions (emoji on a message) ------------------------------ */
      socket.on<{ conversation_id: number; message: Message }>("message.reaction", ({ data }) => {
        useMessagesStore.getState().updateMessage(data.message);
      }),

      /* --- typing indicators -------------------------------------------- */
      socket.on<WsTyping>("typing", ({ data }) => {
        useMessagesStore.getState().setTyping(data.conversation_id, data.user_id, data.is_typing);
      }),

      /* --- presence ----------------------------------------------------- */
      socket.on<WsPresence>("presence", ({ data }) => {
        usePresenceStore
          .getState()
          .setPresence(data.user_id, { online: data.online, last_seen_at: data.last_seen_at });
      }),

      /* --- chat list row refresh (unread, last message, flags) ---------- */
      socket.on<WsConversationUpdated>("conversation.updated", ({ data }) => {
        useConversationsStore.getState().upsert(data.conversation);
      }),

      /* --- group membership changes ------------------------------------- */
      socket.on<WsGroupUpdated>("group.updated", ({ data }) => {
        if (data.message) useMessagesStore.getState().addMessage(data.message);
        void useConversationsStore.getState().load({ silent: true });
      }),

      socket.on<{ conversation_id: number; conversation_name: string | null }>(
        "removed.from_group",
        ({ data }) => {
          useConversationsStore.getState().remove(data.conversation_id);
          useMessagesStore.getState().removeMessage(data.conversation_id, -1);
          ui.toast(`You were removed from ${data.conversation_name ?? "the group"}`);
        },
      ),

      /* --- deletes and disappearing messages ---------------------------- */
      socket.on<WsMessageDeleted>("message.deleted", ({ data }) => {
        if (data.scope === "everyone") {
          // keep the row as a tombstone: "This message was deleted"
          useMessagesStore.getState().updateMessage({
            id: data.message_id,
            conversation_id: data.conversation_id,
            body: null,
            deleted_at: new Date().toISOString(),
          } as Message);
        } else {
          useMessagesStore.getState().removeMessage(data.conversation_id, data.message_id);
        }
      }),

      socket.on<{ conversation_id: number; message_id: number }>("message.expired", ({ data }) => {
        useMessagesStore.getState().removeMessage(data.conversation_id, data.message_id);
      }),

      /* --- errors ------------------------------------------------------- */
      socket.on<WsError>("error", ({ data }) => {
        if (data.code === "rate_limited") {
          ui.toast(data.message, { tone: "error" });
          return;
        }
        ui.toast(data.message, { tone: "error" });
      }),
    ];

    /* --- connection status -> toast + header indicator ------------------ */
    const unsubscribeStatus = socket.onStatusChange((status) => {
      useUiStore.getState().setConnection(status);
      if (status === "closed") useUiStore.getState().toast("Reconnecting…");
      if (status === "open") {
        // Re-sync the chat list after a reconnect; message catch-up is pushed
        // by the server as a `message.batch`.
        void useConversationsStore.getState().load({ silent: true });
      }
    });

    return () => {
      unsubscribers.forEach((off) => off());
      unsubscribeStatus();
      void messages;
      void conversations;
    };
  }, []);
}
