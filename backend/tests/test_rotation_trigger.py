"""The every-N-days trigger, which is only useful if it stays anchored.

A bare interval counts from whenever the process loaded it, so a fortnightly
post would walk off its day after any restart. This one counts from the first
post, which is the whole reason the kind exists.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from apscheduler.triggers.interval import IntervalTrigger

ST = ZoneInfo("Etc/GMT+2")          # game server time: UTC-2, no daylight saving


def fortnightly(first: datetime) -> IntervalTrigger:
    return IntervalTrigger(minutes=14 * 1440, start_date=first, timezone=ST)


def fires(trigger, now, count=5):
    out, prev = [], None
    for _ in range(count):
        prev = trigger.get_next_fire_time(prev, now)
        if prev is None:
            break
        out.append(prev.astimezone(ST))
    return out


def test_a_fortnight_lands_on_the_same_weekday_at_the_same_time():
    first = datetime(2026, 9, 9, 0, 0, tzinfo=ST)          # a Wednesday
    got = fires(fortnightly(first), now=first - timedelta(hours=1))
    assert [d.date().isoformat() for d in got] == [
        "2026-09-09", "2026-09-23", "2026-10-07", "2026-10-21", "2026-11-04",
    ]
    assert {(d.hour, d.minute) for d in got} == {(0, 0)}
    assert {d.weekday() for d in got} == {2}               # Wednesday throughout


def test_an_anchor_already_past_resumes_on_the_cycle_not_from_now():
    """The restart case. Counting from `now` would move every future post."""
    first = datetime(2026, 9, 9, 0, 0, tzinfo=ST)
    later = datetime(2026, 10, 15, 13, 37, tzinfo=ST)      # mid-cycle, months on
    got = fires(fortnightly(first), now=later, count=2)
    assert [d.date().isoformat() for d in got] == ["2026-10-21", "2026-11-04"]
    assert all((d - first).days % 14 == 0 for d in got)


def test_the_cycle_is_unaffected_by_when_it_was_loaded():
    """Two schedulers starting hours apart must agree on the next post."""
    first = datetime(2026, 9, 9, 0, 0, tzinfo=ST)
    morning = fires(fortnightly(first), now=datetime(2026, 9, 30, 2, 0, tzinfo=ST), count=1)
    evening = fires(fortnightly(first), now=datetime(2026, 9, 30, 20, 0, tzinfo=ST), count=1)
    assert morning == evening
