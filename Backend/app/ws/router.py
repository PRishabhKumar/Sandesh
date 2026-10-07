"""The ``/ws`` endpoint.

Connect with ``wss://<api>/ws?token=<jwt>``. Browsers cannot set custom headers
on a WebSocket handshake, which is why the token travels as a query parameter
here while REST uses the ``Authorization`` header.

Lifecycle:
    connect -> authenticate -> register socket -> announce presence
            -> push anything the user missed -> loop: dispatch events
    disconnect -> unregister -> if it was the last socket, store last_seen and
                 announce offline
"""

import logging

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.core.database import SessionLocal
from app.models import User
from app.services import presence_service
from app.ws import events
from app.ws.connection_manager import manager
from app.ws.handlers import authenticate, dispatch

logger = logging.getLogger("app.ws")

router = APIRouter()

CLOSE_UNAUTHORIZED = 4401  # custom code: client should refresh its token


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str | None = Query(default=None)) -> None:
    await websocket.accept()

    user_id = authenticate(token)
    if user_id is None:
        await websocket.close(code=CLOSE_UNAUTHORIZED)
        return

    with SessionLocal() as db:
        user = db.get(User, user_id)
        display_name = user.display_name if user else None
    if display_name is None:
        await websocket.close(code=CLOSE_UNAUTHORIZED)
        return

    await manager.connect(user_id, websocket)

    # First socket for this user? -> announce "online" to their peers.
    if presence_service.mark_online(user_id):
        with SessionLocal() as db:
            user = db.get(User, user_id)
            await events.broadcast_presence(user, online=True)

    # Catch-up: messages this user has not received yet.
    await events.deliver_pending_messages(user_id)

    try:
        while True:
            raw = await websocket.receive_json()
            await dispatch(websocket, user_id, raw)
    except WebSocketDisconnect:
        pass
    except Exception:  # pragma: no cover - malformed frames should not crash the server
        logger.exception("socket error for user %s", user_id)
    finally:
        await manager.disconnect(user_id, websocket)

        # Last socket closed? -> store last seen and announce offline.
        if presence_service.mark_offline(user_id):
            with SessionLocal() as db:
                user = db.get(User, user_id)
                if user is not None:
                    presence_service.store_last_seen(db, user)
                    await events.broadcast_presence(user, online=False)
