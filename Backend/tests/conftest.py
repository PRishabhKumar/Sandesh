"""Test fixtures.

The environment is configured *before* the app is imported, so the tests run
against their own throwaway SQLite file and never touch the demo database.
"""

import os
import pathlib

TEST_DB = pathlib.Path(__file__).resolve().parents[1] / "test_signal_clone.db"

os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB}"
os.environ["SEED_ON_BOOT"] = "false"
os.environ["JWT_SECRET"] = "test-secret"
os.environ["MOCK_OTP"] = "123456"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.database import Base, engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _database():
    """Fresh schema for the whole session."""
    for suffix in ("", "-wal", "-shm"):
        pathlib.Path(f"{TEST_DB}{suffix}").unlink(missing_ok=True)
    Base.metadata.create_all(bind=engine)
    yield
    engine.dispose()
    for suffix in ("", "-wal", "-shm"):
        pathlib.Path(f"{TEST_DB}{suffix}").unlink(missing_ok=True)


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


class Actor:
    """A signed-in test user: its id plus ready-made auth headers."""

    def __init__(self, user_id: int, token: str, display_name: str) -> None:
        self.id = user_id
        self.token = token
        self.display_name = display_name
        self.headers = {"Authorization": f"Bearer {token}"}


_counter = {"n": 0}


@pytest.fixture
def make_user(client):
    """Factory: creates a fresh account through the real OTP flow."""

    def _make(identifier: str | None = None, name: str = "Test User") -> Actor:
        _counter["n"] += 1
        identifier = identifier or f"tester{_counter['n']}"
        response = client.post(
            "/api/v1/auth/verify-otp", json={"identifier": identifier, "code": "123456"}
        )
        assert response.status_code == 200, response.text
        payload = response.json()
        client.post(
            "/api/v1/auth/profile",
            json={"display_name": name},
            headers={"Authorization": f"Bearer {payload['token']}"},
        )
        return Actor(payload["user"]["id"], payload["token"], name)

    return _make


@pytest.fixture
def open_direct(client):
    """Factory: opens (or creates) a 1:1 conversation between two actors."""

    def _open(a: Actor, b: Actor) -> int:
        response = client.post(
            "/api/v1/conversations/direct", json={"user_id": b.id}, headers=a.headers
        )
        assert response.status_code == 201, response.text
        return response.json()["id"]

    return _open
