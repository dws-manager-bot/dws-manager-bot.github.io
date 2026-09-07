"""Occurrences after per-date overrides are applied.

`recurrence.next_occurrences` answers what the rule says. This module answers
what is actually happening, which is the rule plus any single dates the
officers have moved or skipped.

Everything that needs to know when an event next happens — the backoffice, the
announcement scheduler, the slash commands — must come through here, or a
postponed event would still be announced at its original time.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import EventDefinition, EventInstance
from .recurrence import next_occurrences

# Look at more raw dates than asked for, since some may be skipped.
_SLACK = 12


@dataclass(frozen=True)
class Occurrence:
    """One real occurrence of an event."""

    starts_at: datetime
    #: What the rule produced. Differs from starts_at when this date was moved.
    original_starts_at: datetime
    note: str | None = None
    instance_id: int | None = None

    @property
    def moved(self) -> bool:
        return self.starts_at != self.original_starts_at


async def resolve_occurrences(
    session: AsyncSession,
    definition: EventDefinition,
    *,
    now: datetime | None = None,
    count: int = 5,
    horizon_days: int = 90,
) -> list[Occurrence]:
    """The next `count` occurrences, honoring moves and skips."""
    tz = ZoneInfo(definition.timezone or "UTC")
    now = (now or datetime.now(tz)).astimezone(tz)

    rule_dates = next_occurrences(
        definition, now=now, count=count + _SLACK, horizon_days=horizon_days
    )

    overrides = (
        await session.scalars(
            select(EventInstance).where(
                EventInstance.definition_id == definition.id,
                EventInstance.original_starts_at.is_not(None),
            )
        )
    ).all()
    # Aware datetimes hash by their UTC instant, so a key stored as UTC matches
    # a rule date computed in the event's own zone.
    by_original = {row.original_starts_at: row for row in overrides}

    resolved: list[Occurrence] = []
    matched: set[datetime] = set()

    for rule_date in rule_dates:
        row = by_original.get(rule_date)
        if row is None:
            resolved.append(Occurrence(starts_at=rule_date, original_starts_at=rule_date))
            continue
        matched.add(rule_date)
        if row.cancelled:
            continue          # skipped this time round
        resolved.append(
            Occurrence(
                starts_at=row.starts_at.astimezone(tz),
                original_starts_at=rule_date,
                note=row.override_note,
                instance_id=row.id,
            )
        )

    # An occurrence pushed later can outlive its own slot: the rule date is
    # already past, so the loop above never saw it, but the event has not
    # happened yet and must still be announced.
    for original, row in by_original.items():
        if original in matched or row.cancelled:
            continue
        moved_to = row.starts_at.astimezone(tz)
        if moved_to > now and original <= now:
            resolved.append(
                Occurrence(
                    starts_at=moved_to,
                    original_starts_at=original.astimezone(tz),
                    note=row.override_note,
                    instance_id=row.id,
                )
            )

    resolved.sort(key=lambda o: o.starts_at)
    return [o for o in resolved if o.starts_at > now][:count]


async def next_occurrence(
    session: AsyncSession, definition: EventDefinition, *, now: datetime | None = None
) -> Occurrence | None:
    """Just the next one, or None if the event has no future date."""
    found = await resolve_occurrences(session, definition, now=now, count=1)
    return found[0] if found else None
