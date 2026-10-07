"use client";

/**
 * Session state: who is signed in and what their settings are.
 *
 * `hydrate()` runs once on app start and is what makes a refresh keep you
 * logged in: the JWT is in localStorage, the API call turns it into a user.
 */

import { create } from "zustand";

import { api, getToken, setToken } from "@/lib/api";
import { socket } from "@/lib/ws";
import type { AuthResult, User, UserSettings } from "@/lib/types";

type AuthState = {
  user: User | null;
  settings: UserSettings | null;
  ready: boolean;
  hydrate: () => Promise<void>;
  acceptSession: (result: AuthResult) => void;
  setUser: (user: User) => void;
  updateSettings: (patch: Partial<UserSettings>) => Promise<void>;
  logout: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  settings: null,
  ready: false,

  hydrate: async () => {
    if (!getToken()) {
      set({ user: null, settings: null, ready: true });
      return;
    }
    try {
      const me = await api.me();
      set({ user: me.user, settings: me.settings, ready: true });
      socket.connect();
    } catch {
      // Expired or tampered token: start over at the welcome screen.
      setToken(null);
      set({ user: null, settings: null, ready: true });
    }
  },

  acceptSession: (result) => {
    setToken(result.token);
    set({ user: result.user, ready: true });
    socket.connect();
  },

  setUser: (user) => set({ user }),

  updateSettings: async (patch) => {
    const current = get().settings;
    if (!current) return;
    // optimistic: the switch flips immediately, the server confirms after
    set({ settings: { ...current, ...patch } });
    try {
      const saved = await api.updateSettings(patch);
      set({ settings: saved });
    } catch {
      set({ settings: current });
    }
  },

  logout: async () => {
    try {
      await api.logout();
    } catch {
      // Signing out locally must work even if the network is down.
    }
    socket.disconnect();
    setToken(null);
    set({ user: null, settings: null });
  },
}));
