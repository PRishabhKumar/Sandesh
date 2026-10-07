/**
 * Thin fetch wrapper around the FastAPI backend.
 *
 * Two things worth knowing:
 *  - `API_BASE` is empty in the default setup, so every request is *relative*
 *    ("/api/v1/...") and the Next.js dev server proxies it to FastAPI. In a
 *    split deployment you set NEXT_PUBLIC_API_URL and the same code works
 *    against the hosted backend (no CORS surprises in either case).
 *  - the JWT is kept in localStorage under one key; `authHeader()` is the only
 *    place that reads it, so swapping to httpOnly cookies later is a small
 *    change in one file.
 */

import type {
  AuthResult,
  Contact,
  Conversation,
  ConversationDetail,
  Me,
  Message,
  MessagePage,
  User,
  UserSettings,
} from "./types";

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api/v1";
/** Origin used to build absolute URLs for /uploads/... files. */
export const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN || "";

export const TOKEN_KEY = "signal_clone_token";

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

function authHeader(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Resolve a server-relative file path (/uploads/x.png) to a usable URL. */
export function fileUrl(path: string | null | undefined): string {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return `${API_ORIGIN}${path}`;
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  formData?: FormData;
  query?: Record<string, string | number | boolean | null | undefined>;
};

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, formData, query } = options;

  const url = new URL(`${API_BASE}${path}`, typeof window === "undefined" ? "http://localhost" : window.location.origin);
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    });
  }

  const headers: Record<string, string> = { ...authHeader() };
  if (!formData) headers["Content-Type"] = "application/json";

  const response = await fetch(url.toString(), {
    method,
    headers,
    body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    // The backend always answers with {"error": {"code", "message"}}.
    const error = payload?.error;
    throw new ApiError(response.status, error?.code ?? "request_failed", error?.message ?? response.statusText);
  }
  return payload as T;
}

/* --- endpoint helpers (one place to see the whole API surface) ----------- */
export const api = {
  // auth & onboarding
  requestOtp: (identifier: string) =>
    request<{ identifier: string; is_phone: boolean; expires_in_seconds: number; dev_code: string | null }>(
      "/auth/request-otp",
      { method: "POST", body: { identifier } },
    ),
  verifyOtp: (identifier: string, code: string) =>
    request<AuthResult>("/auth/verify-otp", { method: "POST", body: { identifier, code } }),
  saveProfile: (payload: { display_name: string; about?: string | null; avatar_color?: string | null }) =>
    request<User>("/auth/profile", { method: "POST", body: payload }),
  me: () => request<Me>("/auth/me"),
  logout: () => request<void>("/auth/logout", { method: "POST" }),

  // profile & contacts
  updateProfile: (payload: { display_name: string; about?: string | null; avatar_color?: string | null }) =>
    request<User>("/users/me", { method: "PATCH", body: payload }),
  uploadAvatar: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return request<User>("/users/me/avatar", { method: "POST", formData });
  },
  lookupUsers: (q: string) =>
    request<{ users: User[]; exact_match: User | null }>("/users/lookup", { query: { q } }),
  contacts: (q?: string) => request<Contact[]>("/contacts", { query: { q } }),
  addContact: (identifier: string, nickname?: string) =>
    request<Contact>("/contacts", { method: "POST", body: { identifier, nickname } }),
  removeContact: (id: number) => request<void>(`/contacts/${id}`, { method: "DELETE" }),
  blockContact: (id: number, blocked: boolean) =>
    request<Contact>(`/contacts/${id}/${blocked ? "block" : "unblock"}`, { method: "POST" }),

  // conversations
  conversations: (params: { q?: string; filter?: "all" | "unread" | "groups" } = {}) =>
    request<Conversation[]>("/conversations", { query: params }),
  conversation: (id: number) => request<ConversationDetail>(`/conversations/${id}`),
  openDirect: (userId: number) =>
    request<Conversation>("/conversations/direct", { method: "POST", body: { user_id: userId } }),
  patchMembership: (id: number, payload: { pinned?: boolean; muted?: boolean; archived?: boolean }) =>
    request<Conversation>(`/conversations/${id}/me`, { method: "PATCH", body: payload }),
  setDisappearing: (id: number, seconds: number) =>
    request<Conversation>(`/conversations/${id}/disappearing`, {
      method: "PATCH",
      body: { disappearing_secs: seconds },
    }),
  markRead: (id: number, upToMessageId: number) =>
    request<void>(`/conversations/${id}/read`, { method: "POST", body: { up_to_message_id: upToMessageId } }),

  // messages
  messages: (id: number, params: { before?: number; after?: number; limit?: number } = {}) =>
    request<MessagePage>(`/conversations/${id}/messages`, { query: params }),
  sendMessage: (id: number, body: string, clientId: string, replyToId?: number | null) =>
    request<Message>(`/conversations/${id}/messages`, {
      method: "POST",
      body: { body, client_id: clientId, reply_to_id: replyToId ?? null },
    }),
  uploadAttachment: (id: number, file: File, caption?: string) => {
    const formData = new FormData();
    formData.append("file", file);
    if (caption) formData.append("caption", caption);
    return request<Message>(`/conversations/${id}/attachments`, { method: "POST", formData });
  },
  deleteMessage: (id: number, scope: "me" | "everyone") =>
    request<void>(`/messages/${id}`, { method: "DELETE", query: { scope } }),
  react: (id: number, emoji: string | null) =>
    request<Message>(`/messages/${id}/reaction`, { method: "PUT", body: { emoji } }),

  // groups
  createGroup: (payload: {
    name: string;
    member_ids: number[];
    description?: string | null;
    avatar_color?: string | null;
    disappearing_secs?: number;
  }) => request<ConversationDetail>("/groups", { method: "POST", body: payload }),
  updateGroup: (
    id: number,
    payload: {
      name?: string;
      description?: string | null;
      members_can_add?: boolean;
      only_admins_can_send?: boolean;
    },
  ) => request<ConversationDetail>(`/groups/${id}`, { method: "PATCH", body: payload }),
  addGroupMembers: (id: number, userIds: number[]) =>
    request<ConversationDetail>(`/groups/${id}/members`, { method: "POST", body: { user_ids: userIds } }),
  removeGroupMember: (id: number, userId: number) =>
    request<void>(`/groups/${id}/members/${userId}`, { method: "DELETE" }),
  setMemberRole: (id: number, userId: number, role: "admin" | "member") =>
    request<ConversationDetail>(`/groups/${id}/members/${userId}`, { method: "PATCH", body: { role } }),

  // settings
  settings: () => request<UserSettings>("/settings"),
  updateSettings: (payload: Partial<UserSettings>) =>
    request<UserSettings>("/settings", { method: "PATCH", body: payload }),
};
