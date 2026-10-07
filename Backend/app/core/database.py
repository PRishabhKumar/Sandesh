"""Database engine, session factory and schema creation.

Design notes
------------
* We use *synchronous* SQLAlchemy. FastAPI runs sync path operations in a
  threadpool, and the query load here (single-file SQLite, indexed lookups) is
  tiny. This keeps the code easy to read and to explain.
* SQLite needs two pragmas to behave like a real relational database:
  ``foreign_keys=ON`` (off by default in SQLite!) and ``journal_mode=WAL`` so
  readers are not blocked by the writer.
"""

from collections.abc import Generator
from datetime import UTC, datetime

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings


def utcnow() -> datetime:
    """Naive UTC timestamp.

    SQLite has no timezone type, so we store UTC everywhere and let the client
    render it in local time. Returning a naive value keeps reads and writes
    symmetric (no timezone-aware/naive comparison errors).
    """
    return datetime.now(UTC).replace(tzinfo=None)


engine = create_engine(
    settings.DATABASE_URL,
    # SQLite only: FastAPI may touch the same connection from a different thread.
    connect_args={"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {},
    pool_pre_ping=True,
)


@event.listens_for(Engine, "connect")
def _set_sqlite_pragmas(dbapi_connection, _connection_record) -> None:
    """Enable FK enforcement + WAL for every SQLite connection."""
    if settings.DATABASE_URL.startswith("sqlite"):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


class Base(DeclarativeBase):
    """Declarative base shared by every model."""


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency: one session per request, always closed."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create all tables that do not exist yet.

    Importing ``app.models`` registers every table on ``Base.metadata``.
    """
    from app import models  # noqa: F401  (import registers the models)

    Base.metadata.create_all(bind=engine)
