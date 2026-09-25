"""Black Gold Battlefield: recording a registration, and the cards it produces.

The roster is the game's, read off the Participants popup once registration
locks. An admin records it by marking the two-team spreadsheet this hands out,
and gets back the briefing cards the alliance is given — one per team, in each
of the fifteen languages the game ships BGB text for.

Admins only, like the rest of the backoffice.
"""
from __future__ import annotations

import datetime as dt
import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, File, Form, HTTPException, Query, Response, UploadFile, status
from sqlalchemy import delete, func, select

from ...bgb import cards, sheet
from ...models import BgbEvent, BgbRegistration, Player
from ...schemas import (
    BgbCpChangeOut,
    BgbEventOut,
    BgbLanguageOut,
    BgbRosterApplyIn,
    BgbRosterPreviewOut,
    BgbSeatOut,
    BgbSheetRowIn,
    BgbTeamOut,
)
from ..deps import AdminUser, DbSession, write_audit

router = APIRouter(prefix="/bgb", tags=["bgb"])

MAX_UPLOAD = 4 * 1024 * 1024
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

Team = Literal["A", "B"]


def _strongest_first(seats: list) -> list:
    return sorted(seats, key=lambda s: (-(s.bgb_cp or 0), s.name))


async def _event(session, event_id: int) -> BgbEvent:
    event = await session.get(BgbEvent, event_id)
    if event is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No roster has been recorded for that date")
    return event


async def _registrations(session, event_id: int, team: str | None = None) -> list[BgbRegistration]:
    stmt = select(BgbRegistration).where(BgbRegistration.event_id == event_id)
    if team:
        stmt = stmt.where(BgbRegistration.team == team)
    return _strongest_first(list(await session.scalars(stmt)))


@router.get("/languages", response_model=list[BgbLanguageOut],
            summary="The languages a card can be drawn in")
async def languages(_: AdminUser):
    return cards.LANGUAGES


@router.get("/events", response_model=list[BgbEventOut], summary="Battles already recorded")
async def list_events(session: DbSession, _: AdminUser):
    events = list(await session.scalars(select(BgbEvent).order_by(BgbEvent.battle_date.desc())))
    counts = await session.execute(
        select(BgbRegistration.event_id, BgbRegistration.team, BgbRegistration.role,
               func.count())
        .group_by(BgbRegistration.event_id, BgbRegistration.team, BgbRegistration.role)
    )
    tally: dict[int, dict[str, dict[str, int]]] = {}
    for event_id, team, role, count in counts:
        tally.setdefault(event_id, {sheet.STARTER: {}, sheet.SUBSTITUTE: {}})[role][team] = count
    return [
        BgbEventOut(
            id=event.id, battle_date=event.battle_date, recorded_at=event.updated_at,
            starters=tally.get(event.id, {}).get(sheet.STARTER, {}),
            substitutes=tally.get(event.id, {}).get(sheet.SUBSTITUTE, {}),
        )
        for event in events
    ]


@router.get("/template.xlsx", summary="One sheet per team, every member on both")
async def template(session: DbSession, _: AdminUser):
    players = list(await session.scalars(select(Player).where(Player.active.is_(True))))
    book = sheet.build_template(players, dt.date.today())
    stamp = dt.date.today().isoformat()
    return Response(
        content=book, media_type=XLSX,
        headers={"Content-Disposition": f'attachment; filename="pou-bgb-roster-{stamp}.xlsx"'},
    )


@router.post("/roster/preview", response_model=BgbRosterPreviewOut,
             summary="The roster an uploaded sheet holds; writes nothing")
async def preview_roster(
    session: DbSession,
    _: AdminUser,
    file: Annotated[UploadFile, File()],
    battle_date: Annotated[dt.date, Form()],
):
    data = await file.read()
    if len(data) > MAX_UPLOAD:
        raise HTTPException(status.HTTP_409_CONFLICT, "That file is larger than 4 MB.")
    rows, problems = sheet.read_workbook(data)
    players = list(await session.scalars(select(Player)))
    plan = sheet.plan_roster(rows, players)
    plan.problems = problems + plan.problems
    replaces = await session.scalar(
        select(func.count())
        .select_from(BgbRegistration)
        .join(BgbEvent)
        .where(BgbEvent.battle_date == battle_date)
    )
    return _preview(plan, rows, players, battle_date, replaces or 0)


@router.post("/roster/apply", response_model=BgbRosterPreviewOut,
             summary="Record a registration the person has looked at and agreed to")
async def apply_roster(payload: BgbRosterApplyIn, session: DbSession, user: AdminUser):
    players = list(await session.scalars(select(Player)))
    if sheet.fingerprint(players) != payload.fingerprint:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "The member list changed while you were looking at this. Upload the file again.")
    rows = [sheet.SheetRow(**row.model_dump()) for row in payload.rows]
    plan = sheet.plan_roster(rows, players)
    if plan.problems:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, " ".join(plan.problems))

    event = await session.scalar(
        select(BgbEvent).where(BgbEvent.battle_date == payload.battle_date))
    if event is None:
        event = BgbEvent(battle_date=payload.battle_date)
        session.add(event)
        await session.flush()
    else:
        # Re-uploading a date replaces its roster; registration is a snapshot of
        # one moment, so a second reading of it supersedes the first rather than
        # adding to it.
        await session.execute(
            delete(BgbRegistration).where(BgbRegistration.event_id == event.id))

    for seat in plan.seats:
        session.add(BgbRegistration(
            event_id=event.id, team=seat.team, role=seat.role, name=seat.name,
            bgb_cp=seat.bgb_cp,
            # A mercenary is nobody's player, so the seat points at no row.
            player_id=uuid.UUID(seat.player_id) if seat.player_id else None))

    by_id = {str(p.id): p for p in players}
    for change in plan.cp_changes:
        by_id[change.player_id].bgb_cp = change.after

    counts = {t: {"starters": len(plan.of(t, sheet.STARTER)),
                  "substitutes": len(plan.of(t, sheet.SUBSTITUTE)),
                  "mercenaries": sum(1 for s in plan.seats if s.team == t and s.mercenary)}
              for t in sheet.TEAMS}
    summary = "BGB {}: {}".format(payload.battle_date, ", ".join(
        f"Team {t} {counts[t]['starters']}+{counts[t]['substitutes']}" for t in sheet.TEAMS))
    await write_audit(session, user, "bgb.roster", "bgb_event", str(event.id), {
        "name": summary,
        "battle_date": payload.battle_date.isoformat(),
        "uploaded_at": dt.datetime.now(dt.UTC).isoformat(timespec="seconds"),
        "file": payload.file_name,
        "counts": counts,
        "cp_updated": len(plan.cp_changes),
    })
    await session.commit()
    fresh = list(await session.scalars(select(Player)))
    out = _preview(plan, rows, fresh, payload.battle_date, 0)
    out.event_id = event.id
    return out


@router.get("/events/{event_id}/card.png", summary="One team's briefing card")
async def card(
    event_id: int,
    session: DbSession,
    _: AdminUser,
    team: Annotated[Team, Query()],
    lang: Annotated[str, Query()] = "en",
):
    if lang not in cards.CODES:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No card is drawn in “{lang}”")
    event = await _event(session, event_id)
    registrations = await _registrations(session, event_id, team)
    if not registrations:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Team {team} has nobody registered")
    png = cards.render(registrations, team, event.battle_date, lang)
    return Response(
        content=png, media_type="image/png",
        headers={"Content-Disposition":
                 f'inline; filename="{cards.file_name(team, lang)}"'},
    )


@router.get("/events/{event_id}/cards.zip", summary="Every card for a battle, zipped")
async def all_cards(event_id: int, session: DbSession, _: AdminUser):
    event = await _event(session, event_id)
    registrations = await _registrations(session, event_id)
    if not registrations:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Nobody is registered for that battle")
    by_team = {t: [r for r in registrations if r.team == t] for t in sheet.TEAMS}
    stamp = event.battle_date.strftime("%Y%m%d")
    return Response(
        content=cards.render_all(by_team, event.battle_date),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="bgb-{stamp}-cards.zip"'},
    )


@router.get("/events/{event_id}", response_model=list[BgbTeamOut],
            summary="A recorded roster, team by team")
async def event_roster(event_id: int, session: DbSession, _: AdminUser):
    await _event(session, event_id)
    registrations = await _registrations(session, event_id)
    return [
        BgbTeamOut(
            team=team,
            starters=[_seat(r) for r in registrations
                      if r.team == team and r.role == sheet.STARTER],
            substitutes=[_seat(r) for r in registrations
                         if r.team == team and r.role == sheet.SUBSTITUTE],
            warnings=cards.warnings([r for r in registrations if r.team == team], team),
        )
        for team in sheet.TEAMS
        if any(r.team == team for r in registrations)
    ]


def _seat(registration: BgbRegistration) -> BgbSeatOut:
    return BgbSeatOut(
        player_id=str(registration.player_id) if registration.player_id else None,
        name=registration.name, team=registration.team, role=registration.role,
        bgb_cp=registration.bgb_cp, mercenary=registration.player_id is None)


def _preview(plan: sheet.Plan, rows: list, players: list, battle_date: dt.date,
             replaces: int) -> BgbRosterPreviewOut:
    teams = [
        BgbTeamOut(
            team=team,
            starters=[BgbSeatOut(**vars(s))
                      for s in _strongest_first(plan.of(team, sheet.STARTER))],
            substitutes=[BgbSeatOut(**vars(s))
                         for s in _strongest_first(plan.of(team, sheet.SUBSTITUTE))],
            warnings=cards.warnings(plan.of(team, sheet.STARTER)
                                    + plan.of(team, sheet.SUBSTITUTE), team),
        )
        for team in sheet.TEAMS
        if plan.of(team, sheet.STARTER) or plan.of(team, sheet.SUBSTITUTE)
    ]
    return BgbRosterPreviewOut(
        battle_date=battle_date, fingerprint=sheet.fingerprint(players),
        rows=[BgbSheetRowIn(**vars(r)) for r in rows], teams=teams,
        cp_changes=[BgbCpChangeOut(**vars(c)) for c in plan.cp_changes],
        problems=plan.problems, replaces=replaces,
    )
