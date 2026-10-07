# Sandesh — Signal-Inspired Full Stack Messaging App

A full-stack, real-time messaging web application that faithfully mirrors the UI/UX of **Signal Desktop**. Sandesh delivers real-time 1:1 and group chats, delivery/read receipts, typing indicators, presence, disappearing messages, reactions, reply threads, file attachments, and dark mode — all over WebSockets, backed by a clean relational schema.

> **"Say hello to a different messaging experience."**
> Cryptography is simulated; the *experience* is the product.

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Features](#features)
3. [Architecture](#architecture)
4. [Database Schema](#database-schema)
5. [REST API Overview](#rest-api-overview)
6. [WebSocket Events](#websocket-events)
7. [Setup & Running Locally](#setup--running-locally)
8. [Demo Accounts](#demo-accounts)
9. [How to Test Real-Time (Two Windows)](#how-to-test-real-time-two-windows)
10. [Project Structure](#project-structure)
11. [Assumptions & Limitations](#assumptions--limitations)
12. [Deployment Notes](#deployment-notes)

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| **Frontend** | Next.js 14 (App Router), TypeScript, Tailwind CSS | Server-side routing, strict types, design-token-driven styling |
| **State** | Zustand | Minimal boilerplate, works outside React tree for WS handlers |
| **Icons** | Lucide React | Monochrome outlined icons matching Signal's visual language |
| **Backend** | FastAPI (Python 3.13), Uvicorn | Async-capable, auto-generated OpenAPI docs, WebSocket support |
| **ORM** | SQLAlchemy 2.0 (mapped columns) | Declarative models, type-safe queries |
| **Database** | SQLite (WAL mode) | Zero-setup, mandated by the assignment, swappable to Postgres |
| **Auth** | JWT (PyJWT) in localStorage | Stateless, shared between HTTP and WebSocket |
| **Real-time** | Native WebSocket (FastAPI) | Full-duplex: messages, receipts, typing, presence, reactions |
| **Testing** | Pytest + HTTPX (backend), Playwright (frontend e2e) | In-process async tests + real browser smoke tests |

---

## Features

### Core (P0)

- [x] **Authentication / Onboarding** — Register with phone number or username; mocked OTP (`123456`); profile setup (display name + avatar colour); session persists across refresh (JWT); logout
- [x] **Contacts & Conversation List** — Left pane sorted by latest activity (pinned first); avatar, name, preview, timestamp, unread badge, delivery tick, muted icon; search + filter (All / Unread / Groups); add contact by phone/username
- [x] **1:1 Messaging** — Real-time send/receive over WebSocket; timestamps + day separators; status ticks (sending → sent → delivered → read); typing indicator; cursor-paginated history; optimistic UI with `client_id` de-duplication
- [x] **Group Messaging** — Create group (name + members); sender name + deterministic colour; admin controls (add/remove members, promote/demote admin); system messages ("Aarav added Meera"); non-admin removals rejected with 403
- [x] **Signal Experience** — Two-pane desktop layout (380px sidebar + flexible chat pane); bubble tails with corner rounding; modals, toasts, search, filters; settings placeholders; encryption simulation banner

### Bonus (P1)

- [x] **Dark Mode** — `data-theme` attribute on `<html>`; all colours derived from CSS variables; persisted to user settings
- [x] **Reply / Quoted Messages** — Hover action → reply bar above composer → `reply_to_id`; quoted block inside bubble; click scrolls to original
- [x] **Message Reactions** — Hover action → emoji row (👍 ❤️ 😂 😮 😢 🙏); chips under bubble; toggle/change/clear; synced to all members in real time
- [x] **Responsive Design** — < 768px: single-pane navigation with back chevron; safe-area padding for mobile
- [x] **Disappearing Messages** — Per-conversation timer picker (Off, 30s, 5m, 1h, 8h, 1d, 1w); server-side background sweeper hard-deletes expired messages; countdown badge on bubbles; system message on timer change
- [x] **File Attachments** — Image preview bubbles + file chip with size; upload via `POST /conversations/{id}/attachments`; MIME whitelist + size cap (10 MB)
- [x] **Keyboard Shortcuts** — `Ctrl+N` new chat, `Ctrl+Shift+G` new group, `Ctrl+F` search, `Ctrl+,` settings, `Alt+↑/↓` switch chats, `?` cheat-sheet, `Esc` close/clear

### Placeholders ("Coming Soon")

- [x] Voice / Video calls → `ComingSoonModal`
- [x] Linked devices → placeholder in Settings
- [x] Simulated E2EE → "Safety number" modal with mock fingerprint
- [ ] Stories → no UI entry point yet (backend N/A)

---

## Architecture

```
┌──────────────────────────┐         WebSocket (ws://)         ┌─────────────────────────┐
│                          │  ◄──────────────────────────────►  │                         │
│   Next.js Frontend       │         REST (http://)            │   FastAPI Backend        │
│   (TypeScript + React)   │  ◄──────────────────────────────► │   (Python + SQLAlchemy)  │
│                          │                                    │                         │
│  ┌────────┐ ┌──────────┐ │                                    │  ┌──────┐  ┌──────────┐ │
│  │ Zustand │ │ lib/ws.ts│ │                                    │  │ REST │  │ WS       │ │
│  │ Stores  │ │ Socket   │ │                                    │  │Routes│  │ Handlers │ │
│  └────────┘ └──────────┘ │                                    │  └──┬───┘  └────┬─────┘ │
│                          │                                    │     │           │       │
└──────────────────────────┘                                    │  ┌──▼───────────▼─────┐ │
                                                                │  │   Service Layer     │ │
                                                                │  │ (auth, message,     │ │
                                                                │  │  group, receipt,     │ │
                                                                │  │  presence, settings) │ │
                                                                │  └──────────┬──────────┘ │
                                                                │             │            │
                                                                │  ┌──────────▼──────────┐ │
                                                                │  │   SQLite (WAL mode)  │ │
                                                                │  │   via SQLAlchemy ORM │ │
                                                                │  └─────────────────────┘ │
                                                                └─────────────────────────┘
```

**Key design decisions:**

1. **REST + WebSocket together** — REST for CRUD (list chats, paginate history, upload files, update settings), WebSocket for real-time pushes (new messages, receipts, typing, presence). On reconnect, the server pushes undelivered messages as a `message.batch` and the client re-fetches the chat list silently.
2. **Optimistic UI** — Messages appear instantly with status `sending`. The server responds with `message.ack`, swapping the placeholder (matched by `client_id`). If no ack arrives within 10 seconds, the bubble flips to `failed` with a retry button. The server deduplicates on `(sender_id, client_id)`, making retries safe.
3. **Single service layer** — Both REST routes and WS handlers call the same service functions, so behaviour is identical regardless of transport.

---

## Database Schema

```
┌───────────────────┐       ┌─────────────────────────┐       ┌───────────────────────┐
│      users        │       │     conversations        │       │      messages          │
├───────────────────┤       ├─────────────────────────┤       ├───────────────────────┤
│ id           PK   │       │ id                PK    │       │ id               PK   │
│ phone_number UQ   │       │ type (direct|group)     │       │ conversation_id  FK   │
│ username     UQ   │       │ direct_key        UQ    │       │ sender_id        FK   │
│ display_name      │       │ name                    │       │ client_id        UQ*  │
│ about             │       │ description             │       │ kind (text|attach|sys)│
│ avatar_url        │       │ avatar_url / color      │       │ body                  │
│ avatar_color      │       │ created_by        FK    │       │ reply_to_id      FK   │
│ last_seen_at      │       │ disappearing_secs       │       │ system_event          │
│ created_at        │       │ members_can_add         │       │ expires_at            │
└──────┬────────────┘       │ only_admins_can_send    │       │ deleted_at            │
       │                    │ last_message_id / _at   │       │ created_at            │
       │                    │ created_at              │       └───────┬───────────────┘
       │                    └──────────┬──────────────┘               │
       │                               │                              │
┌──────▼────────────┐       ┌──────────▼──────────────┐       ┌───────▼───────────────┐
│  user_settings    │       │ conversation_members    │       │  message_receipts     │
├───────────────────┤       ├─────────────────────────┤       ├───────────────────────┤
│ user_id      PK,FK│       │ id               PK    │       │ message_id    PK,FK   │
│ read_receipts     │       │ conversation_id  FK    │       │ user_id       PK,FK   │
│ typing_indicators │       │ user_id          FK    │       │ delivered_at          │
│ show_last_seen    │       │ role (admin|member)    │       │ read_at               │
│ theme             │       │ joined_at              │       └───────────────────────┘
│ notification_cont.│       │ left_at (soft remove)  │
│ default_disappear.│       │ last_read_message_id   │       ┌───────────────────────┐
└───────────────────┘       │ pinned / muted / arch. │       │     reactions         │
                            └─────────────────────────┘       ├───────────────────────┤
┌───────────────────┐                                         │ message_id    PK,FK   │
│    contacts       │       ┌─────────────────────────┐       │ user_id       PK,FK   │
├───────────────────┤       │     attachments         │       │ emoji                 │
│ id           PK   │       ├─────────────────────────┤       │ created_at            │
│ owner_id     FK   │       │ id               PK    │       └───────────────────────┘
│ user_id      FK   │       │ message_id       FK    │
│ nickname          │       │ file_name              │       ┌───────────────────────┐
│ blocked           │       │ mime_type              │       │  message_deletions    │
│ created_at        │       │ size_bytes             │       ├───────────────────────┤
└───────────────────┘       │ storage_path           │       │ message_id    PK,FK   │
                            └─────────────────────────┘       │ user_id       PK,FK   │
┌───────────────────┐                                         │ deleted_at            │
│    otp_codes      │                                         └───────────────────────┘
├───────────────────┤
│ id           PK   │
│ identifier        │
│ code / expires_at │
│ consumed          │
└───────────────────┘
```

**Key indexes:** `ix_conversations_last_message_at` (chat list ordering), `ix_messages_conversation_id_id` (cursor pagination), `ix_messages_expires_at` (disappearing sweeper), `ix_members_user_archived_pinned` (my chat list lookup), `uq_messages_sender_client` (idempotent send).

---

## REST API Overview

All endpoints are prefixed with `/api/v1`. Authentication is via `Authorization: Bearer <JWT>`.

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/auth/request-otp` | Request a verification code (mocked — always succeeds) |
| `POST` | `/auth/verify-otp` | Exchange code `123456` for a JWT token |
| `POST` | `/auth/profile` | Set display name, avatar colour (onboarding + settings) |
| `GET` | `/auth/me` | Hydrate: returns current user + settings |
| `POST` | `/auth/logout` | Record last seen (token is dropped client-side) |
| `GET` | `/users/lookup?q=` | Search by phone or username |
| `POST` | `/users/me/avatar` | Upload profile photo |
| `GET` | `/contacts?q=` | My address book (filterable) |
| `POST` | `/contacts` | Add a contact by identifier |
| `GET` | `/conversations?q=&filter=` | Chat list (pinned first, most recent activity) |
| `GET` | `/conversations/{id}` | Chat detail + member list |
| `POST` | `/conversations/direct` | Get-or-create a 1:1 chat |
| `PATCH` | `/conversations/{id}/me` | Pin / mute / archive my membership |
| `PATCH` | `/conversations/{id}/disappearing` | Set self-destruct timer |
| `POST` | `/conversations/{id}/read` | Mark messages as read up to an id |
| `GET` | `/conversations/{id}/messages` | Cursor-paginated history (`?before=&limit=`) |
| `POST` | `/conversations/{id}/messages` | REST fallback for sending (WS is primary) |
| `POST` | `/conversations/{id}/attachments` | Upload a file into a conversation |
| `DELETE` | `/messages/{id}?scope=` | Delete for me or for everyone |
| `PUT` | `/messages/{id}/reaction` | Add / change / clear my emoji reaction |
| `POST` | `/groups` | Create a group |
| `PATCH` | `/groups/{id}` | Update name, description, permissions (admin) |
| `POST` | `/groups/{id}/members` | Add members |
| `DELETE` | `/groups/{id}/members/{uid}` | Remove a member or leave the group |
| `PATCH` | `/groups/{id}/members/{uid}` | Promote / demote admin role |
| `PATCH` | `/settings` | Update privacy / notification / appearance prefs |
| `GET` | `/health` | Uptime check (cold-start wake-up) |

Full interactive docs available at `http://localhost:8000/docs` (Swagger UI).

---

## WebSocket Events

Connection: `ws://localhost:8000/ws?token=<JWT>` (or `wss://` in production).

### Client → Server

| Event | Payload | Description |
|---|---|---|
| `message.send` | `{ conversation_id, client_id, body, reply_to_id }` | Send a text message |
| `message.delivered` | `{ message_ids: [...] }` | Confirm delivery of offline catch-up messages |
| `message.read` | `{ conversation_id, up_to_message_id }` | Mark messages as read |
| `typing.start` | `{ conversation_id }` | I started typing |
| `typing.stop` | `{ conversation_id }` | I stopped typing |
| `reaction.set` | `{ message_id, emoji }` | Add / change reaction (`emoji: null` clears) |
| `presence.ping` | `{}` | Keep-alive heartbeat |

### Server → Client

| Event | Payload | Description |
|---|---|---|
| `message.ack` | `{ client_id, message }` | Your message was stored (sending → sent) |
| `message.new` | `{ message }` | A new message arrived in a conversation |
| `message.batch` | `{ messages: [...] }` | Offline catch-up on reconnect |
| `receipt.update` | `{ conversation_id, message_ids, status }` | Ticks upgraded (delivered / read) |
| `typing` | `{ conversation_id, user_id, is_typing }` | Someone is typing |
| `presence` | `{ user_id, online, last_seen_at }` | Online / offline status change |
| `conversation.updated` | `{ conversation }` | Chat list row refreshed (unread, flags) |
| `group.updated` | `{ conversation_id, event, message }` | Group membership / info changed |
| `removed.from_group` | `{ conversation_id, conversation_name }` | You were kicked from a group |
| `message.deleted` | `{ conversation_id, message_id, scope }` | A message was deleted |
| `message.expired` | `{ conversation_id, message_id }` | Disappearing message expired |
| `message.reaction` | `{ conversation_id, message }` | Reaction added / changed / cleared |
| `error` | `{ code, message, ref_id? }` | Something went wrong |

---

## Setup & Running Locally

### Prerequisites

- **Python 3.11+** (tested on 3.13)
- **Node.js 18+** and **npm**
- **Git**

### 1. Clone the repository

```bash
git clone https://github.com/PRishabhKumar/Sandesh.git
cd Sandesh
```

### 2. Backend

```bash
cd Backend

# Create and activate a virtual environment
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS / Linux:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create .env (or copy the example)
cp .env.example .env
# Edit .env if needed (defaults work for local dev)

# Start the server
uvicorn app.main:app --reload --port 8000
```

On first boot with `SEED_ON_BOOT=true`, the server creates demo data automatically.

### 3. Frontend

```bash
cd Frontend

# Install dependencies
npm install

# Start the dev server (proxies API/WS to localhost:8000)
npm run dev
```

Open **http://localhost:3000** in your browser.

### 4. Verify everything works

- Backend health: `curl http://localhost:8000/health`
- Swagger docs: http://localhost:8000/docs
- Frontend: http://localhost:3000/welcome

---

## Demo Accounts

The seed script creates **8 users**. Log in with any phone number below; the OTP is always **`123456`**.

| Name | Phone Number | Username | Notes |
|---|---|---|---|
| **Aarav Sharma** | `+91 90000 00001` | `aarav` | Primary demo login — has unread chats, is admin of groups |
| **Meera Iyer** | `+91 90000 00002` | `meera` | Second demo login — good for side-by-side testing |
| Rohan Verma | `+91 90000 00003` | `rohan` | Group member |
| Ananya Rao | `+91 90000 00004` | `ananya` | Has unread messages |
| Kabir Nair | `+91 90000 00005` | `kabir` | Group member |
| Priya Menon | `+91 90000 00006` | `priya` | Group member |
| Dev Patel | `+91 90000 00007` | `dev` | Project Falcon group |
| Sara Khan | `+91 90000 00008` | `sara` | Direct chat with Aarav |

Seeded conversations include **7 direct chats** and **2 groups** (*Weekend Trek*, *Project Falcon*) with **180+ messages** spread over the last week — including replies, reactions, mixed delivery statuses, and system messages.

---

## How to Test Real-Time (Two Windows)

1. Open **Window A** (normal) → log in as **Aarav** (`+91 90000 00001`, OTP `123456`)
2. Open **Window B** (incognito / different browser) → log in as **Meera** (`+91 90000 00002`, OTP `123456`)
3. **A sends a message to B** → B sees it instantly; A's tick: `sent → delivered`
4. **B opens the chat** → A's tick upgrades to `read`
5. **B starts typing** → A sees animated dots in the header + "typing…" in the sidebar
6. **Turn off read receipts on B** (Settings → Privacy) → A no longer sees `read` for new messages
7. **Close B, A sends 3 messages, reopen B** → B receives all; unread badge = 3; A ticks → `delivered`
8. **A creates a group with B + C** → appears for all with a system message
9. **Non-admin tries remove** → UI hides the control; API returns 403
10. **Admin removes a member** → member's UI updates live
11. **Toggle dark mode** (sidebar avatar menu or Settings → Appearance) → all screens themed; persists
12. **Reply + React** → rendered, synced to other window
13. **Set disappearing timer to 30s** → messages vanish in both windows after 30s

---

## Project Structure

```
Sandesh/
├── Backend/
│   ├── app/
│   │   ├── api/                  # REST route handlers (thin adapters)
│   │   │   ├── auth.py           # OTP, profile, session
│   │   │   ├── contacts.py       # Address book
│   │   │   ├── conversations.py  # Chat list, history, send, read
│   │   │   ├── groups.py         # Create, members, roles, permissions
│   │   │   ├── messages.py       # Delete, reactions
│   │   │   ├── settings.py       # Privacy, notifications, appearance
│   │   │   ├── uploads.py        # File attachments
│   │   │   ├── users.py          # Lookup, avatar upload
│   │   │   └── deps.py           # get_current_user dependency
│   │   ├── core/
│   │   │   ├── config.py         # Pydantic Settings (all env vars)
│   │   │   ├── database.py       # SQLAlchemy engine, session, Base
│   │   │   ├── errors.py         # Custom ApiError + handlers
│   │   │   └── security.py       # JWT encode / decode
│   │   ├── models/               # SQLAlchemy ORM models
│   │   │   ├── user.py           # User, UserSettings, OtpCode
│   │   │   ├── contact.py        # Contact
│   │   │   ├── conversation.py   # Conversation, ConversationMember
│   │   │   └── message.py        # Message, MessageReceipt, Reaction, Attachment
│   │   ├── repositories/         # Data access (queries only, no business logic)
│   │   ├── schemas/              # Pydantic request/response DTOs
│   │   ├── services/             # Business logic layer
│   │   │   ├── auth_service.py
│   │   │   ├── message_service.py
│   │   │   ├── group_service.py
│   │   │   ├── receipt_service.py
│   │   │   ├── presence_service.py
│   │   │   ├── settings_service.py
│   │   │   └── sweeper.py        # Asyncio background task for disappearing msgs
│   │   ├── ws/                   # WebSocket layer
│   │   │   ├── connection_manager.py  # In-memory user→socket registry
│   │   │   ├── handlers.py       # Client→server event dispatch table
│   │   │   ├── events.py         # Server→client broadcast helpers
│   │   │   └── router.py         # /ws endpoint + auth + message loop
│   │   ├── seed/seed.py          # Idempotent demo data (8 users, 180+ msgs)
│   │   └── main.py               # FastAPI app, lifespan, middleware
│   ├── tests/                    # Pytest async tests (29 tests)
│   ├── scripts/smoke_api.py      # End-to-end HTTP + WS smoke test
│   ├── requirements.txt
│   └── .env.example
│
├── Frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── (auth)/           # Onboarding routes (welcome, phone, verify, profile)
│   │   │   ├── (app)/            # Signed-in routes (chats, settings)
│   │   │   ├── layout.tsx        # Root layout + Providers
│   │   │   └── page.tsx          # Entry redirect (→ /chats or /welcome)
│   │   ├── components/
│   │   │   ├── chat/             # ChatPane, ChatHeader, Composer, MessageBubble, MessageList
│   │   │   ├── sidebar/          # Sidebar, ConversationRow
│   │   │   ├── modals/           # NewChat, NewGroup, AddContact, Disappearing, SafetyNumber...
│   │   │   ├── settings/         # ProfileSection, PreferenceSections
│   │   │   ├── layout/           # AppShell (two-pane / responsive)
│   │   │   └── ui/               # Avatar, Button, Field, Modal, Menu, Toaster, Logo...
│   │   ├── hooks/
│   │   │   ├── useSocketEvents.ts   # Wires all WS events → Zustand stores
│   │   │   └── useKeyboardShortcuts.ts
│   │   ├── lib/
│   │   │   ├── api.ts            # HTTP client (fetch wrappers)
│   │   │   ├── ws.ts             # WebSocket singleton with reconnect
│   │   │   ├── types.ts          # TypeScript mirror of backend DTOs
│   │   │   ├── constants.ts      # Copy, filters, emojis, disappearing options
│   │   │   ├── format.ts         # Date / time / bytes formatters
│   │   │   └── palette.ts        # Deterministic avatar colours
│   │   ├── stores/
│   │   │   ├── auth.ts           # Session, settings, hydrate, logout
│   │   │   ├── conversations.ts  # Chat list, filters, upsert, applyIncoming
│   │   │   ├── messages.ts       # Per-conversation messages, typing, optimistic send
│   │   │   ├── presence.ts       # Online / last-seen by user id
│   │   │   ├── onboarding.ts     # OTP flow state
│   │   │   └── ui.ts             # Theme, modals, toasts, connection status
│   │   └── styles/tokens.css     # CSS variables (light + dark), base resets
│   ├── e2e/                      # Playwright browser smoke tests + screenshots
│   ├── next.config.mjs           # API/WS proxy rewrites
│   ├── tailwind.config.ts        # Maps CSS vars → Tailwind utilities
│   └── package.json
│
├── Planning Docs/                # PRD, TRD, Implementation Plan, Design Doc
└── README.md                     # ← You are here
```

---

## Assumptions & Limitations

| Area | Assumption / Limitation |
|---|---|
| **OTP Verification** | Mocked — any phone number/username works; the code is always `123456`. No real SMS is sent. |
| **End-to-End Encryption** | Simulated only. Messages are stored in plaintext. A "Safety number" modal shows a mock fingerprint. |
| **WebSocket Registry** | In-memory (`dict[user_id, set[WebSocket]]`). Works perfectly for single-process Uvicorn. Not horizontally scalable without Redis pub/sub or similar — acknowledged as out of scope. |
| **SQLite** | Mandated by the assignment. WAL mode is enabled for concurrent reads. The schema is designed to be Postgres-compatible (swap `DATABASE_URL` and it works). |
| **File Storage** | Attachments are saved to disk (`uploads/` directory). A production deployment would use S3 / GCS. |
| **Voice / Video Calls** | Placeholder only ("Coming soon"). Real WebRTC is out of scope. |
| **Stories** | Placeholder only. |
| **Linked Devices** | Placeholder. Multi-device sync requires real key management. |
| **Notification Sounds** | Not implemented (browser audio autoplay restrictions make this unreliable). Visual toasts are used instead. |

---

## Deployment Notes

### Backend (Render / Railway)

1. Set root directory to `Backend/`
2. Build command: `pip install -r requirements.txt`
3. Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Set env vars: `JWT_SECRET` (strong random string), `ALLOWED_ORIGINS` (your Vercel URL), `SEED_ON_BOOT=true`
5. Attach a persistent disk if available (for SQLite + uploads)

### Frontend (Vercel)

1. Set root directory to `Frontend/`
2. Framework preset: Next.js
3. Set env vars:
   - `NEXT_PUBLIC_API_URL=https://your-backend.onrender.com/api/v1`
   - `NEXT_PUBLIC_WS_URL=wss://your-backend.onrender.com/ws`
   - `NEXT_PUBLIC_API_ORIGIN=https://your-backend.onrender.com`
4. Update the backend's `ALLOWED_ORIGINS` with the Vercel URL

> **Cold-start note:** Free tiers on Render/Railway sleep after inactivity. Hit `/health` before the demo to wake the server.

---

## Running Tests

### Backend (29 tests — all passing)

```bash
cd Backend
.venv\Scripts\activate        # or source .venv/bin/activate
python -m pytest               # runs tests/test_auth.py, test_conversations.py,
                               # test_groups.py, test_receipts.py, test_websocket.py
```

### Frontend (Playwright e2e — requires both servers running)

```bash
cd Frontend
node e2e/ui-smoke.mjs          # login flow, sidebar, settings, dark mode
node e2e/features-smoke.mjs    # reactions, replies, disappearing, shortcuts, attachments
```

### End-to-end API smoke test

```bash
cd Backend
.venv\Scripts\python scripts\smoke_api.py          # tests against localhost:8000
.venv\Scripts\python scripts\smoke_api.py --via-frontend  # tests through Next.js proxy
```

---

## License

This project was built as an SDE Fullstack assignment submission. The UI design mirrors Signal Desktop for educational purposes only — Signal is a registered trademark of Signal Technology Foundation.