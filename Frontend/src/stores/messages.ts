"use client";

/**
 * Messages, per conversation.
 *
 * Key behaviours:
 *  - **Optimistic sends.** A message is inserted immediately with a client_id
 *    and status "sending"; `message.ack` swaps it for the server row (matched by
 *    client_id, so the same message never renders twice).
 *  - **Cursor pagination.** Newest page loads first; `loadOlder` walks backwards
 *    with the `next_cursor` the API returns.
 *  - **Typing** is kept here as a per-conversation set of user ids with
 *    auto-expiry timers (typing is ephemeral - the server never stores it).
 */

import { create } from "zustand";

import { api } from "@/lib/api";
import { parseUtc } from "@/lib/format";
import type { Message, MessageStatus } from "@/lib/types";

const TYPING_TTL_MS = 6000;

type MessagesState = {
  byConversation: Record<number, Message[]>;
  cursors: Record<number, number | null>;
  hasMore: Record<number, boolean>;
  loading: Record<number, boolean>;
  typing: Record<number, Record<number, number>>; // conversationId -> userId -> expiresAt

  loadInitial: (conversationId: number) => Promise<void>;
  loadOlder: (conversationId: number) => Promise<void>;
  addMessage: (message: Message) => void;
  addMessages: (messages: Message[]) => void;
  replacePending: (clientId: string, message: Message) => void;
  markFailed: (clientId: string) => void;
  updateStatuses: (conversationId: number, ids: number[], status: MessageStatus) => void;
  updateMessage: (message: Message) => void;
  removeMessage: (conversationId: number, messageId: number) => void;
  setTyping: (conversationId: number, userId: number, isTyping: boolean) => void;
  typingUserIds: (conversationId: number) => number[];
  retryMessage: (conversationId: number, clientId: string) => Promise<void>;
  reset: () => void;
};

function sortMessages(messages: Message[]): Message[] {
  return [...messages].sort((a, b) => {
    // server ids order definitively; pending (optimistic) messages sit at the end
    if (a.id > 0 && b.id > 0) return a.id - b.id;
    const aTime = parseUtc(a.created_at)?.getTime() ?? 0;
    const bTime = parseUtc(b.created_at)?.getTime() ?? 0;
    return aTime - bTime;
  });
}

export const useMessagesStore = create<MessagesState>((set, get) => ({
  byConversation: {},
  cursors: {},
  hasMore: {},
  loading: {},
  typing: {},

  loadInitial: async (conversationId) => {
    if (get().byConversation[conversationId]?.length) return; // already cached
    set((state) => ({ loading: { ...state.loading, [conversationId]: true } }));
    try {
      const page = await api.messages(conversationId, { limit: 50 });
      set((state) => ({
        byConversation: { ...state.byConversation, [conversationId]: page.messages },
        cursors: { ...state.cursors, [conversationId]: page.next_cursor },
        hasMore: { ...state.hasMore, [conversationId]: page.has_more },
        loading: { ...state.loading, [conversationId]: false },
      }));
    } catch {
      set((state) => ({ loading: { ...state.loading, [conversationId]: false } }));
    }
  },

  loadOlder: async (conversationId) => {
    const cursor = get().cursors[conversationId];
    if (!cursor || get().loading[conversationId]) return;
    set((state) => ({ loading: { ...state.loading, [conversationId]: true } }));
    try {
      const page = await api.messages(conversationId, { before: cursor, limit: 50 });
      set((state) => ({
        byConversation: {
          ...state.byConversation,
          [conversationId]: sortMessages([...page.messages, ...(state.byConversation[conversationId] ?? [])]),
        },
        cursors: { ...state.cursors, [conversationId]: page.next_cursor },
        hasMore: { ...state.hasMore, [conversationId]: page.has_more },
        loading: { ...state.loading, [conversationId]: false },
      }));
    } catch {
      set((state) => ({ loading: { ...state.loading, [conversationId]: false } }));
    }
  },

  addMessage: (message) =>
    set((state) => {
      const existing = state.byConversation[message.conversation_id] ?? [];
      if (message.id > 0 && existing.some((item) => item.id === message.id)) return state;

      // A pending optimistic message with the same client_id is replaced by the
      // server row - this is what makes the ack invisible to the user.
      const withoutPending = message.client_id
        ? existing.filter((item) => item.client_id !== message.client_id || item.id > 0)
        : existing;

      return {
        byConversation: {
          ...state.byConversation,
          [message.conversation_id]: sortMessages([...withoutPending, message]),
        },
      };
    }),

  addMessages: (messages) =>
    set((state) => {
      const next = { ...state.byConversation };
      messages.forEach((message) => {
        const existing = next[message.conversation_id] ?? [];
        if (existing.some((item) => item.id === message.id)) return;
        const filtered = message.client_id
          ? existing.filter((item) => item.client_id !== message.client_id)
          : existing;
        next[message.conversation_id] = sortMessages([...filtered, message]);
      });
      return { byConversation: next };
    }),

  replacePending: (clientId, message) =>
    set((state) => {
      const existing = state.byConversation[message.conversation_id] ?? [];
      return {
        byConversation: {
          ...state.byConversation,
          [message.conversation_id]: sortMessages([
            ...existing.filter((item) => item.client_id !== clientId),
            message,
          ]),
        },
      };
    }),

  markFailed: (clientId) =>
    set((state) => ({
      byConversation: Object.fromEntries(
        Object.entries(state.byConversation).map(([key, messages]) => [
          key,
          messages.map((message) =>
            message.client_id === clientId ? { ...message, status: "failed" as MessageStatus } : message,
          ),
        ]),
      ),
    })),

  updateStatuses: (conversationId, ids, status) =>
    set((state) => {
      const existing = state.byConversation[conversationId];
      if (!existing) return state;
      const idSet = new Set(ids);
      return {
        byConversation: {
          ...state.byConversation,
          [conversationId]: existing.map((message) =>
            idSet.has(message.id) ? { ...message, status } : message,
          ),
        },
      };
    }),

  updateMessage: (message) =>
    set((state) => {
      const existing = state.byConversation[message.conversation_id];
      if (!existing) return state;
      return {
        byConversation: {
          ...state.byConversation,
          [message.conversation_id]: existing.map((item) =>
            item.id === message.id ? message : item,
          ),
        },
      };
    }),

  removeMessage: (conversationId, messageId) =>
    set((state) => {
      const existing = state.byConversation[conversationId];
      if (!existing) return state;
      return {
        byConversation: {
          ...state.byConversation,
          [conversationId]: existing.filter((message) => message.id !== messageId),
        },
      };
    }),

  setTyping: (conversationId, userId, isTyping) =>
    set((state) => {
      const room = { ...(state.typing[conversationId] ?? {}) };
      if (isTyping) room[userId] = Date.now() + TYPING_TTL_MS;
      else delete room[userId];
      return { typing: { ...state.typing, [conversationId]: room } };
    }),

  typingUserIds: (conversationId) => {
    const room = get().typing[conversationId] ?? {};
    const now = Date.now();
    return Object.entries(room)
      .filter(([, expiresAt]) => expiresAt > now)
      .map(([userId]) => Number(userId));
  },

  retryMessage: async (conversationId, clientId) => {
    const message = (get().byConversation[conversationId] ?? []).find(
      (item) => item.client_id === clientId,
    );
    if (!message) return;
    const { socket } = await import("@/lib/ws");
    set((state) => ({
      byConversation: {
        ...state.byConversation,
        [conversationId]: (state.byConversation[conversationId] ?? []).map((item) =>
          item.client_id === clientId ? { ...item, status: "sending" as MessageStatus } : item,
        ),
      },
    }));
    socket.send("message.send", {
      conversation_id: conversationId,
      client_id: clientId,
      body: message.body,
      reply_to_id: message.reply_to?.id ?? null,
    });
  },

  reset: () => set({ byConversation: {}, cursors: {}, hasMore: {}, loading: {}, typing: {} }),
}));
