"""What a rescheduled date looks like when the bot posts it.

An announcement for a moved occurrence has to say so: members expect the event
at its usual time, and a reminder that simply arrives early is confusing
rather than helpful.
"""
from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import pytest

from dwsbot.models import ScheduleKind
from dwsbot.occurrences import Occurrence

SEOUL = ZoneInfo("Asia/Seoul")

ORIGINAL = datetime(2026, 9, 5, 22, 0, tzinfo=SEOUL)
MOVED_TO = datetime(2026, 9, 6, 0, 30, tzinfo=SEOUL)


@pytest.fixture(scope="module")
def AllianceBot():
    """Importing the bot module builds a client; conftest supplies its credentials."""
    from dwsbot.discord_bot.bot import AllianceBot as cls

    return cls


def announcement(**over):
    base = dict(
        id=5, name="Frankenstein Round 1", channel_id=1,
        kind=ScheduleKind.EVENT, title="Frankenstein Round 1",
        body="Rally up — round 1 starts soon.", use_embed=True,
        embed_color=None, mention="@everyone", lead_minutes=30,
    )
    base.update(over)
    return SimpleNamespace(**base)


def moved(note=None):
    return Occurrence(starts_at=MOVED_TO, original_starts_at=ORIGINAL, note=note)


def unmoved():
    return Occurrence(starts_at=ORIGINAL, original_starts_at=ORIGINAL)


# ------------------------------------------------------------------- lines

def test_no_occurrence_means_no_notice(AllianceBot):
    assert AllianceBot._reschedule_lines(None) == []


def test_an_unmoved_occurrence_says_nothing(AllianceBot):
    """A routine reminder must stay routine."""
    assert AllianceBot._reschedule_lines(unmoved()) == []


def test_a_move_reports_the_original_time(AllianceBot):
    lines = AllianceBot._reschedule_lines(moved())

    assert len(lines) == 1
    # Discord's own markup, so each member reads it in their timezone.
    assert f"<t:{int(ORIGINAL.timestamp())}:F>" in lines[0]
    assert "Rescheduled" in lines[0]


def test_the_reason_is_carried_through(AllianceBot):
    lines = AllianceBot._reschedule_lines(moved("clashes with an important schedule"))

    assert len(lines) == 2
    assert lines[1] == "clashes with an important schedule"


# ------------------------------------------------------------------ render

def test_embed_gains_a_rescheduled_field(AllianceBot):
    _, embed = AllianceBot.render(AllianceBot, announcement(), moved("SvS clash"))

    fields = {f.name: f.value for f in embed.fields}
    assert "⏰ Rescheduled" in fields
    assert "SvS clash" in fields["⏰ Rescheduled"]
    assert f"<t:{int(ORIGINAL.timestamp())}:F>" in fields["⏰ Rescheduled"]


def test_embed_has_no_such_field_when_nothing_moved(AllianceBot):
    _, embed = AllianceBot.render(AllianceBot, announcement(), unmoved())
    assert [f.name for f in embed.fields] == []


def test_plain_text_appends_a_quoted_notice(AllianceBot):
    content, embed = AllianceBot.render(
        AllianceBot, announcement(use_embed=False), moved("SvS clash")
    )

    assert embed is None
    assert "Rally up" in content
    assert "> Rescheduled" in content
    assert "> SvS clash" in content


def test_plain_text_is_untouched_when_nothing_moved(AllianceBot):
    content, _ = AllianceBot.render(AllianceBot, announcement(use_embed=False), unmoved())
    assert ">" not in content


def test_the_ping_still_sits_outside_the_embed(AllianceBot):
    """A mention inside an embed does not notify anyone."""
    content, embed = AllianceBot.render(AllianceBot, announcement(), moved("x"))

    assert content.strip() == "@everyone"
    assert embed is not None
