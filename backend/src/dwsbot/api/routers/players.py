"""Game accounts, followed across nickname changes.

A player is one in-game account. The game shows no stable id and nicknames
change freely, so the id is ours, and `player_names` keeps every name an
account has gone by. Someone who leaves is marked inactive rather than deleted,
so a return is recognized as the same player.

Admins only, like the rest of the backoffice.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from ...models import Player, PlayerName
from ...schemas import PlayerCreate, PlayerOut, PlayerUpdate
from ...servertime import SERVER_TZ
from ..deps import AdminUser, DbSession, write_audit

router = APIRouter(prefix="/players", tags=["players"])

_WITH_NAMES = (selectinload(Player.names),)


def _today() -> date:
    """The game's own date, which is the same for every admin wherever they are."""
    return datetime.now(SERVER_TZ).date()


async def _load(session, player_id: uuid.UUID) -> Player:
    player = await session.scalar(
        select(Player).where(Player.id == player_id).options(*_WITH_NAMES)
    )
    if player is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such player")
    return player


async def _refuse_taken(session, name: str, except_id: uuid.UUID | None = None) -> None:
    """Two current members cannot share a name in the game, so they cannot here.

    Someone who left may have had it; the name is free again once they are gone.
    """
    stmt = select(Player.id).where(Player.name == name, Player.active.is_(True))
    if except_id is not None:
        stmt = stmt.where(Player.id != except_id)
    if await session.scalar(stmt) is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"Another current member is already called “{name}”"
        )


@router.get("", response_model=list[PlayerOut], summary="Every player, including those who left")
async def list_players(session: DbSession, _: AdminUser):
    stmt = (
        select(Player)
        .options(*_WITH_NAMES)
        .order_by(Player.active.desc(), Player.bgb_cp.desc().nullslast(), Player.name)
    )
    return list(await session.scalars(stmt))


@router.post("", response_model=PlayerOut, status_code=status.HTTP_201_CREATED)
async def create_player(payload: PlayerCreate, session: DbSession, user: AdminUser):
    await _refuse_taken(session, payload.name)
    today = _today()
    player = Player(**payload.model_dump())
    player.names.append(PlayerName(name=payload.name, first_seen=today, last_seen=today))
    session.add(player)
    await session.flush()
    await write_audit(session, user, "player.create", "player", player.id, {"name": player.name})
    await session.commit()
    return await _load(session, player.id)


@router.patch("/{player_id}", response_model=PlayerOut)
async def update_player(
    player_id: uuid.UUID, payload: PlayerUpdate, session: DbSession, user: AdminUser
):
    player = await _load(session, player_id)
    changes = payload.model_dump(exclude_unset=True)
    new_name = changes.pop("name", None)
    kind = changes.pop("name_change", None)
    # An explicit null on a required column means "leave it", not "clear it".
    if changes.get("active") is None:
        changes.pop("active", None)

    action, detail = "player.update", {}
    old_name = player.name

    if new_name is not None and new_name != old_name:
        if kind is None:
            # 422 by number: Starlette has renamed the constant, and the image
            # installs whichever Starlette is current.
            raise HTTPException(
                422,
                "Say whether the new name is a rename or a spelling fix",
            )
        await _refuse_taken(session, new_name, except_id=player.id)
        today = _today()
        by_name = {n.name: n for n in player.names}
        if kind == "rename":
            if new_name in by_name:
                # Renamed back to a name they had before: that name is simply seen again.
                by_name[new_name].last_seen = today
            else:
                player.names.append(PlayerName(name=new_name, first_seen=today, last_seen=today))
        else:
            if new_name in by_name:
                raise HTTPException(
                    status.HTTP_409_CONFLICT,
                    f"“{new_name}” is already one of this player's earlier names; "
                    "record it as a rename instead",
                )
            current = by_name.get(old_name)
            if current is not None:
                current.name = new_name
            else:
                player.names.append(PlayerName(name=new_name, first_seen=today, last_seen=today))
        player.name = new_name
        action = "player.rename" if kind == "rename" else "player.correct"
        detail["from"] = old_name

    # Only what actually differs, so History lists the fields someone edited.
    changed = {f: v for f, v in changes.items() if getattr(player, f) != v}
    if "active" in changed and action == "player.update":
        action = "player.returned" if changed["active"] else "player.left"
    if not changed and action == "player.update":
        return player

    for field, value in changed.items():
        setattr(player, field, value)

    detail["name"] = player.name
    if changed:
        detail["fields"] = sorted(changed)
    await write_audit(session, user, action, "player", player.id, detail)
    await session.commit()
    return await _load(session, player.id)


@router.delete(
    "/{player_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Erase a player added by mistake; mark someone who left as inactive instead",
)
async def delete_player(player_id: uuid.UUID, session: DbSession, user: AdminUser):
    player = await _load(session, player_id)
    await write_audit(session, user, "player.delete", "player", player.id, {"name": player.name})
    await session.delete(player)
    await session.commit()
