"use client";

/**
 * The chat list.
 *
 * The list is *server ordered* (pinned first, then most recent activity) and
 * cached here so WebSocket events can patch a single row instead of refetching
 * everything: `message.new` bumps a row to the top, `receipt.update` changes
 * the tick, `conversation.updated` replaces the whole row.
 */

import { create } from "zustand";

import { api } from "@/lib/api";
import { parseUtc } from "@/lib/format";
import type { Conversation, Message } from "@/lib/types";
import { useAuthStore } from "@/stores/auth";

type Filter = "all" | "unread" | "groups";

type ConversationsState = {
  items: Conversation[];
  activeId: number | null;
  filter: Filter;
  query: string;
  loading: boolean;
  loaded: boolean;
  load: (options?: { silent?: boolean }) => Promise<void>;
  setActive: (id: number | null) => void;
  setFilter: (filter: Filter) => void;
  setQuery: (query: string) => void;
  upsert: (conversation: Conversation) => void;
  remove: (id: number) => void;
  markReadLocally: (id: number) => void;
  applyIncoming: (message: Message) => void;
  visible: () => Conversation[];
  byId: (id: number) => Conversation | undefined;
};

/** pinned first, then newest activity (matches the SQL ordering) */
function sortConversations(items: Conversation[]): Conversation[] {
  return [...items].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const aTime = parseUtc(a.last_message_at)?.getTime() ?? 0;
    const bTime = parseUtc(b.last_message_at)?.getTime() ?? 0;
    return bTime - aTime;
  });
}

export const useConversationsStore = create<ConversationsState>((set, get) => ({
  items: [],
  activeId: null,
  filter: "all",
  query: "",
  loading: false,
  loaded: false,

  load: async (options = {}) => {
    if (!options.silent) set({ loading: true });
    try {
      const items = await api.conversations();
      set({ items: sortConversations(items), loading: false, loaded: true });
    } catch {
      set({ loading: false });
    }
  },

  setActive: (id) => set({ activeId: id }),
  setFilter: (filter) => set({ filter }),
  setQuery: (query) => set({ query }),

  upsert: (conversation) =>
    set((state) => {
      const exists = state.items.some((item) => item.id === conversation.id);
      const items = exists
        ? state.items.map((item) => (item.id === conversation.id ? conversation : item))
        : [...state.items, conversation];
      return { items: sortConversations(items) };
    }),

  remove: (id) =>
    set((state) => ({
      items: state.items.filter((item) => item.id !== id),
      activeId: state.activeId === id ? null : state.activeId,
    })),

  markReadLocally: (id) =>
    set((state) => ({
      items: state.items.map((item) => (item.id === id ? { ...item, unread_count: 0 } : item)),
    })),

  /**
   * A message arrived: update the row's preview + timestamp, bump it to the top
   * and raise the unread badge - unless it is my own message (multi-tab sync)
   * or the conversation is the one I am looking at right now.
   */
  applyIncoming: (message) =>
    set((state) => {
      const myId = useAuthStore.getState().user?.id;
      const isMine = message.sender_id != null && message.sender_id === myId;
      const isOpen = state.activeId === message.conversation_id;

      const items = state.items.map((item) => {
        if (item.id !== message.conversation_id) return item;
        const shouldCount = message.kind !== "system" && !isMine && !isOpen;
        return {
          ...item,
          last_message: message,
          last_message_at: message.created_at,
          unread_count: shouldCount ? item.unread_count + 1 : isOpen ? 0 : item.unread_count,
        };
      });

      return { items: sortConversations(items) };
    }),

  visible: () => {
    const { items, filter, query } = get();
    let rows = items;
    if (filter === "unread") rows = rows.filter((row) => row.unread_count > 0);
    if (filter === "groups") rows = rows.filter((row) => row.type === "group");
    const needle = query.trim().toLowerCase();
    if (needle) {
      rows = rows.filter(
        (row) =>
          row.title.toLowerCase().includes(needle) ||
          (row.last_message?.body ?? "").toLowerCase().includes(needle),
      );
    }
    return rows;
  },

  byId: (id) => get().items.find((item) => item.id === id),
}));
