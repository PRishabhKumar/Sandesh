"use client";

import { Modal } from "@/components/ui/Modal";

const SHORTCUTS: Array<[string, string]> = [
  ["Ctrl / ⌘ + N", "New chat"],
  ["Ctrl / ⌘ + Shift + G", "New group"],
  ["Ctrl / ⌘ + F", "Search chats"],
  ["Ctrl / ⌘ + ,", "Open settings"],
  ["Alt + ↑ / ↓", "Previous / next conversation"],
  ["Enter", "Send message"],
  ["Shift + Enter", "New line"],
  ["Esc", "Close dialog or clear search"],
  ["?", "Show this list"],
];

/** Keyboard cheat-sheet (press "?" anywhere outside a text field). */
export function ShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} title="Keyboard shortcuts" onClose={onClose}>
      <ul className="divide-y divide-line">
        {SHORTCUTS.map(([keys, description]) => (
          <li key={keys} className="flex items-center justify-between py-2.5">
            <span className="text-[14px] text-ink">{description}</span>
            <kbd className="rounded bg-field px-2 py-1 font-mono text-[12px] text-ink-secondary">{keys}</kbd>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
