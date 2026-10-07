"""Background sweeper for disappearing messages.

A tiny asyncio task started on boot: every few seconds it hard-deletes messages
whose ``expires_at`` has passed and tells every open client to drop them.

Keeping this server-side is the point: the timer is enforced by the backend, so
it holds even if a client closes the tab or lies about the time.
"""

import asyncio
import contextlib
import logging

from sqlalchemy import select

from app.core.config import settings
from app.core.database import SessionLocal, utcnow
from app.models import Message

logger = logging.getLogger("app.sweeper")


def delete_expired_messages() -> list[tuple[int, int]]:
    """Delete expired rows. Returns ``[(conversation_id, message_id), ...]``."""
    with SessionLocal() as db:
        rows = list(
            db.scalars(
                select(Message).where(
                    Message.expires_at.is_not(None), Message.expires_at <= utcnow()
                )
            )
        )
        deleted = [(row.conversation_id, row.id) for row in rows]
        for row in rows:
            db.delete(row)
        if deleted:
            db.commit()
            logger.info("sweeper removed %d expired message(s)", len(deleted))
        return deleted


async def _sweep_forever() -> None:
    while True:
        try:
            expired = await asyncio.to_thread(delete_expired_messages)
            if expired:
                # Imported here to avoid a circular import at module load time.
                from app.ws.connection_manager import manager

                for conversation_id, message_id in expired:
                    await manager.broadcast_to_conversation(
                        conversation_id,
                        {
                            "type": "message.expired",
                            "data": {"message_id": message_id, "conversation_id": conversation_id},
                        },
                    )
        except asyncio.CancelledError:
            raise
        except Exception:  # pragma: no cover - the loop must never die
            logger.exception("sweeper iteration failed")
        await asyncio.sleep(settings.SWEEPER_INTERVAL_SECONDS)


def start_sweeper() -> asyncio.Task:
    """Called from the app lifespan."""
    return asyncio.create_task(_sweep_forever())


@contextlib.asynccontextmanager
async def noop():
    """Small helper used by tests that do not want the background task."""
    yield
