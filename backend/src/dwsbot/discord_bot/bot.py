"""The Discord client: renders announcements and hosts the slash commands."""
from __future__ import annotations

import contextlib
import logging
from datetime import UTC, datetime

import discord
from discord.ext import commands

from ..config import get_settings
from ..messagetime import render_times
from ..models import Announcement
from ..occurrences import Occurrence

log = logging.getLogger(__name__)

COGS = (
    "dwsbot.discord_bot.cogs.events",
    "dwsbot.discord_bot.cogs.admin",
)


def build_intents() -> discord.Intents:
    intents = discord.Intents.default()
    # Privileged: enable "Server Members Intent" in the developer portal, or
    # role-based permission checks and roster sync will silently see nobody.
    intents.members = True
    return intents


class AllianceBot(commands.Bot):
    def __init__(self) -> None:
        self.settings = get_settings()
        super().__init__(
            command_prefix=commands.when_mentioned,
            intents=build_intents(),
            help_command=None,
        )

    async def setup_hook(self) -> None:
        for cog in COGS:
            try:
                await self.load_extension(cog)
            except Exception:
                log.exception("failed to load cog %s", cog)

        # Guild-scoped sync lands immediately; a global sync can take ~an hour.
        guild = discord.Object(id=self.settings.guild_id)
        self.tree.copy_global_to(guild=guild)
        synced = await self.tree.sync(guild=guild)
        log.info("synced %d slash commands to guild %s", len(synced), self.settings.guild_id)

    async def on_ready(self) -> None:
        log.info("logged in as %s (%s)", self.user, self.user.id if self.user else "?")

    # ---------------------------------------------------------------- sending

    @staticmethod
    def _reschedule_lines(occurrence: Occurrence | None) -> list[str]:
        """Why this date is not where members expect it.

        Uses Discord's own timestamp markup so the original slot renders in
        each member's timezone, the same as every other time the bot posts.
        """
        if occurrence is None or not occurrence.moved:
            return []
        was = int(occurrence.original_starts_at.timestamp())
        lines = [f"Rescheduled — was <t:{was}:F>"]
        if occurrence.note:
            lines.append(occurrence.note)
        return lines

    def render(
        self, ann: Announcement, occurrence: Occurrence | None = None
    ) -> tuple[str | None, discord.Embed | None]:
        """Turn an announcement row into Discord message parts."""
        prefix = f"{ann.mention}\n" if ann.mention else ""
        moved = self._reschedule_lines(occurrence)

        # The moment the message is about: the occurrence when it announces one,
        # otherwise the moment it goes out. Resolved here rather than stored, so
        # a weekly announcement names this week's time and not the first one.
        when = occurrence.starts_at if occurrence else datetime.now(UTC)
        body = render_times(ann.body, when)
        heading = render_times(ann.title, when)

        if not ann.use_embed:
            title = f"**{heading}**\n" if heading else ""
            tail = ("\n\n> " + "\n> ".join(moved)) if moved else ""
            return f"{prefix}{title}{body}{tail}", None

        colour = discord.Colour.blurple()
        if ann.embed_color:
            # A malformed colour must not stop the announcement going out.
            with contextlib.suppress(ValueError):
                colour = discord.Colour(int(ann.embed_color.lstrip("#"), 16))

        embed = discord.Embed(
            title=heading or ann.name,
            description=body,
            colour=colour,
        )
        if moved:
            embed.add_field(name="⏰ Rescheduled", value="\n".join(moved), inline=False)
        # The mention must sit in `content`; mentions inside an embed do not ping.
        return (prefix or None), embed

    async def send_announcement(
        self, ann: Announcement, occurrence: Occurrence | None = None
    ) -> None:
        channel = self.get_channel(ann.channel_id) or await self.fetch_channel(ann.channel_id)
        if not isinstance(channel, discord.abc.Messageable):
            raise RuntimeError(f"channel {ann.channel_id} is not messageable")

        content, embed = self.render(ann, occurrence)
        allowed = discord.AllowedMentions(everyone=True, roles=True, users=True)
        await channel.send(content=content, embed=embed, allowed_mentions=allowed)
        log.info(
            "sent announcement %s (%s) to #%s",
            ann.id, ann.name, getattr(channel, "name", "?"),
        )


bot = AllianceBot()
