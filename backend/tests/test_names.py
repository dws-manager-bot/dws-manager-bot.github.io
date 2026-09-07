"""Display names resolved at read time.

A name written into a row is frozen: change your server nickname and every
byline you ever created keeps the old one. These cover the lookup that
replaces that behavior.
"""
from __future__ import annotations

import os
from types import SimpleNamespace

import pytest

from dwsbot import names

ME = 307004256588791808


@pytest.fixture
def guild(monkeypatch):
    """Install a fake guild membership for the bot to look up."""
    os.environ.setdefault("DISCORD_TOKEN", "t")
    os.environ.setdefault("GUILD_ID", "1")
    os.environ.setdefault("JWT_SECRET", "x" * 40)

    def install(members, *, connected=True):
        from dwsbot.discord_bot import bot as bot_module

        fake_guild = SimpleNamespace(get_member=lambda i: members.get(i))
        monkeypatch.setattr(
            bot_module,
            "bot",
            SimpleNamespace(get_guild=lambda _id: fake_guild if connected else None),
        )
        monkeypatch.setattr(names, "get_settings", lambda: SimpleNamespace(guild_id=1))

    return install


def member(nick=None, global_name=None, name="fallback"):
    return SimpleNamespace(nick=nick, global_name=global_name, name=name)


def test_the_server_nickname_wins(guild):
    """The real case: nickname is the in-game name, the account name is not."""
    guild({ME: member(nick="고추바사삭(Goba)", global_name="gnar_.", name="gnar_.")})

    assert names.guild_display_name(ME, "gnar_.") == "고추바사삭(Goba)"


def test_falls_back_to_the_account_name_without_a_nickname(guild):
    guild({ME: member(nick=None, global_name="Saki", name="saki_rd")})

    assert names.guild_display_name(ME, "Saki") == "Saki"


def test_a_blank_nickname_is_not_a_name(guild):
    guild({ME: member(nick="   ", global_name="Saki", name="saki_rd")})

    assert names.guild_display_name(ME, None) == "Saki"


def test_someone_who_has_left_keeps_their_stored_name(guild):
    """A byline must not vanish because the person is gone."""
    guild({})

    assert names.guild_display_name(ME, "gnar_.") == "gnar_."


def test_a_disconnected_bot_falls_back(guild):
    """Discord being unreachable must not blank every byline in the UI."""
    guild({}, connected=False)

    assert names.guild_display_name(ME, "gnar_.") == "gnar_."


def test_no_id_returns_the_fallback(guild):
    """Rows written before ids were recorded still show something."""
    guild({ME: member(nick="Goba")})

    assert names.guild_display_name(None, "old name") == "old name"


def test_no_id_and_no_fallback_is_none(guild):
    guild({})

    assert names.guild_display_name(None) is None
