/**
 * Colours for avatars and group sender names.
 *
 * Avatar colours come from the database (`users.avatar_color`), which only
 * stores the background - the matching foreground is looked up here. Sender
 * name colours are derived from the user id so everybody sees the same person
 * in the same colour, and the palette is tuned to stay readable on both the
 * light (#E9E9E9) and dark (#3B3B3B) incoming bubble.
 */

const AVATAR_FOREGROUND: Record<string, string> = {
  "#E3F2FD": "#1565C0",
  "#F3E5F5": "#6A1B9A",
  "#E8F5E9": "#2E7D32",
  "#FFF3E0": "#E65100",
  "#FCE4EC": "#AD1457",
  "#E0F7FA": "#00838F",
  "#EDE7F6": "#4527A0",
  "#FFFDE7": "#9E7B00",
};

export const AVATAR_BACKGROUNDS = Object.keys(AVATAR_FOREGROUND);

export function avatarForeground(background: string | null | undefined): string {
  if (!background) return "#1565C0";
  return AVATAR_FOREGROUND[background] ?? "#37474F";
}

/** Group name colours - 8 hues, stable per user id, AA on grey bubbles. */
const NAME_COLORS = [
  "#1E6FBF",
  "#8E24AA",
  "#2E7D32",
  "#C62828",
  "#00695C",
  "#4527A0",
  "#AD1457",
  "#EF6C00",
];

export function nameColor(userId: number | null | undefined): string {
  if (userId === null || userId === undefined) return NAME_COLORS[0];
  return NAME_COLORS[Math.abs(userId) % NAME_COLORS.length];
}

/** Deterministic avatar colour when the backend has none. */
export function fallbackAvatarColor(id: number): string {
  return AVATAR_BACKGROUNDS[Math.abs(id) % AVATAR_BACKGROUNDS.length];
}
