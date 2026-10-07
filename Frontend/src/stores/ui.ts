"use client";

/**
 * UI state that is not tied to the server: theme, toasts, modals, the mobile
 * pane, and the WebSocket connection indicator.
 */

import { create } from "zustand";

import type { ConnectionStatus } from "@/lib/ws";

export type Toast = {
  id: number;
  message: string;
  tone?: "default" | "error" | "success";
  action?: { label: string; run: () => void };
};

export type ModalName =
  | "new-chat"
  | "new-group"
  | "add-contact"
  | "add-members"
  | "disappearing"
  | "group-details"
  | "confirm"
  | "coming-soon"
  | "safety-number"
  | "shortcuts"
  | null;

type ConfirmPayload = {
  title: string;
  body: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
};

type UiState = {
  themePreference: "system" | "light" | "dark";
  resolvedTheme: "light" | "dark";
  modal: { name: ModalName; payload?: unknown };
  toasts: Toast[];
  mobilePane: "list" | "chat";
  connection: ConnectionStatus;
  setTheme: (preference: "system" | "light" | "dark") => void;
  applyTheme: (preference?: "system" | "light" | "dark") => void;
  openModal: (name: ModalName, payload?: unknown) => void;
  closeModal: () => void;
  confirm: (payload: ConfirmPayload) => void;
  toast: (message: string, options?: Omit<Toast, "id" | "message">) => void;
  dismissToast: (id: number) => void;
  setMobilePane: (pane: "list" | "chat") => void;
  setConnection: (status: ConnectionStatus) => void;
};

const THEME_KEY = "signal_clone_theme";

function systemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export const useUiStore = create<UiState>((set, get) => ({
  themePreference: "system",
  resolvedTheme: "light",
  modal: { name: null },
  toasts: [],
  mobilePane: "list",
  connection: "idle",

  setTheme: (preference) => {
    if (typeof window !== "undefined") window.localStorage.setItem(THEME_KEY, preference);
    get().applyTheme(preference);
  },

  /** Writes data-theme on <html> - the whole dark mode is this one attribute. */
  applyTheme: (preference) => {
    const chosen = preference ?? (typeof window !== "undefined"
      ? (window.localStorage.getItem(THEME_KEY) as UiState["themePreference"] | null)
      : null) ?? "system";
    const resolved = chosen === "system" ? systemTheme() : chosen;
    if (typeof document !== "undefined") {
      document.documentElement.dataset.theme = resolved;
    }
    set({ themePreference: chosen, resolvedTheme: resolved });
  },

  openModal: (name, payload) => set({ modal: { name, payload } }),
  closeModal: () => set({ modal: { name: null } }),

  confirm: (payload) => set({ modal: { name: "confirm", payload } }),

  toast: (message, options) => {
    const id = Date.now() + Math.random();
    set((state) => ({ toasts: [...state.toasts, { id, message, ...options }].slice(-3) }));
    setTimeout(() => get().dismissToast(id), 4000);
  },

  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),

  setMobilePane: (pane) => set({ mobilePane: pane }),
  setConnection: (status) => set({ connection: status }),
}));
