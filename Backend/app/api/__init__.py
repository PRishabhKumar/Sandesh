"""REST routers.

Each module owns one resource; ``api_router`` is mounted under
``settings.API_V1_PREFIX`` (``/api/v1``) by ``main.py``.
"""

from fastapi import APIRouter

from app.api import auth, contacts, conversations, groups, messages, settings, uploads, users

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(contacts.router)
api_router.include_router(conversations.router)
api_router.include_router(messages.router)
api_router.include_router(groups.router)
api_router.include_router(uploads.router)
api_router.include_router(settings.router)

__all__ = ["api_router"]
