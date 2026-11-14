"""Occurrence math for recurring in-game events.

Kept free of database and Discord imports so the rotation rules can be unit
tested directly.
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo


def _parse_hhmm(value: str | None) -> time:
    if not value:
        return time(0, 0)
    hh, _, mm = value.partition(":")
    return time(int(hh), int(mm or 0))


def occurrence_dates(
    *,
    schedule_type: str,
    after: date,
    horizon_days: int,
    weekdays: list[int] | None = None,
    rotation_days: int | None = None,
    reference_date: date | None = None,
    fixed_dates: list[str] | None = None,
) -> list[date]:
    """Dates on which the event happens, within `after` .. `after + horizon_days`.

    `weekly`   - every listed weekday (0=Monday .. 6=Sunday)
    `rotation` - every `rotation_days` days counted from `reference_date`
    `fixed`    - an explicit list of ISO dates
    """
    window = [after + timedelta(days=i) for i in range(horizon_days + 1)]

    if schedule_type == "weekly":
        wanted = set(weekdays or [])
        return [d for d in window if d.weekday() in wanted]

    if schedule_type == "rotation":
        if not rotation_days or rotation_days < 1 or reference_date is None:
            return []
        # A date is an occurrence when its offset from the reference lands on
        # the rotation boundary. Python's % is non-negative, so dates before
        # the reference date work without a special case.
        return [d for d in window if (d - reference_date).days % rotation_days == 0]

    if schedule_type == "fixed":
        wanted = {date.fromisoformat(s) for s in (fixed_dates or [])}
        return [d for d in window if d in wanted]

    return []


def start_times(
    *,
    start_time: str | None,
    alternate_times: list[str] | None = None,
    weekday_times: dict | None = None,
    rotation_days: int | None = None,
    reference_date: date | None = None,
):
    """A function from an occurrence date to the time the event starts that day.

    Plain: `start_time`, or the weekday's own time from `weekday_times`
    ({6: "19:00"} for Sundays; keys may be strings, as JSON stores them).

    With `alternate_times` on a rotation, runs take turns: the run on
    `reference_date` at `start_time`, the next at the first alternate, and so
    on round. The turn after a run follows the time it actually ran at, so when
    a weekday rule moves a 23:00 turn to 19:00, the run after it is the 23:00
    one, not a second 19:00. Runs before the reference date have no history to
    follow; they take turns by count alone.
    """
    by_weekday = {int(k): _parse_hhmm(v) for k, v in (weekday_times or {}).items()}
    turns = [_parse_hhmm(start_time), *(_parse_hhmm(t) for t in alternate_times or [])]

    if len(turns) == 1 or not rotation_days or reference_date is None:
        return lambda d: by_weekday.get(d.weekday(), turns[0])

    walked: dict[date, time] = {}
    state = {"at": reference_date, "turn": 0}

    def walk_to(target: date) -> None:
        while state["at"] <= target:
            d = state["at"]
            ran = by_weekday.get(d.weekday(), turns[state["turn"]])
            walked[d] = ran
            state["turn"] = (turns.index(ran) if ran in turns else state["turn"]) + 1
            state["turn"] %= len(turns)
            state["at"] = d + timedelta(days=rotation_days)

    def at(d: date) -> time:
        offset = (d - reference_date).days
        if offset % rotation_days:      # not a run day of this rotation
            return by_weekday.get(d.weekday(), turns[0])
        if offset < 0:
            return by_weekday.get(d.weekday(), turns[(offset // rotation_days) % len(turns)])
        walk_to(d)
        return walked[d]

    return at


def next_occurrences(
    definition,
    *,
    now: datetime | None = None,
    count: int = 5,
    horizon_days: int = 60,
) -> list[datetime]:
    """The next `count` timezone-aware start times for an EventDefinition."""
    tz = ZoneInfo(definition.timezone or "UTC")
    now = (now or datetime.now(tz)).astimezone(tz)

    ref = definition.reference_date
    if isinstance(ref, datetime):
        ref = ref.astimezone(tz).date()

    rotating = definition.schedule_type == "rotation"
    start_on = start_times(
        start_time=definition.start_time,
        alternate_times=getattr(definition, "alternate_times", None) if rotating else None,
        weekday_times=getattr(definition, "weekday_times", None),
        rotation_days=definition.rotation_days if rotating else None,
        reference_date=ref if rotating else None,
    )

    days = occurrence_dates(
        schedule_type=definition.schedule_type,
        after=now.date(),
        horizon_days=horizon_days,
        weekdays=definition.weekdays,
        rotation_days=definition.rotation_days,
        reference_date=ref,
        fixed_dates=definition.fixed_dates,
    )

    out: list[datetime] = []
    for d in days:
        dt = datetime.combine(d, start_on(d), tzinfo=tz)
        if dt > now:
            out.append(dt)
        if len(out) >= count:
            break
    return out
