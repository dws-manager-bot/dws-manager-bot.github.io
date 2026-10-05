"""Backoffice CRUD for recurring in-game event definitions, and what is on for members."""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from ...models import EventDefinition, EventInstance
from ...names import guild_display_name
from ...occurrences import happening, resolve_occurrences

# preview() runs on an unsaved definition, which has no overrides to apply,
# so it stays on the pure rule.
from ...recurrence import next_occurrences
from ...schemas import EventCreate, EventOut, OccurrenceOut, OccurrenceOverrideIn, UpcomingOut
from ..deps import AdminUser, CurrentUser, DbSession, write_audit

router = APIRouter(prefix="/events", tags=["events"])


async def _out(session, defn: EventDefinition) -> EventOut:
    out = EventOut.model_validate(defn)
    out.created_by_name = guild_display_name(defn.created_by_id, defn.created_by_name)
    out.updated_by_name = guild_display_name(defn.updated_by_id, defn.updated_by_name)
    # What will actually happen, with any moved or skipped dates applied.
    out.upcoming = [o.starts_at for o in await resolve_occurrences(session, defn, count=5)]
    return out


@router.get("/upcoming", response_model=list[UpcomingOut], summary="What is on, for any member")
async def upcoming(session: DbSession, _: CurrentUser, days: int = Query(14, ge=1, le=31)):
    """Every enabled event's dates over the next `days`, soonest first.

    The calendar the admins keep, read-only: a moved date shows where it went,
    a skipped one is gone, and one under way is still listed.
    """
    now = datetime.now(UTC)
    until = now + timedelta(days=days)
    rows = (
        await session.scalars(select(EventDefinition).where(EventDefinition.enabled.is_(True)))
    ).all()
    found = [
        UpcomingOut(
            event_id=defn.id,
            key=defn.key,
            name=defn.name,
            starts_at=o.starts_at,
            duration_minutes=defn.duration_minutes,
            moved=o.moved,
            note=o.note,
        )
        for defn in rows
        for o in await happening(session, defn, now=now, until=until)
    ]
    return sorted(found, key=lambda u: u.starts_at)


@router.get("", response_model=list[EventOut])
async def list_events(session: DbSession, _: AdminUser):
    rows = (await session.scalars(select(EventDefinition).order_by(EventDefinition.id))).all()
    return [await _out(session, r) for r in rows]


@router.post("", response_model=EventOut, status_code=status.HTTP_201_CREATED)
async def create_event(payload: EventCreate, session: DbSession, user: AdminUser):
    defn = EventDefinition(
        **payload.model_dump(),
        created_by_id=user.discord_id,
        created_by_name=user.username,
    )
    session.add(defn)
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"Event key '{payload.key}' already exists"
        ) from exc
    await write_audit(session, user, "event.create", "event", defn.id, {"key": defn.key})
    await session.commit()
    return await _out(session, defn)


@router.put("/{event_id}", response_model=EventOut)
async def update_event(event_id: int, payload: EventCreate, session: DbSession, user: AdminUser):
    defn = await session.get(EventDefinition, event_id)
    if defn is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such event")
    for field, value in payload.model_dump().items():
        setattr(defn, field, value)
    defn.updated_by_id = user.discord_id
    defn.updated_by_name = user.username
    await write_audit(session, user, "event.update", "event", defn.id, {"key": defn.key})
    await session.commit()
    return await _out(session, defn)


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(event_id: int, session: DbSession, user: AdminUser):
    defn = await session.get(EventDefinition, event_id)
    if defn is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such event")
    await write_audit(session, user, "event.delete", "event", defn.id, {"key": defn.key})
    await session.delete(defn)
    await session.commit()


@router.post("/preview", response_model=list[str], summary="Preview a schedule without saving")
async def preview(payload: EventCreate, _: AdminUser):
    """Let the backoffice show upcoming dates while the form is still being filled in."""
    provisional = EventDefinition(**payload.model_dump())
    return [dt.isoformat() for dt in next_occurrences(provisional, count=10)]


# --------------------------------------------------------------- occurrences

@router.get("/{event_id}/occurrences", response_model=list[OccurrenceOut])
async def list_occurrences(event_id: int, session: DbSession, _: AdminUser, count: int = 8):
    """Upcoming dates for one event, with any reschedules already applied."""
    defn = await session.get(EventDefinition, event_id)
    if defn is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such event")

    return [
        OccurrenceOut(
            starts_at=o.starts_at,
            original_starts_at=o.original_starts_at,
            moved=o.moved,
            note=o.note,
            instance_id=o.instance_id,
        )
        for o in await resolve_occurrences(session, defn, count=count)
    ]


@router.put("/{event_id}/occurrences", response_model=list[OccurrenceOut])
async def override_occurrence(
    event_id: int, payload: OccurrenceOverrideIn, session: DbSession, user: AdminUser
):
    """Move or skip a single date.

    The recurrence rule is left alone, so every other occurrence keeps its
    place — which is the whole point: editing the rule to postpone one night
    would shift all the future ones with it.
    """
    defn = await session.get(EventDefinition, event_id)
    if defn is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such event")

    row = await session.scalar(
        select(EventInstance).where(
            EventInstance.definition_id == event_id,
            EventInstance.original_starts_at == payload.original_starts_at,
        )
    )
    if row is None:
        row = EventInstance(
            definition_id=event_id, original_starts_at=payload.original_starts_at
        )
        session.add(row)

    row.cancelled = payload.starts_at is None
    # A skipped occurrence keeps its original time on the row; `cancelled` is
    # what hides it, and clearing the override later restores the rule date.
    row.starts_at = payload.starts_at or payload.original_starts_at
    row.override_note = payload.note

    await write_audit(
        session, user, "event.occurrence.override", "event", event_id,
        {
            "original": payload.original_starts_at.isoformat(),
            "moved_to": payload.starts_at.isoformat() if payload.starts_at else None,
            "skipped": payload.starts_at is None,
        },
    )
    await session.commit()
    return await list_occurrences(event_id, session, user)


@router.delete("/{event_id}/occurrences", response_model=list[OccurrenceOut])
async def clear_occurrence_override(
    event_id: int, original_starts_at: datetime, session: DbSession, user: AdminUser
):
    """Put a moved or skipped date back on the rule."""
    row = await session.scalar(
        select(EventInstance).where(
            EventInstance.definition_id == event_id,
            EventInstance.original_starts_at == original_starts_at,
        )
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That date has no override")

    # A posted signup sheet still points at this row, so keep it and simply
    # stop treating it as a reschedule.
    if row.message_id:
        row.cancelled = False
        row.starts_at = original_starts_at
        row.override_note = None
    else:
        await session.delete(row)

    await write_audit(
        session, user, "event.occurrence.restore", "event", event_id,
        {"original": original_starts_at.isoformat()},
    )
    await session.commit()
    return await list_occurrences(event_id, session, user)
