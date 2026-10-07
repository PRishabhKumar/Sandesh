"""Application entrypoint.

    uvicorn app.main:app --reload --port 8000

Boot sequence (``lifespan``):
1. create any missing tables (``init_db``)
2. seed demo data the first time the database is empty
3. start the background sweeper that deletes expired (disappearing) messages
"""

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api import api_router
from app.core.config import settings
from app.core.database import init_db
from app.core.errors import ApiError, api_error_handler, validation_error_handler
from app.ws.router import router as ws_router

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("app")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()

    if settings.SEED_ON_BOOT:
        from app.seed.seed import seed_if_empty

        seed_if_empty()

    from app.services.sweeper import start_sweeper

    sweeper_task = start_sweeper()

    logger.info("%s ready - docs at /docs", settings.APP_NAME)
    try:
        yield
    finally:
        sweeper_task.cancel()


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description=(
        "Backend for a Signal-style secure messaging platform (SDE Fullstack assignment).\n\n"
        "Crypto is **simulated**: verification uses a fixed OTP and there is no real "
        "end-to-end encryption. Everything else - conversations, receipts, groups, "
        "presence - is real."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_exception_handler(ApiError, api_error_handler)
app.add_exception_handler(RequestValidationError, validation_error_handler)

app.include_router(api_router, prefix=settings.API_V1_PREFIX)
# WebSocket lives at the root (/ws?token=...) - it is not versioned like REST.
app.include_router(ws_router)

# Uploaded avatars / attachments are served straight from disk.
_upload_dir = Path(settings.UPLOAD_DIR)
_upload_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=_upload_dir), name="uploads")


@app.get("/health", tags=["meta"])
def health() -> dict[str, str]:
    """Cheap endpoint for uptime checks and cold-start wake-ups."""
    return {"status": "ok", "service": settings.APP_NAME, "version": settings.APP_VERSION}


@app.get("/", tags=["meta"])
def root() -> dict[str, str]:
    return {"message": f"{settings.APP_NAME} - see /docs for the API reference"}
