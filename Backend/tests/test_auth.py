"""Auth / onboarding flow."""

from app.services.auth_service import parse_identifier


def test_identifier_parsing():
    """Phone vs username detection - the rule the whole signup flow rests on."""
    assert parse_identifier("+91 90000 00001") == ("+919000000001", None)
    assert parse_identifier("9000000001") == ("+9000000001", None)
    assert parse_identifier("Aarav.Sharma") == (None, "aarav.sharma")


def test_full_onboarding_flow(client):
    # 1. request a code (always succeeds - it is mocked)
    otp = client.post("/api/v1/auth/request-otp", json={"identifier": "9898989898"})
    assert otp.status_code == 200
    assert otp.json()["dev_code"] == "123456"

    # 2. a wrong code is rejected
    bad = client.post(
        "/api/v1/auth/verify-otp", json={"identifier": "9898989898", "code": "111111"}
    )
    assert bad.status_code == 400
    assert bad.json()["error"]["code"] == "invalid_otp"

    # 3. the right code creates the account and returns a token
    verified = client.post(
        "/api/v1/auth/verify-otp", json={"identifier": "9898989898", "code": "123456"}
    )
    assert verified.status_code == 200
    body = verified.json()
    assert body["is_new"] is True
    assert body["needs_profile"] is True
    headers = {"Authorization": f"Bearer {body['token']}"}

    # 4. onboarding sets the display name
    profile = client.post(
        "/api/v1/auth/profile", json={"display_name": "Naveen K"}, headers=headers
    )
    assert profile.status_code == 200
    assert profile.json()["display_name"] == "Naveen K"

    # 5. the session survives a "refresh" (GET /auth/me)
    me = client.get("/api/v1/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["user"]["display_name"] == "Naveen K"
    assert me.json()["settings"]["read_receipts"] is True

    # 6. signing in again returns the same account (not a new one)
    again = client.post(
        "/api/v1/auth/verify-otp", json={"identifier": "9898989898", "code": "123456"}
    ).json()
    assert again["is_new"] is False
    assert again["user"]["id"] == body["user"]["id"]


def test_protected_routes_require_a_token(client):
    response = client.get("/api/v1/auth/me")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"

    tampered = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer nonsense"})
    assert tampered.status_code == 401


def test_duplicate_phone_is_the_same_account(client, make_user):
    """Same phone number twice -> one account (unique constraint + lookup)."""
    first = make_user("+919111111111", name="First")
    second = make_user("+919111111111", name="Second")
    assert first.id == second.id


def test_validation_errors_use_the_standard_envelope(client):
    response = client.post("/api/v1/auth/request-otp", json={"identifier": "ab"})
    assert response.status_code == 422
    assert set(response.json()["error"]) == {"code", "message"}
