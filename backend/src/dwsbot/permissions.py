"""Shared authorization rules for both the bot and the API."""
from __future__ import annotations

import discord

from .config import get_settings


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
    if guild is not None and member.id == guild.owner_id:
        return True
    allowed = {r.casefold() for r in get_settings().admin_roles}
    return any(role.name.casefold() in allowed for role in member.roles)


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
