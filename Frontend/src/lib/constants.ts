/** Shared constants: copy, timers, emoji. */

export const DISAPPEARING_OPTIONS: Array<{ seconds: number; label: string }> = [
  { seconds: 0, label: "Off" },
  { seconds: 30, label: "30 seconds" },
  { seconds: 300, label: "5 minutes" },
  { seconds: 3600, label: "1 hour" },
  { seconds: 28800, label: "8 hours" },
  { seconds: 86400, label: "1 day" },
  { seconds: 604800, label: "1 week" },
];

export const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

export const EMOJI_PICKER = [
  "😀", "😂", "🥰", "😎", "🤔", "🙌", "👍", "👏", "🙏", "🔥",
  "🎉", "❤️", "💯", "✅", "⚠️", "☕", "🌟", "🚀", "📌", "🎧",
];

export const FILTERS: Array<{ id: "all" | "unread" | "groups"; label: string }> = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "groups", label: "Groups" },
];

export const COPY = {
  emptyList: "No chats yet. Tap the compose button to say hello.",
  emptyChat: "Select a conversation to start messaging.",
  encryption: "Messages are end-to-end encrypted. (Simulated in this demo.)",
  typing: "typing…",
  online: "Online",
  comingSoon: "Coming soon — this feature isn't part of the demo.",
  reconnecting: "Reconnecting…",
  backOnline: "Back online",
  safetyNumberNote:
    "Safety numbers let two people verify their conversation is secure. In this clone the numbers are simulated - there is no real key exchange.",
};

export const VERSION_LABEL = "Signal Clone · 1.0.0 (evaluation build)";

/** Stable empty array - never write `x ?? []` inside a store selector: a new
 *  array every render makes useSyncExternalStore loop forever. */
export const EMPTY_MESSAGES: never[] = [];
