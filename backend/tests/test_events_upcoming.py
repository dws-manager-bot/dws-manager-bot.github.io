"""The members' Events page: the admins' calendar, read-only.

What a member sees must be what will actually happen, so it comes through
resolve_occurrences like everything else, and an event already under way is
still listed until it ends.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from types import SimpleNamespace
from zoneinfo import ZoneInfo

from dwsbot.occurrences import happening

SEOUL = ZoneInfo("Asia/Seoul")
UTC = ZoneInfo("UTC")


class FakeSession:
    def __init__(self, rows=()):
        self._rows = list(rows)

    async def scalars(self, _stmt):
        return SimpleNamespace(all=lambda: self._rows)


def frankenstein(**over):
    """Every 3 days at 22:00 KST from 5 Sep 2026, an hour long."""
    base = dict(
        id=1, enabled=True, schedule_type="rotation", weekdays=None, rotation_days=3,
        reference_date=datetime(2026, 9, 5, tzinfo=SEOUL), fixed_dates=None,
        start_time="22:00", timezone="Asia/Seoul", duration_minutes=60,
    )
    base.update(over)
    return SimpleNamespace(**base)


def skip(original):
    return SimpleNamespace(
        id=1, original_starts_at=original.astimezone(UTC), starts_at=original.astimezone(UTC),
        cancelled=True, override_note=None,
    )


async def test_lists_every_date_inside_the_window():
    now = datetime(2026, 9, 4, 12, 0, tzinfo=SEOUL)
    got = await happening(FakeSession(), frankenstein(), now=now, until=now + timedelta(days=7))
    assert [o.starts_at for o in got] == [
        datetime(2026, 9, 5, 22, 0, tzinfo=SEOUL),
        datetime(2026, 9, 8, 22, 0, tzinfo=SEOUL),
    ]


async def test_an_event_under_way_is_still_on():
    now = datetime(2026, 9, 5, 22, 30, tzinfo=SEOUL)     # half an hour in
    got = await happening(FakeSession(), frankenstein(), now=now, until=now + timedelta(days=1))
    assert [o.starts_at for o in got] == [datetime(2026, 9, 5, 22, 0, tzinfo=SEOUL)]


async def test_one_that_has_ended_is_gone():
    now = datetime(2026, 9, 5, 23, 0, tzinfo=SEOUL)      # the hour is up
    got = await happening(FakeSession(), frankenstein(), now=now, until=now + timedelta(days=1))
    assert got == []


async def test_a_skipped_date_is_not_shown():
    now = datetime(2026, 9, 4, 12, 0, tzinfo=SEOUL)
    got = await happening(
        FakeSession([skip(datetime(2026, 9, 5, 22, 0, tzinfo=SEOUL))]),
        frankenstein(), now=now, until=now + timedelta(days=7),
    )
    assert [o.starts_at for o in got] == [datetime(2026, 9, 8, 22, 0, tzinfo=SEOUL)]


async def test_a_long_window_keeps_a_frequent_event_whole():
    """A daily event over 31 days is 31 dates, not the first handful."""
    daily = frankenstein(rotation_days=1)
    now = datetime(2026, 9, 4, 12, 0, tzinfo=SEOUL)
    got = await happening(FakeSession(), daily, now=now, until=now + timedelta(days=31))
    assert len(got) == 31
