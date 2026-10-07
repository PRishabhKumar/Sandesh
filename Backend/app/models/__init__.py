"""SQLAlchemy models.

Importing this package registers every table on ``Base.metadata``, which is what
``init_db()`` uses to create the schema.
"""

from app.models.contact import Contact
from app.models.conversation import Conversation, ConversationMember
from app.models.message import Attachment, Message, MessageDeletion, MessageReceipt, Reaction
from app.models.user import OtpCode, User, UserSettings

__all__ = [
    "Attachment",
    "Contact",
    "Conversation",
    "ConversationMember",
    "Message",
    "MessageDeletion",
    "MessageReceipt",
    "OtpCode",
    "Reaction",
    "User",
    "UserSettings",
]
