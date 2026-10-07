"""End-to-end smoke test against a *running* server.

Unlike `pytest tests/`, which drives the app in-process, this script talks to a
real HTTP server over the wire - the same way the frontend does. Point it at the
Next.js dev server to also prove the `/api` rewrite works::

    # 1. terminal A
    uvicorn app.main:app --host 0.0.0.0 --port 8000
    # 2. terminal B
    cd Frontend && npm run dev
    # 3. terminal C
    Backend/.venv/bin/python Backend/scripts/smoke_api.py                # direct
    Backend/.venv/bin/python Backend/scripts/smoke_api.py --via-frontend # proxied

Notes:
* It writes to whatever database the server is using, so it creates a couple of
  throwaway users/chats. Reset the demo data afterwards with
  ``rm -f signal_clone.db* && python -m app.seed.seed``.
* Only the standard library plus ``httpx`` (already a backend dependency) is used.
"""

from __future__ import annotations

import argparse
import json
import sys
import time

import httpx
from websockets.exceptions import ConnectionClosed
from websockets.sync.client import connect

PASSED: list[str] = []
FAILED: list[str] = []


def check(label: str, condition: bool, detail: str = "") -> None:
    if condition:
        PASSED.append(label)
        print(f"  ok   {label}")
    else:
        FAILED.append(f"{label} :: {detail}")
        print(f"  FAIL {label}  <- {detail}")


def section(title: str) -> None:
    print(f"\n{title}")


def _collect(socket, wanted: set[str], timeout: float = 10.0) -> dict[str, dict]:
    """Read frames until every wanted event type has arrived (or we time out).

    Sockets are async streams, so a single recv() may return typing, receipts or
    the message itself in any order - collecting by type keeps the assertions
    independent of that order.
    """
    found: dict[str, dict] = {}
    deadline = time.monotonic() + timeout
    while wanted.difference(found) and time.monotonic() < deadline:
        try:
            event = json.loads(socket.recv(timeout=max(deadline - time.monotonic(), 0.1)))
        except TimeoutError:
            break
        if event.get("type") == "error":  # surface server-side errors immediately
            found["error"] = event
            break
        if event.get("type") in wanted:
            found[event["type"]] = event
    return found


def _has_status(event: dict | None, status: str) -> bool:
    return bool(event) and event.get("data", {}).get("status") == status


def summary() -> None:
    print(f"\n{len(PASSED)} passed, {len(FAILED)} failed")
    for failure in FAILED:
        print(f"  - {failure}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--via-frontend",
        action="store_true",
        help="hit http://127.0.0.1:3000 (exercises the Next.js /api rewrite)",
    )
    parser.add_argument("--base", default=None, help="override the API base URL")
    parser.add_argument("--host", default="127.0.0.1")
    args = parser.parse_args()

    origin = args.base or (
        f"http://{args.host}:3000/api/v1"
        if args.via_frontend
        else f"http://{args.host}:8000/api/v1"
    )
    print(f"Target: {origin}")

    run_id = int(time.time())  # makes every client_id unique to this run
    me = httpx.Client(base_url=origin, timeout=20)
    peer = httpx.Client(base_url=origin, timeout=20)

    # --- auth ---------------------------------------------------------------
    section("auth & onboarding")
    r = me.post("/auth/request-otp", json={"identifier": "+919000000001"})
    check("POST /auth/request-otp", r.status_code == 200, r.text[:200])

    r = me.post("/auth/verify-otp", json={"identifier": "+919000000001", "code": "123456"})
    check("POST /auth/verify-otp", r.status_code == 200, r.text[:200])
    session = r.json()
    me.headers["Authorization"] = f"Bearer {session['token']}"
    check("seeded login needs no profile", session["needs_profile"] is False, str(session)[:200])

    r = me.post("/auth/verify-otp", json={"identifier": "+919000000001", "code": "000000"})
    check(
        "wrong code -> invalid_otp",
        r.status_code == 400 and r.json()["error"]["code"] == "invalid_otp",
        r.text[:200],
    )

    r = me.get("/auth/me")
    body = r.json()
    check(
        "GET /auth/me returns user + settings",
        r.status_code == 200
        and body["user"]["id"] == session["user"]["id"]
        and "theme" in body["settings"],
        r.text[:200],
    )
    check(
        "last_seen_at is refreshed on login",
        bool(body["user"]["last_seen_at"]),
        str(body["user"])[:200],
    )

    # signup path: a brand-new number walks through /profile
    fresh = f"+9190000{int(time.time()) % 100000:05d}"
    me.post("/auth/request-otp", json={"identifier": fresh})
    signup = httpx.Client(base_url=origin, timeout=20)
    r = signup.post("/auth/verify-otp", json={"identifier": fresh, "code": "123456"})
    check(
        "new number signs up (needs_profile)",
        r.status_code == 200 and r.json()["needs_profile"] is True,
        r.text[:200],
    )
    signup.headers["Authorization"] = f"Bearer {r.json()['token']}"
    r = signup.post(
        "/auth/profile", json={"display_name": "Smoke Tester", "avatar_color": "#E3F2FD"}
    )
    check(
        "POST /auth/profile completes signup",
        r.status_code == 200 and r.json()["display_name"] == "Smoke Tester",
        r.text[:200],
    )

    # --- settings / contacts -------------------------------------------------
    section("settings & contacts")
    r = me.get("/settings")
    check("GET /settings", r.status_code == 200 and "theme" in r.json(), r.text[:200])
    r = me.patch("/settings", json={"theme": "dark", "read_receipts": True})
    check("PATCH /settings", r.status_code == 200 and r.json()["theme"] == "dark", r.text[:200])

    # "meera" is an exact username hit, so she comes back in exact_match (the
    # substring list deliberately excludes the exact match to avoid duplicates)
    r = me.get("/users/lookup", params={"q": "meera"})
    lookup = r.json()
    check(
        "GET /users/lookup exact match",
        r.status_code == 200 and lookup["exact_match"]["username"] == "meera",
        r.text[:200],
    )
    r = me.get("/users/lookup", params={"q": "Rao"})
    check(
        "GET /users/lookup by display name",
        r.status_code == 200 and any("Rao" in u["display_name"] for u in r.json()["users"]),
        r.text[:200],
    )
    r = me.get("/contacts")
    check("GET /contacts", r.status_code == 200 and isinstance(r.json(), list), r.text[:200])
    r = me.get("/contacts", params={"q": "rohan"})
    check("GET /contacts?q=", r.status_code == 200, r.text[:200])

    # --- chat list -----------------------------------------------------------
    section("chat list")
    r = me.get("/conversations")
    conversations = r.json()
    check("GET /conversations", r.status_code == 200 and len(conversations) >= 5, r.text[:200])
    check("seeded chats for the demo login", len(conversations) >= 5, str(len(conversations)))
    check(
        "pinned chat present",
        any(c["pinned"] for c in conversations),
        str([c["title"] for c in conversations]),
    )
    check(
        "muted chat present",
        any(c["muted"] for c in conversations),
        str([c["title"] for c in conversations]),
    )
    check(
        "unread badge present",
        any(c["unread_count"] > 0 for c in conversations),
        str([(c["title"], c["unread_count"]) for c in conversations]),
    )

    for params in ({"filter": "unread"}, {"filter": "groups"}, {"q": "meera"}):
        r = me.get("/conversations", params=params)
        check(f"GET /conversations {params}", r.status_code == 200, r.text[:200])

    direct = next(c for c in conversations if c["type"] == "direct" and c["unread_count"] > 0)
    cid = direct["id"]

    # the demo data intentionally contains one long thread so "load older" can
    # be exercised; find it by asking for a page and looking at has_more
    long_chat = None
    for candidate in conversations:
        probe = me.get(f"/conversations/{candidate['id']}/messages", params={"limit": 50}).json()
        if probe["has_more"]:
            long_chat = candidate
            break
    check(
        "a chat with more than one page exists",
        long_chat is not None,
        str([(c["title"], c["last_message"]["body"][:20]) for c in conversations]),
    )
    if long_chat:
        cid = long_chat["id"]

    r = me.get(f"/conversations/{cid}")
    check("GET /conversations/{id}", r.status_code == 200 and r.json()["members"], r.text[:200])

    # --- history pagination --------------------------------------------------
    section("history pagination")
    r = me.get(f"/conversations/{cid}/messages", params={"limit": 50})
    page1 = r.json()
    check("page 1 (limit 50)", r.status_code == 200 and len(page1["messages"]) == 50, r.text[:200])
    check("page 1 has_more", page1["has_more"] is True, str(page1.get("has_more")))
    oldest = page1["messages"][0]["id"]
    r = me.get(f"/conversations/{cid}/messages", params={"limit": 50, "before": oldest})
    page2 = r.json()
    check("page 2 (before cursor)", r.status_code == 200 and page2["messages"], r.text[:200])
    check("pages do not overlap", max(m["id"] for m in page2["messages"]) < oldest, f"{oldest}")
    r = me.get(f"/conversations/{cid}/messages", params={"after": oldest, "limit": 5})
    check(
        "after= re-sync cursor",
        r.status_code == 200 and len(r.json()["messages"]) == 5,
        r.text[:200],
    )

    # --- sending, replies, status -------------------------------------------
    section("send / reply / status")
    body = "smoke test message"
    r = me.post(
        f"/conversations/{cid}/messages", json={"body": body, "client_id": f"smoke-{run_id}-1"}
    )
    check(
        "POST message -> 201 + message",
        r.status_code == 201 and r.json()["body"] == body,
        r.text[:200],
    )
    message_id = r.json()["id"]
    r = me.post(
        f"/conversations/{cid}/messages", json={"body": body, "client_id": f"smoke-{run_id}-1"}
    )
    check(
        "same client_id is idempotent",
        r.status_code in (200, 201) and r.json()["id"] == message_id,
        r.text[:200],
    )

    r = me.post(
        f"/conversations/{cid}/messages",
        json={"body": "a reply", "client_id": f"smoke-{run_id}-2", "reply_to_id": message_id},
    )
    check(
        "POST reply carries reply_to",
        r.status_code == 201 and r.json()["reply_to"]["id"] == message_id,
        r.text[:300],
    )
    reply_id = r.json()["id"]

    # the other side of the conversation reads it over REST
    r = peer.post("/auth/request-otp", json={"identifier": "+919000000002"})
    r = peer.post("/auth/verify-otp", json={"identifier": "+919000000002", "code": "123456"})
    peer.headers["Authorization"] = f"Bearer {r.json()['token']}"
    r = peer.get(f"/conversations/{cid}/messages", params={"after": message_id - 1})
    check("recipient sees the new message", r.status_code == 200, r.text[:200])
    r = peer.post(f"/conversations/{cid}/read", json={"up_to_message_id": reply_id})
    check("POST read", r.status_code in (200, 204), r.text[:200])
    r = me.get(f"/conversations/{cid}/messages", params={"after": message_id - 1})
    statuses = {m["id"]: m["status"] for m in r.json()["messages"]}
    check(
        "status is read after the recipient reads",
        statuses.get(message_id) == "read",
        str(statuses),
    )

    # --- realtime ------------------------------------------------------------
    # Delivery and typing only exist on the socket: a message counts as
    # delivered when it reaches one of the recipient's live connections.
    section("realtime (websocket)")
    ws_base = origin.split("/api/v1")[0].replace("http://", "ws://")
    me_token = session["token"]
    peer_token = peer.headers["Authorization"].split(" ")[1]
    try:
        # the recipient's socket, plus one of my own so I can watch the receipts
        with (
            connect(f"{ws_base}/ws?token={peer_token}", open_timeout=10) as sock,
            connect(f"{ws_base}/ws?token={me_token}", open_timeout=10) as me_socket,
        ):
            check("sockets accept the JWT", True)

            sock.send(json.dumps({"type": "presence.ping", "data": {}}))
            events = _collect(sock, {"presence.pong"}, timeout=10)
            check("presence.ping -> presence.pong", "presence.pong" in events, str(events)[:200])

            # I type, the peer receives the relay
            me_socket.send(
                json.dumps(
                    {"type": "typing.start", "data": {"conversation_id": cid, "is_typing": True}}
                )
            )
            events = _collect(sock, {"typing"}, timeout=10)
            check(
                "typing is relayed to the peer",
                events.get("typing", {}).get("data", {}).get("user_id") == session["user"]["id"],
                str(events)[:200],
            )

            # I send over the socket: ack for me, message.new for them, and the
            # delivery receipt comes back as a receipt.update
            me_socket.send(
                json.dumps(
                    {
                        "type": "message.send",
                        "data": {
                            "conversation_id": cid,
                            "client_id": f"ws-{run_id}",
                            "body": "socket hello",
                        },
                    }
                )
            )
            me_events = _collect(me_socket, {"message.ack", "receipt.update"}, timeout=10)
            check("message.send -> message.ack", "message.ack" in me_events, str(me_events)[:300])
            check(
                "message.send -> receipt.update(delivered)",
                _has_status(me_events.get("receipt.update"), "delivered"),
                str(me_events.get("receipt.update"))[:300],
            )
            ws_message_id = me_events["message.ack"]["data"]["message"]["id"]
            peer_events = _collect(sock, {"message.new", "receipt.update"}, timeout=10)
            check("peer receives message.new", "message.new" in peer_events, str(peer_events)[:300])

            # the peer reads it: I get receipt.update(read)
            sock.send(
                json.dumps(
                    {
                        "type": "message.read",
                        "data": {"conversation_id": cid, "up_to_message_id": ws_message_id},
                    }
                )
            )
            me_events = _collect(me_socket, {"receipt.update"}, timeout=10)
            check(
                "reading pushes receipt.update(read) to the sender",
                _has_status(me_events.get("receipt.update"), "read"),
                str(me_events)[:300],
            )

            # reactions travel over the socket too
            sock.send(
                json.dumps(
                    {"type": "reaction.set", "data": {"message_id": ws_message_id, "emoji": "👍"}}
                )
            )
            me_events = _collect(me_socket, {"message.reaction"}, timeout=10)
            check("peer reaction reaches me", "message.reaction" in me_events, str(me_events)[:300])

            # an unknown event is answered with an error, not a crash
            sock.send(json.dumps({"type": "nonsense.event", "data": {}}))
            events = _collect(sock, {"error"}, timeout=10)
            check(
                "unknown event -> error event",
                events.get("error", {}).get("data", {}).get("code") == "unknown_event",
                str(events)[:200],
            )
    except Exception as exc:
        check("websocket flow", False, f"{type(exc).__name__}: {exc}")

    try:
        with connect(f"{ws_base}/ws?token=not-a-real-token", open_timeout=10) as rejected:
            rejected.recv(timeout=5)  # the server hangs up straight away
        check("bad token is refused with 4401", False, "connection stayed open")
    except ConnectionClosed as exc:
        code = exc.rcvd.code if exc.rcvd is not None else None
        check("bad token is refused with 4401", code == 4401, f"close code {code}")
    except Exception as exc:
        check("bad token is refused with 4401", False, f"{type(exc).__name__}: {exc}")

    # --- reactions / delete / disappearing ----------------------------------
    section("reactions, delete, disappearing")
    r = me.put(f"/messages/{reply_id}/reaction", json={"emoji": "🔥"})
    check("PUT reaction", r.status_code == 200 and r.json()["reactions"], r.text[:200])
    r = me.put(f"/messages/{reply_id}/reaction", json={"emoji": "🔥"})
    check(
        "same reaction twice is idempotent",
        r.status_code == 200 and len(r.json()["reactions"]) == 1,
        r.text[:200],
    )
    r = me.put(f"/messages/{reply_id}/reaction", json={"emoji": None})
    check(
        "emoji=null clears my reaction",
        r.status_code == 200 and not r.json()["reactions"],
        r.text[:200],
    )

    r = me.post("/conversations/direct", json={"user_id": 7})
    scratch = r.json()["id"]
    r = me.post(
        f"/conversations/{scratch}/messages",
        json={"body": "delete me", "client_id": f"smoke-{run_id}-3"},
    )
    doomed = r.json()["id"]
    r = me.delete(f"/messages/{doomed}", params={"scope": "me"})
    check("DELETE message scope=me", r.status_code in (200, 204), r.text[:200])
    r = me.get(f"/conversations/{scratch}/messages")
    check(
        "deleted-for-me message is hidden",
        doomed not in [m["id"] for m in r.json()["messages"]],
        r.text[:200],
    )

    r = me.patch(f"/conversations/{scratch}/disappearing", json={"disappearing_secs": 3600})
    check(
        "PATCH disappearing timer",
        r.status_code == 200 and r.json()["disappearing_secs"] == 3600,
        r.text[:200],
    )
    r = me.patch(f"/conversations/{scratch}/disappearing", json={"disappearing_secs": 7})
    check("invalid timer -> 4xx", r.status_code >= 400, f"{r.status_code} {r.text[:120]}")

    # --- per-user chat state -------------------------------------------------
    section("pin / mute / archive")
    r = me.patch(
        f"/conversations/{scratch}/me", json={"pinned": True, "muted": True, "archived": True}
    )
    check("PATCH conversation/me", r.status_code == 200, r.text[:200])
    check(
        "my settings are mine only",
        r.json()["pinned"] and r.json()["muted"] and r.json()["archived"],
        r.text[:200],
    )
    other = httpx.Client(base_url=origin, timeout=20)
    other.post("/auth/request-otp", json={"identifier": "+919000000007"})
    token = other.post(
        "/auth/verify-otp", json={"identifier": "+919000000007", "code": "123456"}
    ).json()["token"]
    other.headers["Authorization"] = f"Bearer {token}"
    other_view = other.get("/conversations").json()
    peer_row = next(c for c in other_view if c["id"] == scratch)
    check(
        "my pin/mute/archive are not visible to the other side",
        not peer_row["pinned"] and not peer_row["muted"] and not peer_row["archived"],
        str(peer_row)[:200],
    )

    # --- groups --------------------------------------------------------------
    section("groups & permissions")
    # requests take "name" (the group's name); responses expose "title", which
    # is the same field for groups and the peer's name for direct chats
    r = me.post(
        "/groups", json={"name": "Smoke Group", "member_ids": [2, 3], "description": "temp"}
    )
    check("POST /groups", r.status_code in (200, 201), r.text[:200])
    if r.status_code not in (200, 201):
        summary()
        return 1
    gid = r.json()["id"]
    check("creator is admin", r.json()["role"] == "admin", r.text[:200])
    check("new group has 3 members", len(r.json()["members"]) == 3, r.text[:200])

    r = me.patch(f"/groups/{gid}", json={"name": "Smoke Group v2", "description": "renamed"})
    check(
        "PATCH /groups/{id}",
        r.status_code == 200 and r.json()["title"] == "Smoke Group v2",
        r.text[:200],
    )
    r = me.post(f"/groups/{gid}/members", json={"user_ids": [4]})
    check("POST members", r.status_code == 200 and len(r.json()["members"]) == 4, r.text[:200])
    r = me.post(f"/groups/{gid}/members", json={"user_ids": [4]})
    check(
        "adding the same member twice -> 4xx",
        r.status_code >= 400,
        f"{r.status_code} {r.text[:120]}",
    )
    r = me.patch(f"/groups/{gid}/members/4", json={"role": "admin"})
    check("PATCH member role", r.status_code == 200, r.text[:200])
    r = me.delete(f"/groups/{gid}/members/4")
    check("DELETE member", r.status_code in (200, 204), r.text[:200])

    r = peer.patch(f"/groups/{gid}", json={"name": "hijack"})
    check(
        "non-admin cannot edit -> admin_required",
        r.status_code == 403 and r.json()["error"]["code"] == "admin_required",
        r.text[:200],
    )
    r = peer.get(f"/groups/{gid}")
    check("member can read the group", r.status_code == 200, r.text[:200])

    r = me.get("/conversations/999999")
    check("unknown conversation -> 404", r.status_code == 404, r.text[:200])

    # --- attachments ---------------------------------------------------------
    section("attachments")
    png = bytes.fromhex(
        "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
        "0000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082"
    )
    r = me.post(
        f"/conversations/{scratch}/attachments", files={"file": ("dot.png", png, "image/png")}
    )
    check("POST attachment", r.status_code in (200, 201), r.text[:300])
    if r.status_code in (200, 201):
        attachment = r.json()["attachments"][0]
        file_origin = origin[: origin.index("/api/v1")]
        served = httpx.get(file_origin + attachment["url"], timeout=20)
        check(
            "upload is served back",
            served.status_code == 200 and len(served.content) == len(png),
            f"{served.status_code} {len(served.content)} bytes",
        )

    # --- authz ---------------------------------------------------------------
    section("authz")
    anon = httpx.Client(base_url=origin, timeout=10)
    r = anon.get("/conversations")
    check(
        "anonymous -> unauthorized",
        r.status_code == 401 and r.json()["error"]["code"] == "unauthorized",
        r.text[:200],
    )
    r = anon.get("/conversations", headers={"Authorization": "Bearer not-a-token"})
    check("garbage token -> 401", r.status_code == 401, r.text[:200])

    outsiders = httpx.Client(base_url=origin, timeout=10)  # the smoke signup user
    outsiders.headers["Authorization"] = signup.headers["Authorization"]
    r = outsiders.get(f"/conversations/{cid}/messages")
    check(
        "non-member cannot read history -> not_a_member",
        r.status_code == 403 and r.json()["error"]["code"] == "not_a_member",
        r.text[:200],
    )

    r = me.post("/auth/logout")
    check("POST /auth/logout", r.status_code in (200, 204), r.text[:200])

    # --- summary -------------------------------------------------------------
    summary()
    return 1 if FAILED else 0


if __name__ == "__main__":
    sys.exit(main())
