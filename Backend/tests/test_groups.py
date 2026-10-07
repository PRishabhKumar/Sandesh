"""Group rules: admin permissions, soft removal, system messages."""


def _create_group(client, creator, member_ids, name="QA Group"):
    response = client.post(
        "/api/v1/groups", json={"name": name, "member_ids": member_ids}, headers=creator.headers
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_creator_becomes_admin_and_gets_a_system_message(client, make_user):
    a = make_user(name="Admin")
    b = make_user(name="Bea")

    group = _create_group(client, a, [b.id])
    assert group["type"] == "group"
    assert group["role"] == "admin"
    roles = {member["user"]["id"]: member["role"] for member in group["members"]}
    assert roles[a.id] == "admin" and roles[b.id] == "member"

    history = client.get(f"/api/v1/conversations/{group['id']}/messages", headers=a.headers).json()
    assert history["messages"][0]["kind"] == "system"
    assert "created the group" in history["messages"][0]["body"]


def test_non_admin_cannot_add_or_remove_members(client, make_user):
    a = make_user(name="Admin")
    b = make_user(name="Bea")
    outsider = make_user(name="Outsider")

    group = _create_group(client, a, [b.id])
    group_id = group["id"]

    add = client.post(
        f"/api/v1/groups/{group_id}/members", json={"user_ids": [outsider.id]}, headers=b.headers
    )
    assert add.status_code == 403
    assert add.json()["error"]["code"] == "admin_required"

    remove = client.delete(f"/api/v1/groups/{group_id}/members/{outsider.id}", headers=b.headers)
    assert remove.status_code == 403


def test_admin_removes_member_and_access_is_revoked(client, make_user):
    a = make_user(name="Admin")
    b = make_user(name="Bea")

    group_id = _create_group(client, a, [b.id])["id"]

    assert (
        client.delete(f"/api/v1/groups/{group_id}/members/{b.id}", headers=a.headers).status_code
        == 204
    )

    # Bea's history is gone and she can no longer post
    assert (
        client.get(f"/api/v1/conversations/{group_id}/messages", headers=b.headers).status_code
        == 403
    )
    assert (
        client.post(
            f"/api/v1/conversations/{group_id}/messages",
            json={"body": "still here?"},
            headers=b.headers,
        ).status_code
        == 403
    )

    # ...but she can no longer see the group in her chat list either
    ids = [c["id"] for c in client.get("/api/v1/conversations", headers=b.headers).json()]
    assert group_id not in ids

    # the system message records the removal
    history = client.get(f"/api/v1/conversations/{group_id}/messages", headers=a.headers).json()
    assert history["messages"][-1]["system_event"] == "member_removed"


def test_promote_demote_and_last_admin_rule(client, make_user):
    a = make_user(name="Admin")
    b = make_user(name="Bea")
    group_id = _create_group(client, a, [b.id])["id"]

    promote = client.patch(
        f"/api/v1/groups/{group_id}/members/{b.id}", json={"role": "admin"}, headers=a.headers
    )
    assert promote.status_code == 200
    roles = {member["user"]["id"]: member["role"] for member in promote.json()["members"]}
    assert roles[b.id] == "admin"

    # Ali (still an admin) steps down - Bea keeps the group manageable
    demote_a = client.patch(
        f"/api/v1/groups/{group_id}/members/{a.id}", json={"role": "member"}, headers=a.headers
    )
    assert demote_a.status_code == 200

    # ...and Ali, now a plain member, cannot promote himself back
    self_promote = client.patch(
        f"/api/v1/groups/{group_id}/members/{a.id}", json={"role": "admin"}, headers=a.headers
    )
    assert self_promote.status_code == 403

    # Bea is the last admin and cannot step down (nobody could manage the group)
    demote_b = client.patch(
        f"/api/v1/groups/{group_id}/members/{b.id}", json={"role": "member"}, headers=b.headers
    )
    assert demote_b.status_code == 400
    assert demote_b.json()["error"]["code"] == "last_admin"


def test_leave_group_promotes_the_oldest_member(client, make_user):
    a = make_user(name="Admin")
    b = make_user(name="Bea")
    group_id = _create_group(client, a, [b.id])["id"]

    leave = client.delete(f"/api/v1/groups/{group_id}/members/{a.id}", headers=a.headers)
    assert leave.status_code == 204

    detail = client.get(f"/api/v1/groups/{group_id}", headers=b.headers).json()
    assert detail["role"] == "admin"  # Bea inherited the admin role
    assert [m["user"]["id"] for m in detail["members"]] == [b.id]


def test_group_permission_members_can_add(client, make_user):
    """When the admin allows it, members may add people too."""
    a = make_user(name="Admin")
    b = make_user(name="Bea")
    c = make_user(name="Cara")

    group_id = _create_group(client, a, [b.id])["id"]
    client.patch(f"/api/v1/groups/{group_id}", json={"members_can_add": True}, headers=a.headers)

    added = client.post(
        f"/api/v1/groups/{group_id}/members", json={"user_ids": [c.id]}, headers=b.headers
    )
    assert added.status_code == 200
    assert c.id in [member["user"]["id"] for member in added.json()["members"]]


def test_only_admins_can_send_when_enabled(client, make_user):
    a = make_user(name="Admin")
    b = make_user(name="Bea")
    group_id = _create_group(client, a, [b.id])["id"]

    client.patch(
        f"/api/v1/groups/{group_id}", json={"only_admins_can_send": True}, headers=a.headers
    )

    blocked = client.post(
        f"/api/v1/conversations/{group_id}/messages", json={"body": "hi"}, headers=b.headers
    )
    assert blocked.status_code == 403
    assert blocked.json()["error"]["code"] == "admins_only_send"
