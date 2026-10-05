"""Signing in: the login state, and who the site lets in.

It admits members only: the Members role, an admin role, or the server owner.
The token's is_admin then decides who may open the admin pages and save.
"""
from __future__ import annotations

import asyncio
import time
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from dwsbot import permissions, security
from dwsbot.api import deps


@pytest.fixture(autouse=True)
def signing_key(monkeypatch):
    monkeypatch.setattr(
        security,
        "get_settings",
        lambda: SimpleNamespace(jwt_secret="k" * 40, jwt_ttl_hours=12),
    )


def test_state_round_trips_each_app():
    for app in security.APPS:
        assert security.verify_state(security.make_state(app)) == app


def test_unknown_app_falls_back_to_backoffice():
    # The stricter of the two, so a malformed hint cannot widen access.
    assert security.verify_state(security.make_state("evil")) == "backoffice"


def test_default_is_backoffice():
    assert security.verify_state(security.make_state()) == "backoffice"


def test_tampered_app_is_rejected():
    nonce, _app, issued, sig = security.make_state("backoffice").split(".")
    forged = f"{nonce}.elsewhere.{issued}.{sig}"
    assert security.verify_state(forged) is None


def test_garbage_and_old_states_are_rejected():
    assert security.verify_state("nope") is None
    assert security.verify_state("") is None
    stale = security.make_state("backoffice")
    nonce, app, _issued, _sig = stale.split(".")
    old = str(int(time.time()) - 4000)
    assert security.verify_state(f"{nonce}.{app}.{old}.{_sig}") is None


# ------------------------------- who is let in -------------------------------

@pytest.fixture
def live_roles(monkeypatch):
    """The live server's rule: Beasts and R5 are admins, Members are members."""
    monkeypatch.setattr(
        permissions,
        "get_settings",
        lambda: SimpleNamespace(admin_roles=["Beasts", "R5"], member_roles=["Members"]),
    )


@pytest.mark.parametrize(
    "roles, is_owner, expected",
    [
        (["Members"], False, "member"),
        (["Members", "Beasts"], False, "admin"),
        (["Beasts"], False, "admin"),          # an admin role implies membership
        (["R5"], False, "admin"),
        (["members"], False, "member"),        # case does not matter
        (["Guest"], False, None),              # in the server, but not a member
        (["Helpers"], False, None),
        (["Server Booster"], False, None),
        ([], False, None),                     # no role, or not in the server
        ([], True, "admin"),                   # the owner, whatever their roles
        (["Guest"], True, "admin"),
    ],
)
def test_access_level(live_roles, roles, is_owner, expected):
    assert permissions.access_level(roles, is_owner=is_owner) == expected


def test_tokens_are_marked_as_minted_for_members():
    token = security.issue_token(discord_id=1, username="x", is_admin=False)
    assert security.decode_token(token)["mem"] is True


def _bearer(payload):
    import jwt

    return HTTPAuthorizationCredentials(
        scheme="Bearer", credentials=jwt.encode(payload, "k" * 40, algorithm="HS256")
    )


def test_a_token_from_before_the_members_rule_must_sign_in_again():
    """It was issued to anyone in the server, Guests included."""
    old = {"sub": "1", "name": "x", "adm": False, "exp": int(time.time()) + 600}
    with pytest.raises(HTTPException) as caught:
        asyncio.run(deps.current_user(_bearer(old)))
    assert caught.value.status_code == 401


@pytest.mark.parametrize(
    "claims, is_admin",
    [
        ({"mem": True, "adm": False}, False),
        ({"mem": True, "adm": True}, True),
        ({"adm": True}, True),     # an old admin token: admins were always members
    ],
)
def test_member_and_admin_tokens_are_accepted(claims, is_admin):
    payload = {"sub": "1", "name": "x", "exp": int(time.time()) + 600, **claims}
    user = asyncio.run(deps.current_user(_bearer(payload)))
    assert user.is_admin is is_admin


# ----------------------------- what to call someone --------------------------

@pytest.mark.parametrize(
    "nick, global_name, username, expected",
    [
        ("Dubai88", "donggi", "xronace", "Dubai88"),      # server nickname wins
        (None, "donggi", "xronace", "donggi"),            # no nickname set
        ("", "donggi", "xronace", "donggi"),              # cleared nickname
        ("   ", "donggi", "xronace", "donggi"),           # whitespace is not a name
        (None, None, "xronace", "xronace"),               # legacy account
        ("  Kagura Forger ", "x", "y", "Kagura Forger"),  # trimmed
        (None, None, None, "unknown"),
    ],
)
def test_display_name_prefers_the_server_nickname(nick, global_name, username, expected):
    user = {"global_name": global_name, "username": username}
    assert security.display_name(user, nick) == expected


def test_display_name_handles_cjk_nicknames():
    assert security.display_name({"global_name": "x"}, "미미짱") == "미미짱"
