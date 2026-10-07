"use client";

/**
 * Who is online and when everyone else was last seen.
 *
 * The live part comes from `presence` WebSocket events, which the backend
 * broadcasts to everyone who shares a conversation with the user.
 */

import { create } from "zustand";

type PresenceInfo = { online: boolean; last_seen_at: string | null };

type PresenceState = {
  byUser: Record<number, PresenceInfo>;
  setPresence: (userId: number, info: Partial<PresenceInfo>) => void;
  isOnline: (userId: number | null | undefined) => boolean;
  reset: () => void;
};

export const usePresenceStore = create<PresenceState>((set, get) => ({
  byUser: {},

  setPresence: (userId, info) =>
    set((state) => {
      const existing: PresenceInfo = state.byUser[userId] ?? { online: false, last_seen_at: null };
      return { byUser: { ...state.byUser, [userId]: { ...existing, ...info } } };
    }),

  isOnline: (userId) => {
    if (!userId) return false;
    return get().byUser[userId]?.online ?? false;
  },

  reset: () => set({ byUser: {} }),
}));
