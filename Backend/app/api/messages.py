"""Message-level actions: delete and react. (/messages/*)"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import User
from app.repositories import conversation_repository as conversations_repo
from app.schemas.message import MessageOut, ReactionIn
from app.services import message_service
from app.ws import events
from app.ws.connection_manager import manager

router = APIRouter(prefix="/messages", tags=["messages"])


@router.delete("/{message_id}", status_code=204)
async def delete_message(
    message_id: int,
    scope: str = Query(default="everyone", pattern="^(me|everyone)$"),
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
) -> None:
    """``scope=everyone`` leaves a tombstone for all; ``scope=me`` hides it for me."""
    _message, conversation_id = message_service.delete_message(db, me, message_id, scope)

    if scope == "me":
        # Only my own devices need to know.
        await manager.send_to_user(
            me.id,
            events.envelope(
                "message.deleted",
                {"conversation_id": conversation_id, "message_id": message_id, "scope": "me"},
            ),
        )
        return

    member_ids = conversations_repo.active_member_ids(db, conversation_id)
    await events.broadcast_message_deleted(conversation_id, member_ids, message_id, "everyone")
    await events.broadcast_conversation_updates(conversation_id, member_ids)


@router.put("/{message_id}/reaction", response_model=MessageOut)
async def react_to_message(
    message_id: int,
    payload: ReactionIn,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
) -> MessageOut:
    """Add / change / clear my reaction (``emoji=null`` clears it)."""
    message, conversation_id = message_service.set_reaction(db, me, message_id, payload.emoji)
    dto = message_service.serialize_one(db, me.id, message)
    await events.broadcast_reaction(
        conversation_id, conversations_repo.active_member_ids(db, conversation_id), dto
    )
    return dto
