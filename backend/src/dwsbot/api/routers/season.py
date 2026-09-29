"""The season's standing: who turned out, and who carried it.

Seasonal rewards are handed out in tiers, so they need an order to hand them out
in. Attendance decides it — that is the thing a member can be held to, and the
thing nobody can argue with.

Merits break the ties, and there are a lot of ties: turning up to everything is
the norm, not the distinction. A merit is earned by being there at the first
wave with the passes ready to attack, so it measures preparation rather than
sheer power, which is why it belongs here at all.

Merits are averaged only over the days they were recorded. One conquest mattered
less than the others and its ranking was never captured; counting that as a zero
would punish everyone who turned up to it.

BGB is reported beside the count and never inside it. Only twenty of a hundred
get a seat, so a member who was never picked has missed nothing.
"""
from __future__ import annotations

from collections import defaultdict

from fastapi import APIRouter, Query
from sqlalchemy import func, select

from ...models import (
    AttendanceEvent,
    AttendanceRecord,
    BgbEvent,
    BgbRegistration,
    Player,
    PlayerName,
)
from ...schemas import SeasonDayOut, SeasonEventOut, SeasonMemberOut, SeasonOut
from ..deps import AdminUser, DbSession

router = APIRouter(prefix="/season", tags=["season"])

STRIFE_PASS = "strife_pass"


def _percentiles(merits: dict) -> dict:
    """Where each member stood that day, 1.0 for the best and 0.0 for the last.

    A standing, not a score: merit totals differ by an order of magnitude
    between one war and the next, and a rank does not.
    """
    ranked = sorted(merits.items(), key=lambda kv: -kv[1])
    if len(ranked) == 1:
        return {ranked[0][0]: 1.0}
    return {pid: 1.0 - i / (len(ranked) - 1) for i, (pid, _) in enumerate(ranked)}


@router.get("", response_model=SeasonOut, summary="Every member's season, ranked")
async def season(
    session: DbSession,
    _: AdminUser,
    kind: str = Query(STRIFE_PASS, description="Which run of events to count"),
):
    events = list(await session.scalars(
        select(AttendanceEvent).where(AttendanceEvent.kind == kind)
        .order_by(AttendanceEvent.held_on)))
    records = list(await session.scalars(
        select(AttendanceRecord).where(
            AttendanceRecord.event_id.in_([e.id for e in events]))
    )) if events else []

    by_event: dict[int, list] = defaultdict(list)
    for record in records:
        by_event[record.event_id].append(record)

    # One standing per member per day, over the days a ranking was captured.
    standing: dict = defaultdict(list)
    for event in events:
        merits = {r.player_id: r.merits for r in by_event[event.id] if r.merits is not None}
        for pid, place in _percentiles(merits).items():
            standing[pid].append(place)

    seen: dict = defaultdict(dict)
    for record in records:
        seen[record.player_id][record.event_id] = record

    # BGB sits beside the count: seats taken, battles fought, starts missed.
    bgb = defaultdict(lambda: {"seats": 0, "fought": 0, "no_shows": 0})
    rows = await session.execute(
        select(BgbRegistration.player_id, BgbRegistration.role,
               BgbRegistration.participated, func.count())
        .join(BgbEvent)
        .where(BgbRegistration.player_id.isnot(None))
        .group_by(BgbRegistration.player_id, BgbRegistration.role,
                  BgbRegistration.participated))
    for pid, role, participated, count in rows:
        bgb[pid]["seats"] += count
        if participated:
            bgb[pid]["fought"] += count
        elif role == "starter" and participated is not None:
            bgb[pid]["no_shows"] += count

    players = list(await session.scalars(
        select(Player).where(Player.active.is_(True))))
    first_seen = dict((await session.execute(
        select(PlayerName.player_id, func.min(PlayerName.first_seen))
        .group_by(PlayerName.player_id))).all())

    members = []
    for player in players:
        days = [
            SeasonDayOut(
                event_id=e.id, held_on=e.held_on,
                present=bool(seen[player.id].get(e.id) and seen[player.id][e.id].present),
                recorded=e.id in seen[player.id],
                merits=(seen[player.id][e.id].merits if e.id in seen[player.id] else None),
            )
            for e in events
        ]
        places = standing.get(player.id, [])
        members.append(SeasonMemberOut(
            player_id=str(player.id), name=player.name, rank=player.rank,
            bgb_cp=player.bgb_cp,
            attended=sum(1 for d in days if d.present), of=len(events), days=days,
            merit_standing=(sum(places) / len(places)) if places else None,
            merit_days=len(places),
            first_seen=first_seen.get(player.id),
            bgb_seats=bgb[player.id]["seats"], bgb_fought=bgb[player.id]["fought"],
            bgb_no_shows=bgb[player.id]["no_shows"],
        ))

    # Attendance first, then who was there at the first wave. A member with no
    # merit day at all sorts below one who has a standing, never above it.
    members.sort(key=lambda m: (-m.attended,
                                -(m.merit_standing if m.merit_standing is not None else -1),
                                m.name.lower()))
    return SeasonOut(
        kind=kind,
        events=[SeasonEventOut(
            id=e.id, held_on=e.held_on, title=e.title,
            present=sum(1 for r in by_event[e.id] if r.present),
            recorded=len(by_event[e.id]),
            has_merits=any(r.merits is not None for r in by_event[e.id]),
        ) for e in events],
        members=members,
    )
