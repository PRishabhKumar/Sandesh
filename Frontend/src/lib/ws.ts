/**
 * The WebSocket client.
 *
 * One socket per tab, owned by this singleton so any component can
 * `socket.send(...)` without prop-drilling a connection around.
 *
 * Behaviour that matters:
 *  - **Reconnect with backoff** 1s -> 2s -> 4s ... capped at 30s, plus a
 *    "reconnecting"/"online" status the UI shows as a toast.
 *  - **Offline queue**: sends made while the socket is down are buffered and
 *    flushed on reconnect. Combined with the server-side `client_id`
 *    idempotency, a retried send can never duplicate a message.
 *  - **Heartbeat** every 25s so proxies do not close an idle connection.
 *  - Events are dispatched to subscribers by type; `on()` returns an
 *    unsubscribe function so React effects stay clean.
 */

import { API_BASE, API_ORIGIN, getToken } from "./api";
import type { WsEnvelope } from "./types";

export type ConnectionStatus = "idle" | "connecting" | "open" | "closed";

type Handler = (envelope: WsEnvelope<unknown>) => void;

const HEARTBEAT_MS = 25_000;
const MAX_BACKOFF_MS = 30_000;

function wsUrl(token: string): string {
  const explicit = process.env.NEXT_PUBLIC_WS_URL;
  if (explicit) return `${explicit}?token=${encodeURIComponent(token)}`;

  // Same-origin by default: the Next.js dev server proxies /ws to FastAPI.
  const base = API_ORIGIN || (typeof window !== "undefined" ? window.location.origin : "");
  const origin = base ? base.replace(/^http/, "ws") : "";
  if (origin) return `${origin}/ws?token=${encodeURIComponent(token)}`;

  // Still need a URL: derive it from the API base (absolute deployments).
  const apiOrigin = API_BASE.replace(/\/api\/v1\/?$/, "").replace(/^http/, "ws");
  return `${apiOrigin}/ws?token=${encodeURIComponent(token)}`;
}

class SocketClient {
  private socket: WebSocket | null = null;
  private handlers = new Map<string, Set<Handler>>();
  private statusHandlers = new Set<(status: ConnectionStatus) => void>();
  private queue: string[] = [];
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private retry = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private manualClose = false;

  status: ConnectionStatus = "idle";
  lastMessageAt: number | null = null;

  /* --- lifecycle ------------------------------------------------------- */
  connect() {
    const token = getToken();
    if (!token) return;
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.manualClose = false;
    this.setStatus("connecting");

    const socket = new WebSocket(wsUrl(token));
    this.socket = socket;

    socket.onopen = () => {
      this.retry = 0;
      this.setStatus("open");
      this.startHeartbeat();
      this.flushQueue();
    };

    socket.onmessage = (event) => {
      this.lastMessageAt = Date.now();
      let envelope: WsEnvelope;
      try {
        envelope = JSON.parse(event.data);
      } catch {
        return;
      }
      this.dispatch(envelope);
    };

    socket.onclose = () => {
      this.stopHeartbeat();
      this.setStatus("closed");
      if (!this.manualClose) this.scheduleReconnect();
    };

    socket.onerror = () => {
      // onclose always follows, so reconnection is handled there.
    };
  }

  disconnect() {
    this.manualClose = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.stopHeartbeat();
    this.socket?.close();
    this.socket = null;
    this.queue = [];
    this.setStatus("idle");
  }

  private scheduleReconnect() {
    const delay = Math.min(1000 * 2 ** this.retry, MAX_BACKOFF_MS);
    this.retry += 1;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeat = setInterval(() => this.send("presence.ping", {}), HEARTBEAT_MS);
  }

  private stopHeartbeat() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  private setStatus(status: ConnectionStatus) {
    if (this.status === status) return;
    this.status = status;
    this.statusHandlers.forEach((handler) => handler(status));
  }

  /* --- pub/sub --------------------------------------------------------- */
  on<T = unknown>(type: string, handler: (envelope: WsEnvelope<T>) => void): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler as Handler);
    return () => this.handlers.get(type)?.delete(handler as Handler);
  }

  onStatusChange(handler: (status: ConnectionStatus) => void): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  private dispatch(envelope: WsEnvelope) {
    this.handlers.get(envelope.type)?.forEach((handler) => handler(envelope));
    this.handlers.get("*")?.forEach((handler) => handler(envelope));
  }

  /* --- sending --------------------------------------------------------- */
  send(type: string, data: Record<string, unknown> = {}) {
    const frame = JSON.stringify({ type, data });
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(frame);
      return;
    }
    // Buffered: delivered as soon as the socket is back (safe - the server
    // de-duplicates by client_id).
    this.queue.push(frame);
    this.connect();
  }

  private flushQueue() {
    const pending = [...this.queue];
    this.queue = [];
    pending.forEach((frame) => this.socket?.send(frame));
  }
}

export const socket = new SocketClient();
