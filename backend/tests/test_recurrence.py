"""Rotation and weekday maths for event schedules."""
from __future__ import annotations

from datetime import date, datetime
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import pytest

from dwsbot.recurrence import next_occurrences, occurrence_dates

SEOUL = ZoneInfo("Asia/Seoul")


def test_weekly_picks_only_listed_weekdays():
    # 2026-09-07 is a Monday.
    got = occurrence_dates(
        schedule_type="weekly",
        after=date(2026, 9, 7),
        horizon_days=13,
        weekdays=[0, 3],          # Monday, Thursday
    )
    assert got == [
        date(2026, 9, 7), date(2026, 9, 10),
        date(2026, 9, 14), date(2026, 9, 17),
    ]


def test_rotation_counts_from_reference_date():
    got = occurrence_dates(
        schedule_type="rotation",
        after=date(2026, 9, 3),
        horizon_days=12,
        rotation_days=5,
        reference_date=date(2026, 9, 3),
    )
    assert got == [date(2026, 9, 3), date(2026, 9, 8), date(2026, 9, 13)]


def test_rotation_works_before_the_reference_date():
    """A reference date in the future must not break the modulo."""
    got = occurrence_dates(
        schedule_type="rotation",
        after=date(2026, 9, 1),
        horizon_days=6,
        rotation_days=3,
        reference_date=date(2026, 12, 25),
    )
    # Sep 1 -> Dec 25 is 115 days and -115 % 3 == 2, so the rotation
    # boundary falls on Sep 2 and Sep 5 within this window.
    assert got == [date(2026, 9, 2), date(2026, 9, 5)]


def test_fixed_dates_are_filtered_to_the_window():
    got = occurrence_dates(
        schedule_type="fixed",
        after=date(2026, 9, 3),
        horizon_days=5,
        fixed_dates=["2026-09-04", "2026-09-30"],
    )
    assert got == [date(2026, 9, 4)]


def test_unknown_schedule_type_yields_nothing():
    assert occurrence_dates(schedule_type="nonsense", after=date(2026, 9, 3), horizon_days=5) == []


@pytest.mark.parametrize("missing", ["rotation_days", "reference_date"])
def test_incomplete_rotation_yields_nothing(missing):
    kwargs = {"rotation_days": 3, "reference_date": date(2026, 9, 1)}
    kwargs[missing] = None
    assert occurrence_dates(
        schedule_type="rotation", after=date(2026, 9, 3), horizon_days=10, **kwargs
    ) == []


def _defn(**over):
    base = dict(
        schedule_type="weekly",
        weekdays=[0, 3],
        rotation_days=None,
        reference_date=None,
        fixed_dates=None,
        start_time="20:30",
        timezone="Asia/Seoul",
    )
    base.update(over)
    return SimpleNamespace(**base)


def test_next_occurrences_applies_start_time_and_timezone():
    now = datetime(2026, 9, 7, 12, 0, tzinfo=SEOUL)     # Monday noon
    got = next_occurrences(_defn(), now=now, count=2)

    assert got[0] == datetime(2026, 9, 7, 20, 30, tzinfo=SEOUL)
    assert got[1] == datetime(2026, 9, 10, 20, 30, tzinfo=SEOUL)


def test_next_occurrences_skips_todays_slot_once_it_has_passed():
    now = datetime(2026, 9, 7, 21, 0, tzinfo=SEOUL)     # Monday, after 20:30
    got = next_occurrences(_defn(), now=now, count=1)

    assert got[0] == datetime(2026, 9, 10, 20, 30, tzinfo=SEOUL)


def test_next_occurrences_respects_count():
    now = datetime(2026, 9, 7, 0, 0, tzinfo=SEOUL)
    assert len(next_occurrences(_defn(), now=now, count=3)) == 3


def test_missing_start_time_defaults_to_midnight():
    now = datetime(2026, 9, 6, 23, 0, tzinfo=SEOUL)     # Sunday night
    got = next_occurrences(_defn(start_time=None), now=now, count=1)
    assert got[0] == datetime(2026, 9, 7, 0, 0, tzinfo=SEOUL)


# ------------------------------------------------- alternating and weekday times

ST = ZoneInfo("Etc/GMT+2")      # game server time, UTC-2


def _round2(**over):
    """Frankenstein Round 2 as the alliance runs it: every 3 days, 23:00 and
    19:00 ST by turns, never 23:00 on a Sunday. The run on 11-13 was 23:00."""
    rule = dict(
        schedule_type="rotation", weekdays=None, rotation_days=3,
        reference_date=datetime(2026, 11, 13, tzinfo=ST),
        start_time="23:00", alternate_times=["19:00"], weekday_times={"6": "19:00"},
        timezone="Etc/GMT+2",
    )
    rule.update(over)
    return _defn(**rule)


def _times(defn, now, count):
    found = next_occurrences(defn, now=now, count=count)
    return [(d.date().isoformat(), d.strftime("%a %H:%M")) for d in found]


def test_runs_take_turns_from_the_reference_run():
    got = _times(_round2(weekday_times=None), datetime(2026, 11, 14, tzinfo=ST), 4)
    assert got == [
        ("2026-11-16", "Mon 19:00"), ("2026-11-19", "Thu 23:00"),
        ("2026-11-22", "Sun 19:00"), ("2026-11-25", "Wed 23:00"),
    ]


def test_a_sunday_23_turn_runs_at_19_and_the_next_run_is_23():
    got = _times(_round2(), datetime(2026, 11, 14, tzinfo=ST), 12)
    assert got == [
        ("2026-11-16", "Mon 19:00"),
        ("2026-11-19", "Thu 23:00"),
        ("2026-11-22", "Sun 19:00"),     # its turn anyway
        ("2026-11-25", "Wed 23:00"),
        ("2026-11-28", "Sat 19:00"),
        ("2026-12-01", "Tue 23:00"),
        ("2026-12-04", "Fri 19:00"),
        ("2026-12-07", "Mon 23:00"),
        ("2026-12-10", "Thu 19:00"),
        ("2026-12-13", "Sun 19:00"),     # a 23:00 turn, moved by the Sunday rule
        ("2026-12-16", "Wed 23:00"),     # follows the 19:00 it actually ran at
        ("2026-12-19", "Sat 19:00"),
    ]


def test_the_turns_do_not_depend_on_when_you_ask():
    early = _times(_round2(), datetime(2026, 11, 14, tzinfo=ST), 30)
    late = _times(_round2(), datetime(2026, 12, 15, tzinfo=ST), 10)
    assert late == [t for t in early if t[0] >= "2026-12-15"][:10]


def test_a_sunday_in_server_time_is_monday_in_seoul():
    """The 12-13 Sunday run, 19:00 ST, is 06:00 on Monday in Seoul."""
    got = next_occurrences(_round2(), now=datetime(2026, 12, 12, tzinfo=ST), count=1)[0]
    assert got.astimezone(SEOUL) == datetime(2026, 12, 14, 6, 0, tzinfo=SEOUL)


def test_runs_before_the_reference_take_turns_by_count():
    got = _times(_round2(weekday_times=None), datetime(2026, 11, 6, tzinfo=ST), 2)
    assert got == [("2026-11-07", "Sat 23:00"), ("2026-11-10", "Tue 19:00")]


def test_a_weekday_rule_works_without_alternating():
    defn = _defn(weekdays=[0, 6], start_time="20:30", weekday_times={6: "18:00"})
    got = next_occurrences(defn, now=datetime(2026, 9, 7, tzinfo=SEOUL), count=3)
    assert [d.strftime("%a %H:%M") for d in got] == ["Mon 20:30", "Sun 18:00", "Mon 20:30"]


def test_alternating_times_are_ignored_off_a_rotation():
    defn = _defn(alternate_times=["10:00"])           # weekly
    got = next_occurrences(defn, now=datetime(2026, 9, 7, tzinfo=SEOUL), count=2)
    assert [d.strftime("%H:%M") for d in got] == ["20:30", "20:30"]
