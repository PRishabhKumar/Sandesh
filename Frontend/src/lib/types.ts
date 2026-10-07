/**
 * TypeScript mirror of the backend DTOs (app/schemas/*.py).
 *
 * Keeping them in one file means a change on the API side has exactly one
 * place to be reflected on the client, and every component gets autocomplete
 * for the fields it renders.
 */

export type ConversationType = "direct" | "group";
export type MessageKind = "text" | "attachment" | "system";
export type MessageStatus = "sending" | "sent" | "delivered" | "read" | "failed";
export type Theme = "system" | "light" | "dark";
export type NotificationContent = "name_and_message" | "name_only" | "none";

export interface User {
  id: number;
  username: string | null;
  phone_number: string | null;
  display_name: string;
  about: string | null;
  avatar_url: string | null;
  avatar_color: string | null;
  last_seen_at: string | null;
  created_at: string;
}

export interface UserSettings {
  read_receipts: boolean;
  typing_indicators: boolean;
  show_last_seen: boolean;
  theme: Theme;
  notification_content: NotificationContent;
  default_disappearing_secs: number;
}

export interface Reaction {
  emoji: string;
  user_id: number;
}

export interface Attachment {
  id: number;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  url: string;
}

export interface ReplyPreview {
  id: number;
  sender_id: number | null;
  sender_name: string | null;
  body: string | null;
}

/** System-message detail, e.g. {actor_id, target_ids:[..], value} */
export interface SystemPayload {
  actor_id?: number;
  target_ids?: number[];
  value?: string | number;
}

export interface Message {
  id: number;
  conversation_id: number;
  sender_id: number | null;
  sender_name: string | null;
  client_id: string | null;
  kind: MessageKind;
  body: string | null;
  system_event: string | null;
  system_payload: SystemPayload | null;
  reply_to: ReplyPreview | null;
  reactions: Reaction[];
  attachments: Attachment[];
  status: MessageStatus;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  expires_at: string | null;
}

export interface MessagePage {
  messages: Message[];
  next_cursor: number | null;
  has_more: boolean;
}

export interface Member {
  user: User;
  role: "admin" | "member";
  joined_at: string;
  last_read_message_id: number | null;
}

export interface Conversation {
  id: number;
  type: ConversationType;
  title: string;
  avatar_url: string | null;
  avatar_color: string | null;
  about: string | null;
  peer: User | null;
  member_count: number;
  last_message: Message | null;
  last_message_at: string | null;
  unread_count: number;
  pinned: boolean;
  muted: boolean;
  archived: boolean;
  role: "admin" | "member" | null;
  disappearing_secs: number;
  members_can_add: boolean;
  only_admins_can_send: boolean;
  is_online: boolean;
}

export interface ConversationDetail extends Conversation {
  members: Member[];
}

export interface Contact {
  id: number;
  user: User;
  nickname: string | null;
  blocked: boolean;
  created_at: string;
}

export interface Me {
  user: User;
  settings: UserSettings;
}

export interface AuthResult {
  token: string;
  user: User;
  is_new: boolean;
  needs_profile: boolean;
}

/* --- WebSocket events ---------------------------------------------------- */

export interface WsEnvelope<T = unknown> {
  type: string;
  data: T;
}

export interface WsMessageNew {
  message: Message;
}
export interface WsMessageBatch {
  messages: Message[];
}
export interface WsMessageAck {
  client_id: string | null;
  message: Message;
}
export interface WsReceiptUpdate {
  conversation_id: number;
  message_ids: number[];
  status: Exclude<MessageStatus, "sending" | "failed">;
}
export interface WsTyping {
  conversation_id: number;
  user_id: number;
  is_typing: boolean;
}
export interface WsPresence {
  user_id: number;
  online: boolean;
  last_seen_at: string | null;
}
export interface WsConversationUpdated {
  conversation: Conversation;
}
export interface WsGroupUpdated {
  conversation_id: number;
  event: string;
  message: Message | null;
}
export interface WsMessageDeleted {
  conversation_id: number;
  message_id: number;
  scope: "me" | "everyone";
}
export interface WsError {
  code: string;
  message: string;
  ref_id?: string;
}
