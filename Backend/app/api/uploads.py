"""Attachment uploads.

One request does everything: store the file, create the message, fan it out.
That keeps the client simple (no two-phase "upload then send") and means a
message never exists without its file.

Files live on disk under ``UPLOAD_DIR`` with a random name; only metadata goes
into the database (``attachments`` table).
"""

import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.core.errors import bad_request
from app.models import User
from app.repositories import conversation_repository as conversations_repo
from app.schemas.message import MessageOut
from app.services import message_service
from app.ws import events

router = APIRouter(prefix="/conversations", tags=["uploads"])

# Deliberately conservative allow-list.
ALLOWED_MIME_TYPES = {
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "application/pdf",
    "text/plain",
    "application/zip",
}


@router.post("/{conversation_id}/attachments", response_model=MessageOut, status_code=201)
async def upload_attachment(
    conversation_id: int,
    file: UploadFile = File(...),
    caption: str | None = Form(default=None),
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
) -> MessageOut:
    """Send an image or file into a conversation."""
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise bad_request("That file type is not supported", "unsupported_file_type")

    contents = await file.read()
    max_bytes = settings.MAX_UPLOAD_MB * 1024 * 1024
    if len(contents) > max_bytes:
        raise bad_request(
            f"Files must be smaller than {settings.MAX_UPLOAD_MB} MB", "file_too_large"
        )
    if not contents:
        raise bad_request("The file is empty", "empty_file")

    original_name = Path(file.filename or "file").name
    suffix = Path(original_name).suffix
    relative_path = Path("attachments") / f"{uuid.uuid4().hex}{suffix}"
    target = Path(settings.UPLOAD_DIR) / relative_path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(contents)

    message, recipients, _conversation = message_service.send_attachment(
        db,
        me,
        conversation_id,
        file_name=original_name,
        mime_type=file.content_type,
        size_bytes=len(contents),
        storage_path=relative_path.as_posix(),
        caption=(caption or "").strip() or None,
    )

    dto = message_service.serialize_one(db, me.id, message)
    await events.broadcast_new_message(db, me.id, dto, recipients)
    await events.broadcast_conversation_updates(
        conversation_id, conversations_repo.active_member_ids(db, conversation_id)
    )
    return dto
