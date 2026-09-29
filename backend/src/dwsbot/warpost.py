"""Posting a war day's official plan to Discord.

One message: a heading that says which day and which plan, and the scenarios'
maps attached beneath it, in the order the plan lists them. The maps are drawn
by the admin's browser — it already has the view they framed — and handed
through here to Discord as they are; nothing is written to disk.
"""
from __future__ import annotations

import io
import logging
from datetime import date

log = logging.getLogger(__name__)

# Discord's limit on attachments to one message.
MAX_IMAGES = 10

# The site's gold, so the post and the planner agree.
ACCENT = 0xFBBF24

# `strftime('%a')` would read the container's locale.
WEEKDAYS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")

PNG = b"\x89PNG\r\n\x1a\n"


def title(day: date, day_title: str | None) -> str:
    """`War plan · 2026-10-03 (Sat) · Strife Pass`."""
    head = f"War plan · {day.isoformat()} ({WEEKDAYS[day.weekday()]})"
    return f"{head} · {day_title}" if day_title else head


def file_name(index: int, scenario: str) -> str:
    safe = "".join(ch if ch.isalnum() else "_" for ch in scenario).strip("_") or "scenario"
    return f"{index + 1:02d}_{safe[:40]}.png"


async def post(bot, channel_id: int, *, day: date, day_title: str | None, message: str,
               scenarios: list[str], images: list[bytes], source: str | None) -> str:
    """Send the heading and the maps. Returns the message's link.

    Raises whatever Discord raises; the endpoint turns that into a 409 with
    the reason, because a post that did not go out is something the admin has
    to see.
    """
    import discord

    channel = bot.get_channel(channel_id) or await bot.fetch_channel(channel_id)
    if not hasattr(channel, "send"):
        raise RuntimeError("that channel cannot hold messages")

    embed = discord.Embed(title=title(day, day_title), description=message or None, colour=ACCENT)
    embed.add_field(name="Scenarios", value="  ·  ".join(scenarios) or "—", inline=False)
    if source:
        embed.set_footer(text=f"Official plan, published from {source}'s draft")
    files = [discord.File(io.BytesIO(png), filename=file_name(i, name))
             for i, (png, name) in enumerate(zip(images, scenarios, strict=True))]
    sent = await channel.send(embed=embed, files=files)
    log.info("posted the war plan for %s to channel %s: %d images", day, channel_id, len(files))
    return sent.jump_url
