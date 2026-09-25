"""Posting a battle's briefing cards to Discord, as a thread the alliance reads.

One thread per battle, Team A and then Team B, each opening with a heading and
followed by its cards four to a message. Four is Discord's own comfortable
grid — the client lays four attachments out two by two — and the message above
them names the languages in the order they were sent, so a member can find
their own.

The cards are drawn here and handed straight to Discord: nothing is written to
disk, and nothing is fetched back over HTTP.
"""
from __future__ import annotations

import io
import logging
from datetime import date

from . import cards

log = logging.getLogger(__name__)

# How many cards ride in one message. Discord allows ten attachments, but four
# is what its client lays out as an even grid rather than a ragged one.
PER_MESSAGE = 4

# The gold the cards themselves are drawn in, so the post and the image agree.
ACCENT = 0xF2B138

# `strftime('%a')` would read the container's locale, which is not a thing to
# leave the alliance's thread names resting on.
WEEKDAYS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")

TEAM_LABEL = {"A": "Team A", "B": "Team B"}


def thread_name(battle_date: date) -> str:
    """`BGB 2026-09-27(Sun) Mini-Team Placement`, which is what the admin asked for."""
    return (f"BGB {battle_date.isoformat()}({WEEKDAYS[battle_date.weekday()]}) "
            "Mini-Team Placement")


def thread_url(guild_id: int, thread_id: int) -> str:
    return f"https://discord.com/channels/{guild_id}/{thread_id}"


def language_label(entry: dict) -> str:
    """"한국어 (Korean)" — their own name first, so a member finds it by reading."""
    return entry["native"] if entry["native"] == entry["english"] \
        else f"{entry['native']} ({entry['english']})"


def batches() -> list[list[dict]]:
    """The languages in the order they are posted, four to a message."""
    return [cards.LANGUAGES[i:i + PER_MESSAGE]
            for i in range(0, len(cards.LANGUAGES), PER_MESSAGE)]


def caption(batch: list[dict]) -> str:
    """The line above the cards, naming them in the order they were attached."""
    return "  ·  ".join(language_label(entry) for entry in batch)


def _heading(team: str, registrations: list, battle_date: date):
    import discord

    starters = [r for r in registrations if r.role == "starter"]
    subs = [r for r in registrations if r.role != "starter"]
    hired = [r for r in registrations if r.player_id is None]
    total = sum(r.bgb_cp or 0 for r in starters)
    bits = [f"{len(starters)} starters", f"{len(subs)} substitutes"]
    if hired:
        bits.append(f"{len(hired)} mercenar{'y' if len(hired) == 1 else 'ies'}")
    embed = discord.Embed(
        title=f"{TEAM_LABEL[team]} · Mini-Team Placement",
        description=f"{battle_date.isoformat()}  ·  " + "  ·  ".join(bits)
                    + f"\nStarters' total CP {cards.lineup.fmt_cp(total)}",
        colour=ACCENT,
    )
    embed.set_footer(text="Find your language below and open the card for your team.")
    return embed


async def publish(bot, channel_id: int, event, registrations: list) -> tuple[int, int, int]:
    """Create the thread and post every card. Returns (thread id, messages, images).

    Raises whatever Discord raises: the endpoint turns that into a 409 with the
    reason, because a half-posted thread is something the admin has to see.
    """
    import discord

    channel = bot.get_channel(channel_id) or await bot.fetch_channel(channel_id)
    if not isinstance(channel, discord.TextChannel):
        raise RuntimeError("that channel is not a text channel, so it cannot hold a thread")

    thread = await channel.create_thread(
        name=thread_name(event.battle_date),
        type=discord.ChannelType.public_thread,
        # A week, so the thread is still open when the battle is fought and
        # talked about afterwards.
        auto_archive_duration=10080,
        reason=f"BGB {event.battle_date} mini-team placement",
    )

    messages = images = 0
    for team in ("A", "B"):
        seats = [r for r in registrations if r.team == team]
        if not seats:
            continue
        await thread.send(embed=_heading(team, seats, event.battle_date))
        messages += 1

        for batch in batches():
            files = [
                discord.File(
                    io.BytesIO(cards.render(seats, team, event.battle_date, entry["code"])),
                    filename=cards.file_name(team, entry["code"]),
                )
                for entry in batch
            ]
            await thread.send(content=caption(batch), files=files)
            messages += 1
            images += len(files)

    log.info("posted BGB %s to thread %s: %d messages, %d cards",
             event.battle_date, thread.id, messages, images)
    return thread.id, messages, images
