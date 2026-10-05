"""Who counts as an alliance officer.

Discord's Administrator permission is intentionally not a shortcut here: on
the live server it is held by R5, Helpers and two bot integrations, none of
which should be able to schedule alliance-wide announcements.
"""
from __future__ import annotations

from types import SimpleNamespace

import pytest

from dwsbot import permissions


@pytest.fixture(autouse=True)
def officer_role_is_beasts(monkeypatch):
    monkeypatch.setattr(
        permissions,
        "get_settings",
        lambda: SimpleNamespace(admin_roles=["Beasts"], member_roles=["Members"]),
    )


def make_member(*, user_id=1, owner_id=999, roles=(), administrator=False):
    return SimpleNamespace(
        id=user_id,
        guild=SimpleNamespace(owner_id=owner_id),
        guild_permissions=SimpleNamespace(administrator=administrator),
        roles=[SimpleNamespace(name=n) for n in roles],
    )


def test_officer_role_is_admitted():
    assert permissions.member_is_admin(make_member(roles=["Members", "Beasts"]))


def test_role_match_ignores_case():
    assert permissions.member_is_admin(make_member(roles=["beasts"]))


def test_server_owner_is_admitted_without_the_role():
    assert permissions.member_is_admin(make_member(user_id=999, owner_id=999, roles=["Guest"]))


def test_plain_member_is_refused():
    assert not permissions.member_is_admin(make_member(roles=["Members"]))


@pytest.mark.parametrize("role", ["R5", "Helpers"])
def test_administrator_permission_is_not_a_shortcut(role):
    """R5 and Helpers hold Administrator on the real server but are not officers."""
    assert not permissions.member_is_admin(make_member(roles=[role], administrator=True))


def test_none_is_refused():
    assert not permissions.member_is_admin(None)
