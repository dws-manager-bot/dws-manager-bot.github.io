"""The season war planner: alliances, the territory board, war days and plans.

Four things, from the longest-lived down:

- **Alliances** on the season map, both camps, each in its own color.
- **The board**: who holds each territory right now. There is one, shared, and
  it is updated after each war. Rankings are read off it.
- **War days**: usually a Saturday.
- **Plans** for a day, shaped like the Pass War line-ups: one draft per admin,
  and one official plan that a draft is copied into when published.

A plan never stores ownership outright, only its differences from the board, so
a plan drawn on Tuesday still means the same thing after Wednesday's board edit.

Admin-only, reading included: this is the alliance's strategy, and members get
it as an image when it is ready.
"""
from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import delete, func, select

from ...models import WarAlliance, WarDay, WarHolding, WarPlan
from ...schemas import (
    WarAllianceIn,
    WarAllianceOut,
    WarAlliancePatch,
    WarBoardIn,
    WarDayIn,
    WarDayOut,
    WarDayPatch,
    WarHoldingOut,
    WarPlanIn,
    WarPlanOut,
    WarPlanSummary,
)
from ..deps import AdminUser, DbSession, write_audit
from .lineups import _names

router = APIRouter(prefix="/war", tags=["war planner"])

# The season the map in the frontend is drawn from. A new season is a new map
# and a new number here; nothing of the old one is deleted.
SEASON = 5

# worldcity ids on the season 5 map: Pyramids and the Royal Court, passes,
# Strongholds, Oases. The map itself is frontend data; this only stops a typo
# writing a holding that can never be drawn.
CITY_IDS = frozenset([*range(101, 174), *range(201, 225), *range(302, 528)])

# A plan is a few hundred drawings at most. Past this something is wrong.
MAX_DOC_BYTES = 1_000_000


# ---------------------------------------------------------------- alliances

async def _alliance(session, alliance_id: int) -> WarAlliance:
    row = await session.get(WarAlliance, alliance_id)
    if row is None or row.season != SEASON:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such alliance")
    return row


async def _clash(session, *, name: str | None, color: str | None, skip: int | None) -> None:
    """Refuse a name or color another alliance already has, naming which.

    The database enforces both too; checking first is what lets the message
    say who has it, which is the thing the admin needs to fix it.
    """
    for field, value, what in (("name", name, "That name"), ("color", color, "That color")):
        if value is None:
            continue
        column = getattr(WarAlliance, field)
        clause = func.lower(column) == value.lower()
        taken = await session.scalar(
            select(WarAlliance).where(WarAlliance.season == SEASON, clause)
        )
        if taken is not None and taken.id != skip:
            raise HTTPException(status.HTTP_409_CONFLICT, f"{what} is already {taken.name}'s")


@router.get("/alliances", response_model=list[WarAllianceOut], summary="Alliances on the map")
async def list_alliances(session: DbSession, _: AdminUser):
    return list(await session.scalars(
        select(WarAlliance).where(WarAlliance.season == SEASON)
        .order_by(WarAlliance.camp, WarAlliance.name)
    ))


@router.post("/alliances", response_model=WarAllianceOut, status_code=status.HTTP_201_CREATED,
             summary="Add an alliance")
async def create_alliance(payload: WarAllianceIn, session: DbSession, user: AdminUser):
    await _clash(session, name=payload.name, color=payload.color, skip=None)
    row = WarAlliance(season=SEASON, **payload.model_dump(),
                      updated_by_id=user.discord_id, updated_by_name=user.username)
    session.add(row)
    await session.flush()
    await write_audit(session, user, "war.alliance.create", "war_alliance", row.id,
                      {"name": row.name, "camp": row.camp, "color": row.color})
    await session.commit()
    await session.refresh(row)
    return row


@router.patch("/alliances/{alliance_id}", response_model=WarAllianceOut,
              summary="Change an alliance")
async def update_alliance(alliance_id: int, payload: WarAlliancePatch,
                          session: DbSession, user: AdminUser):
    row = await _alliance(session, alliance_id)
    changes = payload.model_dump(exclude_unset=True)
    # camp and name cannot be emptied; the rest can.
    for key in ("name", "camp", "color"):
        if key in changes and changes[key] is None:
            changes.pop(key)
    await _clash(session, name=changes.get("name"), color=changes.get("color"), skip=row.id)
    for key, value in changes.items():
        setattr(row, key, value)
    row.updated_by_id = user.discord_id
    row.updated_by_name = user.username
    await write_audit(session, user, "war.alliance.update", "war_alliance", row.id, changes)
    await session.commit()
    await session.refresh(row)
    return row


@router.delete("/alliances/{alliance_id}", status_code=status.HTTP_204_NO_CONTENT,
               summary="Remove an alliance; what it held goes neutral")
async def delete_alliance(alliance_id: int, session: DbSession, user: AdminUser) -> None:
    row = await _alliance(session, alliance_id)
    held = await session.scalar(
        select(func.count()).select_from(WarHolding).where(WarHolding.alliance_id == row.id)
    )
    # Explicit rather than left to ON DELETE CASCADE, so the rule does not depend
    # on the database enforcing foreign keys.
    await session.execute(delete(WarHolding).where(WarHolding.alliance_id == row.id))
    await session.delete(row)
    await write_audit(session, user, "war.alliance.delete", "war_alliance", alliance_id,
                      {"name": row.name, "released": held or 0})
    await session.commit()


# -------------------------------------------------------------------- board

@router.get("/board", response_model=list[WarHoldingOut], summary="Who holds what, now")
async def board(session: DbSession, _: AdminUser):
    return list(await session.scalars(select(WarHolding).where(WarHolding.season == SEASON)))


@router.put("/board", response_model=list[WarHoldingOut],
            summary="Change who holds one or more territories")
async def change_board(payload: WarBoardIn, session: DbSession, user: AdminUser):
    unknown = sorted({c.city_id for c in payload.changes} - CITY_IDS)
    if unknown:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                            f"Not a territory on this map: {', '.join(map(str, unknown))}")
    wanted = {c.alliance_id for c in payload.changes if c.alliance_id is not None}
    if wanted:
        found = set(await session.scalars(
            select(WarAlliance.id).where(WarAlliance.season == SEASON, WarAlliance.id.in_(wanted))
        ))
        if wanted - found:
            raise HTTPException(status.HTTP_404_NOT_FOUND,
                                "One of those alliances has been removed — reload the page")

    log = []
    for change in payload.changes:
        row = await session.get(WarHolding, (SEASON, change.city_id))
        before = row.alliance_id if row else None
        if before == change.alliance_id:
            continue
        if change.alliance_id is None:
            await session.delete(row)
        else:
            if row is None:
                row = WarHolding(season=SEASON, city_id=change.city_id)
                session.add(row)
            row.alliance_id = change.alliance_id
            row.updated_by_id = user.discord_id
            row.updated_by_name = user.username
        log.append({"city": change.city_id, "from": before, "to": change.alliance_id})

    if log:
        # One row per edit, holding every territory it moved: this is also what a
        # season history will be rebuilt from.
        await write_audit(session, user, "war.board", "war_board", SEASON, {"changes": log})
    await session.commit()
    return list(await session.scalars(select(WarHolding).where(WarHolding.season == SEASON)))


# --------------------------------------------------------------------- days

async def _day(session, day_id: int) -> WarDay:
    row = await session.get(WarDay, day_id)
    if row is None or row.season != SEASON:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such war day")
    return row


async def _day_out(session, row: WarDay) -> WarDayOut:
    plans = list(await session.scalars(select(WarPlan).where(WarPlan.day_id == row.id)))
    out = WarDayOut.model_validate(row)
    out.plans = len(plans)
    out.official = any(p.owner_id is None for p in plans)
    return out


@router.get("/days", response_model=list[WarDayOut], summary="War days, newest first")
async def list_days(session: DbSession, _: AdminUser):
    rows = list(await session.scalars(
        select(WarDay).where(WarDay.season == SEASON).order_by(WarDay.day.desc())
    ))
    return [await _day_out(session, r) for r in rows]


@router.post("/days", response_model=WarDayOut, status_code=status.HTTP_201_CREATED,
             summary="Start planning a war day")
async def create_day(payload: WarDayIn, session: DbSession, user: AdminUser):
    taken = await session.scalar(
        select(WarDay).where(WarDay.season == SEASON, WarDay.day == payload.day)
    )
    if taken is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, f"{payload.day} already has a war day")
    row = WarDay(season=SEASON, **payload.model_dump(),
                 created_by_id=user.discord_id, created_by_name=user.username)
    session.add(row)
    await session.flush()
    await write_audit(session, user, "war.day.create", "war_day", row.id,
                      {"day": payload.day.isoformat()})
    await session.commit()
    await session.refresh(row)
    return await _day_out(session, row)


@router.patch("/days/{day_id}", response_model=WarDayOut, summary="Rename a war day")
async def update_day(day_id: int, payload: WarDayPatch, session: DbSession, user: AdminUser):
    row = await _day(session, day_id)
    changes = payload.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(row, key, value)
    await write_audit(session, user, "war.day.update", "war_day", row.id, changes)
    await session.commit()
    await session.refresh(row)
    return await _day_out(session, row)


@router.delete("/days/{day_id}", status_code=status.HTTP_204_NO_CONTENT,
               summary="Delete a war day and every plan drawn for it")
async def delete_day(day_id: int, session: DbSession, user: AdminUser) -> None:
    row = await _day(session, day_id)
    await session.execute(delete(WarPlan).where(WarPlan.day_id == row.id))
    await session.delete(row)
    await write_audit(session, user, "war.day.delete", "war_day", day_id,
                      {"day": row.day.isoformat()})
    await session.commit()


# -------------------------------------------------------------------- plans

def _summary(row: WarPlan, names: dict[int, str], cls=WarPlanSummary):
    extra = {"doc": row.doc or {}} if cls is WarPlanOut else {}
    return cls(
        id=row.id, day_id=row.day_id, owner_id=row.owner_id,
        # The stored name is only a fallback, for someone who has since been removed.
        owner_name=names.get(row.owner_id) or row.owner_name,
        official=row.owner_id is None,
        scenarios=len((row.doc or {}).get("scenarios", [])),
        version=row.version, source_name=row.source_name,
        updated_by_name=names.get(row.updated_by_id) or row.updated_by_name,
        updated_at=row.updated_at, **extra,
    )


async def _plan(session, plan_id: int) -> WarPlan:
    row = await session.get(WarPlan, plan_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such plan")
    await _day(session, row.day_id)
    return row


async def _out(session, row: WarPlan) -> WarPlanOut:
    return _summary(row, await _names(session, row.owner_id, row.updated_by_id), WarPlanOut)


def _check_size(doc: dict) -> None:
    if len(json.dumps(doc)) > MAX_DOC_BYTES:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "That plan is too large to save")


@router.get("/days/{day_id}/plans", response_model=list[WarPlanSummary],
            summary="The official plan and every draft for a day")
async def list_plans(day_id: int, session: DbSession, user: AdminUser):
    await _day(session, day_id)
    rows = list(await session.scalars(select(WarPlan).where(WarPlan.day_id == day_id)))
    names = await _names(session, *[r.owner_id for r in rows], *[r.updated_by_id for r in rows])
    # Official first, then your own draft, then everyone else's by last change.
    rows.sort(key=lambda r: (
        r.owner_id is not None, r.owner_id != user.discord_id,
        -(r.updated_at.timestamp() if r.updated_at else 0),
    ))
    return [_summary(r, names) for r in rows]


@router.get("/plans/{plan_id}", response_model=WarPlanOut, summary="Read one plan")
async def get_plan(plan_id: int, session: DbSession, _: AdminUser):
    return await _out(session, await _plan(session, plan_id))


@router.put("/days/{day_id}/mine", response_model=WarPlanOut, summary="Save your own draft")
async def save_mine(day_id: int, payload: WarPlanIn, session: DbSession, user: AdminUser):
    await _day(session, day_id)
    doc = payload.doc.model_dump(mode="json")
    _check_size(doc)
    row = await session.scalar(
        select(WarPlan).where(WarPlan.day_id == day_id, WarPlan.owner_id == user.discord_id)
    )
    if row is not None and payload.version != row.version:
        # Most likely the same admin on a second device. Saving anyway would
        # quietly throw away whatever that save contained.
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Your draft was saved from somewhere else since you opened it. "
            "Reload it, then make your change again.",
        )
    if row is None:
        row = WarPlan(day_id=day_id, owner_id=user.discord_id, version=0)
        session.add(row)
    row.doc = doc
    row.version += 1
    row.owner_name = user.username
    row.updated_by_id = user.discord_id
    row.updated_by_name = user.username
    await write_audit(session, user, "war.plan.save", "war_plan", day_id,
                      {"scenarios": len(doc["scenarios"]),
                       "items": sum(len(s["items"]) for s in doc["scenarios"])})
    await session.commit()
    await session.refresh(row)
    return await _out(session, row)


@router.post("/plans/{plan_id}/publish", response_model=WarPlanOut,
             summary="Make a draft the day's official plan")
async def publish(plan_id: int, session: DbSession, user: AdminUser):
    src = await _plan(session, plan_id)
    if src.owner_id is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "That is already the official plan")
    official = await session.scalar(
        select(WarPlan).where(WarPlan.day_id == src.day_id, WarPlan.owner_id.is_(None))
    )
    if official is None:
        official = WarPlan(day_id=src.day_id, owner_id=None, version=0)
        session.add(official)
    # Copy, never move: the draft stays put so its author keeps working on it.
    official.doc = json.loads(json.dumps(src.doc or {}))
    official.version += 1
    official.source_id = src.id
    official.source_name = src.owner_name
    official.updated_by_id = user.discord_id
    official.updated_by_name = user.username
    await write_audit(session, user, "war.plan.publish", "war_plan", src.day_id,
                      {"from": src.owner_name})
    await session.commit()
    await session.refresh(official)
    return await _out(session, official)


@router.delete("/plans/{plan_id}", status_code=status.HTTP_204_NO_CONTENT,
               summary="Delete your draft, or withdraw the official plan")
async def delete_plan(plan_id: int, session: DbSession, user: AdminUser) -> None:
    row = await _plan(session, plan_id)
    if row.owner_id is not None and row.owner_id != user.discord_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            f"That draft is {row.owner_name or 'another admin'}'s")
    await session.delete(row)
    await write_audit(session, user, "war.plan.delete", "war_plan", row.day_id,
                      {"official": row.owner_id is None})
    await session.commit()
