"""Shared authorization rules for both the bot and the API."""
from __future__ import annotations

from collections.abc import Iterable
from typing import Literal

import discord

from .config import get_settings

Level = Literal["admin", "member"]


def access_level(role_names: Iterable[str], *, is_owner: bool) -> Level | None:
    """What the site lets someone do, from their role names in the guild.

    An admin role implies membership, so someone holding Beasts without
    Members is still in. Anyone with neither -- a Guest, or no role at all --
    gets None and is not admitted. Names match without regard to case.
    """
    if is_owner:
        return "admin"
    settings = get_settings()
    held = {name.casefold() for name in role_names}
    if held & {r.casefold() for r in settings.admin_roles}:
        return "admin"
    if held & {r.casefold() for r in settings.member_roles}:
        return "member"
    return None


def member_is_admin(member: discord.Member | None) -> bool:
    """True when the member holds one of the configured admin roles.

    The server owner always qualifies, so a role rename can never lock
    everyone out of the bot.

    Discord's Administrator permission is deliberately *not* honored as a
    shortcut. On a typical alliance server it is handed to several roles —
    helpers, bot integrations, secondary ranks — and treating it as officer
    rights would let all of them schedule alliance-wide announcements. This
    matches the rule the backoffice login applies in api/routers/auth.py.
    """
    if member is None:
        return False
    guild = getattr(member, "guild", None)
    is_owner = guild is not None and member.id == guild.owner_id
    return access_level((role.name for role in member.roles), is_owner=is_owner) == "admin"


def admin_only():
    """Slash-command check restricting a command to alliance officers."""

    async def predicate(interaction: discord.Interaction) -> bool:
        if not member_is_admin(
            interaction.user if isinstance(interaction.user, discord.Member) else None
        ):
            raise discord.app_commands.CheckFailure(
                "This command is limited to alliance admins."
            )
        return True

    return discord.app_commands.check(predicate)
