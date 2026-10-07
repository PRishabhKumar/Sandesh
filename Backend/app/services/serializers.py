"""Model -> DTO conversion.

REST routes and WebSocket events both send the *same* JSON shape, so the client
has exactly one type to deal with (``Message`` / ``Conversation`` in
``types.ts``). Keeping the mapping in one module is also what stops the two
adapters from drifting apart.
"""

import json

from app.core.database import utcnow
from app.models import Contact, Conversation, ConversationMember, Message, User
from app.schemas.contact import ContactOut
from app.schemas.conversation import ConversationDetailOut, ConversationOut, MemberOut
from app.schemas.message import AttachmentOut, MessageOut, ReactionOut, ReplyPreviewOut
from app.schemas.user import UserOut


def user_out(user: User) -> UserOut:
    return UserOut.model_validate(user)


def message_out(
    message: Message,
    *,
    status: str = "sent",
    sender_name: str | None = None,
    reply_preview: Message | None = None,
    reply_sender_name: str | None = None,
) -> MessageOut:
    """One message. ``status`` is computed by ``receipt_service``, never stored."""
    reply = None
    if reply_preview is not None:
        reply = ReplyPreviewOut(
            id=reply_preview.id,
            sender_id=reply_preview.sender_id,
            sender_name=reply_sender_name,
            body=reply_preview.body,
        )

    return MessageOut(
        id=message.id,
        conversation_id=message.conversation_id,
        sender_id=message.sender_id,
        sender_name=sender_name,
        client_id=message.client_id,
        kind=message.kind,
        body=message.body,
        system_event=message.system_event,
        system_payload=json.loads(message.system_payload) if message.system_payload else None,
        reply_to=reply,
        reactions=[ReactionOut.model_validate(r) for r in message.reactions],
        attachments=[
            AttachmentOut(
                id=a.id,
                file_name=a.file_name,
                mime_type=a.mime_type,
                size_bytes=a.size_bytes,
                url=f"/uploads/{a.storage_path}",
            )
            for a in message.attachments
        ],
        status=status,
        created_at=message.created_at,
        edited_at=message.edited_at,
        deleted_at=message.deleted_at,
        expires_at=message.expires_at,
    )


def member_out(membership: ConversationMember) -> MemberOut:
    return MemberOut(
        user=user_out(membership.user),
        role=membership.role,
        joined_at=membership.joined_at,
        last_read_message_id=membership.last_read_message_id,
    )


def conversation_out(
    conversation: Conversation,
    *,
    membership: ConversationMember,
    title: str,
    last_message: MessageOut | None = None,
    unread_count: int = 0,
    peer: User | None = None,
    member_count: int = 0,
    is_online: bool = False,
) -> ConversationOut:
    """One chat-list row / chat-header payload."""
    return ConversationOut(
        id=conversation.id,
        type=conversation.type,
        title=title,
        avatar_url=conversation.avatar_url,
        avatar_color=conversation.avatar_color or (peer.avatar_color if peer else None),
        about=conversation.description
        if conversation.type == "group"
        else (peer.about if peer else None),
        peer=user_out(peer) if peer else None,
        member_count=member_count,
        last_message=last_message,
        last_message_at=conversation.last_message_at,
        unread_count=unread_count,
        pinned=membership.pinned,
        muted=membership.muted_until is not None and membership.muted_until > utcnow(),
        archived=membership.archived,
        role=membership.role if conversation.type == "group" else None,
        disappearing_secs=conversation.disappearing_secs,
        members_can_add=conversation.members_can_add,
        only_admins_can_send=conversation.only_admins_can_send,
        is_online=is_online,
    )


def conversation_detail_out(
    conversation: ConversationOut, members: list[ConversationMember]
) -> ConversationDetailOut:
    return ConversationDetailOut(
        **conversation.model_dump(), members=[member_out(m) for m in members]
    )


def contact_out(contact: Contact) -> ContactOut:
    return ContactOut(
        id=contact.id,
        user=user_out(contact.contact_user),
        nickname=contact.nickname,
        blocked=contact.blocked,
        created_at=contact.created_at,
    )
