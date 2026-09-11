"""Times written once in an announcement and read in everyone's own clock.

Discord resolves <t:EPOCH:f> against the reader's client, so the assertions
here are about producing the right epoch and the right format letter -- what
each member finally sees is Discord's job, not ours.
"""
from __future__ import annotations

from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from dwsbot.messagetime import render_times

SEOUL = ZoneInfo("Asia/Seoul")
WHEN = datetime(2026, 9, 9, 11, 0, tzinfo=SEOUL)      # 00:00 ST, 02:00 UTC
EPOCH = int(WHEN.timestamp())


def test_each_token_becomes_the_markup_for_its_format():
    got = render_times("{time} {datetime} {date} {relative}", WHEN)
    assert got == f"<t:{EPOCH}:t> <t:{EPOCH}:F> <t:{EPOCH}:D> <t:{EPOCH}:R>"


def test_server_time_is_fixed_text_because_it_is_the_same_for_everyone():
    """The point of pairing them: the localized half moves, the ST half does not."""
    assert render_times("{st}", WHEN) == "00:00 ST"
    assert render_times("{time} ({st})", WHEN) == f"<t:{EPOCH}:t> (00:00 ST)"


def test_the_epoch_is_the_moment_not_the_wall_clock():
    """Seoul 11:00 and the same instant expressed in UTC must render alike."""
    same_moment = WHEN.astimezone(UTC)
    assert render_times("{time}", WHEN) == render_times("{time}", same_moment)


def test_text_around_the_tokens_is_left_alone():
    body = "Pass War starts {relative} — rally at the gate.\n**Do not** move early."
    got = render_times(body, WHEN)
    assert got.startswith("Pass War starts <t:")
    assert got.endswith("rally at the gate.\n**Do not** move early.")


def test_an_unknown_brace_is_not_a_token():
    """Braces are not Discord markdown, but a message may still contain some.

    Only the exact token names substitute; anything else is left as typed. A
    message that wants to *talk about* a token cannot escape it, which is a
    trade for not inventing an escape syntax nobody would remember.
    """
    assert render_times("{whatever} {time:x} {Time}", WHEN) == "{whatever} {time:x} {Time}"


def test_empty_bodies_survive():
    assert render_times(None, WHEN) is None
    assert render_times("", WHEN) == ""


# ---------------------------------------- and the same, through a real render

class _Ann:
    """The few Announcement fields render() reads."""

    mention = "@everyone"
    use_embed = True
    embed_color = "#5865F2"
    name = "Muster"
    title = "Pass War at {time}"
    body = "Starts {time} ({st}) — {relative}.\nMap in <#222>."


class _Occ:
    starts_at = WHEN
    original_starts_at = WHEN
    moved = False
    note = None


def _render(ann, occurrence):
    """render() through a bare object: it touches no client state."""
    from dwsbot.discord_bot.bot import AllianceBot

    class Bare:
        _reschedule_lines = staticmethod(AllianceBot._reschedule_lines)
        render = AllianceBot.render

    return Bare().render(ann, occurrence)


def test_an_embed_resolves_tokens_in_both_body_and_title():
    _content, embed = _render(_Ann(), _Occ())
    assert embed.title == f"Pass War at <t:{EPOCH}:t>"
    assert embed.description == (
        f"Starts <t:{EPOCH}:t> (00:00 ST) — <t:{EPOCH}:R>.\nMap in <#222>."
    )


def test_a_plain_message_resolves_them_too():
    ann = _Ann()
    ann.use_embed = False
    content, embed = _render(ann, _Occ())
    assert embed is None
    assert f"<t:{EPOCH}:t> (00:00 ST)" in content
    assert content.startswith("@everyone\n")


def test_without_an_event_the_tokens_mean_the_moment_of_posting():
    """A cron announcement has no occurrence; "now" is the only moment it has."""
    from datetime import timedelta

    ann = _Ann()
    ann.title = None
    ann.body = "Posted {datetime}"
    _content, embed = _render(ann, None)
    stamp = int(embed.description.removeprefix("Posted <t:").split(":")[0])
    assert abs(stamp - datetime.now(UTC).timestamp()) < timedelta(minutes=1).total_seconds()


def test_a_channel_link_is_left_for_discord_to_resolve():
    _content, embed = _render(_Ann(), _Occ())
    assert "<#222>" in embed.description
