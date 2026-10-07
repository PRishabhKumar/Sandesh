"""Shared access-control helpers.

Every conversation-scoped operation starts by answering two questions:
"does this conversation exist?" and "is the caller an active member?".
Keeping that in one small module means the check can never be forgotten in one
route but remembered in another - and the permission matrix stays readable.
"""

from sqlalchemy.orm import Session

from app.core.errors import forbidden, not_found
from app.models import Conversation, ConversationMember
from app.repositories import conversation_repository as conversations_repo


def get_conversation_or_404(db: Session, conversation_id: int) -> Conversation:
    conversation = conversations_repo.get(db, conversation_id)
    if conversation is None:
        raise not_found("Conversation not found", "conversation_not_found")
    return conversation


def require_membership(db: Session, conversation_id: int, user_id: int) -> ConversationMember:
    """Active membership or 403 (a removed member counts as an outsider)."""
    membership = conversations_repo.get_membership(db, conversation_id, user_id)
    if membership is None or membership.left_at is not None:
        raise forbidden("You are not a member of this conversation", "not_a_member")
    return membership


def require_admin(db: Session, conversation_id: int, user_id: int) -> ConversationMember:
    """Admins only: removing members, promoting, editing group info."""
    membership = require_membership(db, conversation_id, user_id)
    if membership.role != "admin":
        raise forbidden("Only group admins can do that", "admin_required")
    return membership


def require_group(db: Session, conversation_id: int) -> Conversation:
    conversation = get_conversation_or_404(db, conversation_id)
    if conversation.type != "group":
        raise forbidden("That action is only available in groups", "not_a_group")
    return conversation
