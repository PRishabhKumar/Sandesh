"""In-memory registry of open WebSocket connections.

One process, one dictionary: ``{user_id: {websocket, ...}}``. A user can be
connected from several tabs/devices, hence a *set* per user - a message is
delivered if at least one of the user's sockets receives it.

Scaling note (asked about in interviews): with more than one worker you would
move this registry into Redis pub/sub, keeping the same ``send_to_user`` API.
"""

import asyncio
import logging

from fastapi import WebSocket
from sqlalchemy import select

from app.core.database import SessionLocal
from app.models import ConversationMember

logger = logging.getLogger("app.ws")


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[int, set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    # --- registry ---------------------------------------------------------
    async def connect(self, user_id: int, websocket: WebSocket) -> None:
        async with self._lock:
            self._connections.setdefault(user_id, set()).add(websocket)

    async def disconnect(self, user_id: int, websocket: WebSocket) -> None:
        async with self._lock:
            sockets = self._connections.get(user_id)
            if not sockets:
                return
            sockets.discard(websocket)
            if not sockets:
                self._connections.pop(user_id, None)

    def is_online(self, user_id: int) -> bool:
        return bool(self._connections.get(user_id))

    def online_user_ids(self) -> set[int]:
        return set(self._connections)

    # --- sending ----------------------------------------------------------
    async def send_to_user(self, user_id: int, event: dict) -> None:
        """Send one event to every socket of one user (never raises)."""
        for websocket in list(self._connections.get(user_id, ())):
            try:
                await websocket.send_json(event)
            except Exception:  # closed socket - drop it and carry on
                logger.debug("dropping dead socket for user %s", user_id)
                await self.disconnect(user_id, websocket)

    async def send_to_users(self, user_ids: list[int], event: dict) -> None:
        for user_id in {uid for uid in user_ids if uid}:
            await self.send_to_user(user_id, event)

    async def broadcast_to_conversation(self, conversation_id: int, event: dict) -> None:
        """Fan out to the *active* members of a conversation."""
        with SessionLocal() as db:
            member_ids = list(
                db.scalars(
                    select(ConversationMember.user_id).where(
                        ConversationMember.conversation_id == conversation_id,
                        ConversationMember.left_at.is_(None),
                    )
                )
            )
        await self.send_to_users(member_ids, event)


manager = ConnectionManager()
