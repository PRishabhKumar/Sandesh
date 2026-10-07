"use client";

/**
 * Global keyboard shortcuts (bonus feature):
 *
 *   Ctrl/Cmd + N        new chat
 *   Ctrl/Cmd + Shift+G  new group
 *   Ctrl/Cmd + F        focus the search field
 *   Ctrl/Cmd + ,        settings
 *   Alt + ↑ / ↓         previous / next conversation
 *   Esc                 close modal / clear search
 *   ?                   shortcut cheat-sheet
 *
 * Handlers ignore events typed inside inputs unless the shortcut is a
 * modifier combination, so ordinary typing is never hijacked.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useConversationsStore } from "@/stores/conversations";
import { useUiStore } from "@/stores/ui";

export function useKeyboardShortcuts() {
  const router = useRouter();

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typingInField =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      const mod = event.ctrlKey || event.metaKey;

      if (mod && event.key.toLowerCase() === "n" && !event.shiftKey) {
        event.preventDefault();
        useUiStore.getState().openModal("new-chat");
        return;
      }
      if (mod && event.shiftKey && event.key.toLowerCase() === "g") {
        event.preventDefault();
        useUiStore.getState().openModal("new-group");
        return;
      }
      if (mod && event.key === "f") {
        event.preventDefault();
        document.getElementById("conversation-search")?.focus();
        return;
      }
      if (mod && event.key === ",") {
        event.preventDefault();
        router.push("/settings");
        return;
      }
      if (event.altKey && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
        event.preventDefault();
        const store = useConversationsStore.getState();
        const rows = store.visible();
        if (!rows.length) return;
        const index = rows.findIndex((row) => row.id === store.activeId);
        const next =
          event.key === "ArrowDown"
            ? rows[Math.min(index + 1, rows.length - 1)]
            : rows[Math.max(index - 1, 0)];
        if (next && next.id !== store.activeId) {
          store.setActive(next.id);
          router.push(`/chats/${next.id}`);
          useUiStore.getState().setMobilePane("chat");
        }
        return;
      }
      if (event.key === "Escape" && !typingInField) {
        const ui = useUiStore.getState();
        if (ui.modal.name) {
          ui.closeModal();
        } else {
          useConversationsStore.getState().setQuery("");
        }
        return;
      }
      if (event.key === "?" && !typingInField) {
        event.preventDefault();
        useUiStore.getState().openModal("shortcuts");
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [router]);
}
