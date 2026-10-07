"""Direct chats, the chat list, cursor pagination and contacts."""


def test_direct_chat_is_get_or_create(client, make_user, open_direct):
    """`direct_key` + its unique index mean one chat per pair, whoever opens it."""
    a = make_user(name="Ali")
    b = make_user(name="Bea")

    first = open_direct(a, b)
    second = open_direct(a, b)  # same caller again
    third = open_direct(b, a)  # the other party opens it
    assert first == second == third


def test_history_pagination_returns_every_message_once(client, make_user, open_direct):
    a = make_user(name="Ali")
    b = make_user(name="Bea")
    conversation_id = open_direct(a, b)

    for index in range(12):
        client.post(
            f"/api/v1/conversations/{conversation_id}/messages",
            json={"body": f"message {index}"},
            headers=a.headers,
        )

    page1 = client.get(
        f"/api/v1/conversations/{conversation_id}/messages?limit=5", headers=b.headers
    ).json()
    assert len(page1["messages"]) == 5
    assert page1["has_more"] is True
    assert page1["messages"][-1]["body"] == "message 11"  # newest last

    page2 = client.get(
        f"/api/v1/conversations/{conversation_id}/messages?limit=5&before={page1['next_cursor']}",
        headers=b.headers,
    ).json()
    page3 = client.get(
        f"/api/v1/conversations/{conversation_id}/messages?limit=5&before={page2['next_cursor']}",
        headers=b.headers,
    ).json()

    # Each page is ordered oldest -> newest (ready to render top-to-bottom) and
    # the pages walk backwards through history without gaps or duplicates.
    page1_ids = [m["id"] for m in page1["messages"]]
    page2_ids = [m["id"] for m in page2["messages"]]
    page3_ids = [m["id"] for m in page3["messages"]]

    assert page1_ids == sorted(page1_ids)
    assert page2_ids == sorted(page2_ids)
    assert max(page2_ids) < min(page1_ids)  # strictly older
    assert max(page3_ids) < min(page2_ids)
    assert len(page3_ids) == 2  # 12 messages / 5 per page
    assert page3["has_more"] is False

    collected = page1_ids + page2_ids + page3_ids
    assert len(collected) == 12
    assert len(set(collected)) == 12  # no duplicates


def test_chat_list_ordering_and_search(client, make_user, open_direct):
    a = make_user(name="Ali")
    b = make_user(name="Bea")
    c = make_user(name="Cara")

    first = open_direct(a, b)
    second = open_direct(a, c)

    client.post(
        f"/api/v1/conversations/{second}/messages",
        json={"body": "newest activity"},
        headers=a.headers,
    )

    conversations = client.get("/api/v1/conversations", headers=a.headers).json()
    assert conversations[0]["id"] == second  # most recent activity first
    assert conversations[0]["last_message"]["body"] == "newest activity"

    search = client.get("/api/v1/conversations?q=Bea", headers=a.headers).json()
    assert [row["id"] for row in search] == [first]


def test_pin_mute_archive_are_per_user(client, make_user, open_direct):
    a = make_user(name="Ali")
    b = make_user(name="Bea")
    conversation_id = open_direct(a, b)
    open_direct(a, make_user(name="Cara"))  # second chat, more recent

    pinned = client.patch(
        f"/api/v1/conversations/{conversation_id}/me", json={"pinned": True}, headers=a.headers
    )
    assert pinned.status_code == 200
    assert pinned.json()["pinned"] is True

    # pinned first even though the other chat is newer
    assert client.get("/api/v1/conversations", headers=a.headers).json()[0]["id"] == conversation_id

    archived = client.patch(
        f"/api/v1/conversations/{conversation_id}/me", json={"archived": True}, headers=a.headers
    )
    assert archived.json()["archived"] is True
    ids = [row["id"] for row in client.get("/api/v1/conversations", headers=a.headers).json()]
    assert conversation_id not in ids

    # the other person's view is untouched
    other_view = client.get("/api/v1/conversations", headers=b.headers).json()
    assert next(row for row in other_view if row["id"] == conversation_id)["pinned"] is False


def test_contacts_and_lookup(client, make_user):
    a = make_user(name="Ali")
    b = make_user("+919999000011", name="Bea")

    added = client.post("/api/v1/contacts", json={"identifier": "+919999000011"}, headers=a.headers)
    assert added.status_code == 201
    assert added.json()["user"]["display_name"] == "Bea"

    duplicate = client.post(
        "/api/v1/contacts", json={"identifier": "+919999000011"}, headers=a.headers
    )
    assert duplicate.status_code == 409

    missing = client.post(
        "/api/v1/contacts", json={"identifier": "+910000000000"}, headers=a.headers
    )
    assert missing.status_code == 404

    search = client.get("/api/v1/users/lookup?q=%2B919999000011", headers=a.headers).json()
    assert search["exact_match"]["id"] == b.id

    assert len(client.get("/api/v1/contacts", headers=a.headers).json()) == 1


def test_non_member_cannot_read_history(client, make_user, open_direct):
    a = make_user(name="Ali")
    b = make_user(name="Bea")
    outsider = make_user(name="Outsider")
    conversation_id = open_direct(a, b)

    response = client.get(
        f"/api/v1/conversations/{conversation_id}/messages", headers=outsider.headers
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "not_a_member"


def test_disappearing_timer_sets_expiry_and_writes_a_system_message(client, make_user, open_direct):
    a = make_user(name="Ali")
    b = make_user(name="Bea")
    conversation_id = open_direct(a, b)

    response = client.patch(
        f"/api/v1/conversations/{conversation_id}/disappearing",
        json={"disappearing_secs": 3600},
        headers=a.headers,
    )
    assert response.status_code == 200
    assert response.json()["disappearing_secs"] == 3600

    sent = client.post(
        f"/api/v1/conversations/{conversation_id}/messages",
        json={"body": "this will vanish"},
        headers=a.headers,
    ).json()  # POST returns the created message
    assert sent["expires_at"] is not None

    history = client.get(
        f"/api/v1/conversations/{conversation_id}/messages", headers=a.headers
    ).json()
    assert history["messages"][-2]["system_event"] == "timer_changed"
