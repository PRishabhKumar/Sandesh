/**
 * Formatting helpers.
 *
 * The backend stores naive UTC timestamps (SQLite has no timezone type), so
 * every date string is normalised here - `parseUtc` is the one place that
 * knows about the missing "Z".
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Backend ISO string (UTC without "Z") -> local Date. */
export function parseUtc(value: string | null | undefined): Date | null {
  if (!value) return null;
  const normalised = /Z$|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}Z`;
  const date = new Date(normalised);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** "4:12 PM" */
export function formatTime(value: string | Date | null | undefined): string {
  const date = value instanceof Date ? value : parseUtc(value);
  if (!date) return "";
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** Chat-list timestamp: time today, "Yesterday", weekday, or a date. */
export function formatListTimestamp(value: string | null | undefined): string {
  const date = parseUtc(value);
  if (!date) return "";
  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / DAY_MS);
  if (days <= 0) return formatTime(date);
  if (days === 1) return "Yesterday";
  if (days < 7) return date.toLocaleDateString(undefined, { weekday: "short" });
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** Day separator above a group of bubbles: "Today", "Yesterday", "Mon, 4 Aug". */
export function formatDayLabel(value: string | null | undefined): string {
  const date = parseUtc(value);
  if (!date) return "";
  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / DAY_MS);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return date.toLocaleDateString(undefined, { weekday: "long" });
  return date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

/** "Last seen today at 4:12 PM" */
export function formatLastSeen(value: string | null | undefined): string {
  const date = parseUtc(value);
  if (!date) return "Offline";
  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / DAY_MS);
  if (days <= 0) return `Last seen today at ${formatTime(date)}`;
  if (days === 1) return `Last seen yesterday at ${formatTime(date)}`;
  return `Last seen ${date.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
}

/** Seconds -> "1 hour" (disappearing-message labels). */
export function formatDuration(seconds: number): string {
  const units: Array<[number, string]> = [
    [604800, "week"],
    [86400, "day"],
    [3600, "hour"],
    [60, "minute"],
  ];
  for (const [size, label] of units) {
    if (seconds >= size && seconds % size === 0) {
      const count = seconds / size;
      return `${count} ${label}${count > 1 ? "s" : ""}`;
    }
  }
  return `${seconds} seconds`;
}

/** Countdown shown on a disappearing bubble: "23s", "4m", "2h". */
export function formatCountdown(expiresAt: string | null): string {
  const date = parseUtc(expiresAt);
  if (!date) return "";
  const remaining = Math.max(0, Math.round((date.getTime() - Date.now()) / 1000));
  if (remaining < 60) return `${remaining}s`;
  if (remaining < 3600) return `${Math.round(remaining / 60)}m`;
  if (remaining < 86400) return `${Math.round(remaining / 3600)}h`;
  return `${Math.round(remaining / 86400)}d`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "Aarav Sharma" -> "AS"; single word -> first two letters. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/** "Aarav Sharma, Meera Iyer and Kabir Nair" (system messages). */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * System messages are stored as third-person English ("Aarav added Meera").
 * Signal says "You added Meera", so the actor's name is swapped for "You"
 * when it is the signed-in user, using the structured payload from the API.
 */
export function renderSystemMessage(
  body: string | null,
  payload: { actor_id?: number; target_ids?: number[]; value?: string | number } | null,
  meId: number | undefined,
  nameOf: (userId: number) => string,
): string {
  if (!body) return "";
  let text = body;

  if (payload?.target_ids?.length) {
    const names = payload.target_ids.map(nameOf).filter(Boolean);
    if (names.length) {
      const original = new RegExp(names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"));
      text = text.replace(original, (match) => match); // keep the sentence intact
    }
  }

  if (payload?.actor_id && payload.actor_id === meId) {
    // Replace the leading actor name with "You".
    const actorName = nameOf(payload.actor_id);
    if (actorName && text.startsWith(actorName)) {
      text = `You${text.slice(actorName.length)}`;
    }
  }
  if (payload?.target_ids?.includes(meId ?? -1)) {
    const myName = nameOf(meId!);
    if (myName) text = text.replace(myName, "you");
  }
  return text;
}
