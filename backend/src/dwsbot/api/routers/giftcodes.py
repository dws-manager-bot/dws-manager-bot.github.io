"""Gift codes: the list, who wants theirs redeemed, and the run itself.

Admins only. The login token an account redeems with is accepted here and never
sent back: the accounts list says only whether one is set.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from ... import giftcodes
from ...models import AppUser, GiftCode, GiftCodeStatus
from ...schemas import (
    GiftAccountOut,
    GiftAccountUpdate,
    GiftCodeCreate,
    GiftCodeOut,
    GiftRunOut,
    RedemptionOut,
)
from ..deps import AdminUser, DbSession, write_audit

router = APIRouter(prefix="/giftcodes", tags=["gift codes"])


def _account_out(user: AppUser) -> GiftAccountOut:
    return GiftAccountOut(
        id=user.id,
        discord_id=user.discord_id,
        username=user.username,
        game_uid=user.game_uid,
        auto_redeem=user.auto_redeem,
        has_login=bool(user.game_uuid),
        login_failed_at=user.game_login_failed_at,
    )


def _run_out() -> GiftRunOut:
    s = giftcodes.state
    return GiftRunOut(
        running=s.running,
        started_at=s.started_at,
        finished_at=s.finished_at,
        summary=s.summary,
        error=s.error,
    )


# ------------------------------------------------------------------ accounts

@router.get("/accounts", response_model=list[GiftAccountOut],
            summary="Everyone who has signed in, with their game id and auto-redeem setting")
async def list_accounts(session: DbSession, _: AdminUser):
    users = await session.scalars(select(AppUser).order_by(AppUser.username, AppUser.id))
    return [_account_out(u) for u in users]


@router.patch("/accounts/{user_id}", response_model=GiftAccountOut)
async def update_account(
    user_id: int, payload: GiftAccountUpdate, session: DbSession, user: AdminUser
):
    account = await session.get(AppUser, user_id)
    if account is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such account")
    data = payload.model_dump(exclude_unset=True)

    if data.get("game_uid"):
        taken = await session.scalar(
            select(AppUser.id).where(
                AppUser.game_uid == data["game_uid"], AppUser.id != account.id
            )
        )
        if taken is not None:
            raise HTTPException(
                status.HTTP_409_CONFLICT, "Another account already has that game id"
            )

    if "game_uid" in data:
        account.game_uid = data["game_uid"]
    if "game_uuid" in data:
        account.game_uuid = data["game_uuid"]
        account.game_login_failed_at = None      # a new token deserves a fresh try
    if "auto_redeem" in data and data["auto_redeem"] is not None:
        account.auto_redeem = data["auto_redeem"]

    if account.auto_redeem and not (account.game_uid and account.game_uuid):
        if data.get("auto_redeem"):
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Auto-redeem needs both a game id and a login token",
            )
        # Something it depends on was just cleared, so it goes off with it.
        account.auto_redeem = False

    # The token is deliberately absent from the audit trail.
    await write_audit(
        session, user, "giftcode.account", "app_user", account.id,
        {"name": account.username, "game_uid": account.game_uid,
         "auto_redeem": account.auto_redeem, "login": bool(account.game_uuid)},
    )
    await session.commit()
    return _account_out(account)


# ----------------------------------------------------------------------- run

@router.get("/run", response_model=GiftRunOut, summary="Is a run going, and how did the last end")
async def run_status(_: AdminUser):
    return _run_out()


@router.post("/run", response_model=GiftRunOut, status_code=status.HTTP_202_ACCEPTED,
             summary="Redeem the live codes for every account that has asked for it")
async def start_run(session: DbSession, user: AdminUser):
    if giftcodes.state.running:
        raise HTTPException(status.HTTP_409_CONFLICT, "A run is already going")
    if not await giftcodes.eligible_users(session):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "No account is set up yet: it needs a game id, a login token and auto-redeem on",
        )
    live = await session.scalar(
        select(func.count()).select_from(GiftCode).where(
            GiftCode.status == GiftCodeStatus.ACTIVE.value
        )
    )
    if not live:
        raise HTTPException(status.HTTP_409_CONFLICT, "There are no live codes to redeem")

    await write_audit(session, user, "giftcode.run", "giftcode", None, {"codes": live})
    await session.commit()
    if not giftcodes.start():
        raise HTTPException(status.HTTP_409_CONFLICT, "A run is already going")
    return _run_out()


# --------------------------------------------------------------------- codes

@router.get("", response_model=list[GiftCodeOut], summary="Every code, newest first")
async def list_codes(session: DbSession, _: AdminUser):
    codes = list(
        await session.scalars(
            select(GiftCode)
            .options(selectinload(GiftCode.redemptions))
            .order_by(GiftCode.id.desc())
        )
    )
    names = {u.id: u.username for u in await session.scalars(select(AppUser))}
    eligible = await giftcodes.eligible_users(session)

    out = []
    for code in codes:
        by_user = {r.user_id: r for r in code.redemptions}
        live = code.status == GiftCodeStatus.ACTIVE.value
        item = GiftCodeOut.model_validate(code)
        item.redeemed = sum(1 for r in code.redemptions if r.state in giftcodes.FINAL)
        item.waiting = (
            sum(1 for u in eligible if giftcodes.is_owed(by_user.get(u.id))) if live else 0
        )
        item.results = [
            RedemptionOut(
                user_id=r.user_id,
                username=names.get(r.user_id),
                state=r.state,
                attempts=r.attempts,
                response=r.response,
                last_attempt_at=r.last_attempt_at,
            )
            for r in code.redemptions
        ]
        out.append(item)
    return out


@router.post("", response_model=GiftCodeOut, status_code=status.HTTP_201_CREATED)
async def add_code(payload: GiftCodeCreate, session: DbSession, user: AdminUser):
    # Whether the site ignores case is unknown, so two spellings count as one code.
    clash = await session.scalar(
        select(GiftCode.id).where(func.lower(GiftCode.code) == payload.code.lower())
    )
    if clash is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, f"{payload.code} is already in the list")

    code = GiftCode(
        code=payload.code,
        note=payload.note or None,
        source="manual",
        created_by_id=user.discord_id,
        created_by_name=user.username,
    )
    session.add(code)
    await session.flush()
    await write_audit(session, user, "giftcode.create", "giftcode", code.id, {"name": code.code})
    await session.commit()
    await session.refresh(code, ["redemptions"])
    out = GiftCodeOut.model_validate(code)
    out.waiting = len(await giftcodes.eligible_users(session))
    return out


@router.delete("/{code_id}", status_code=status.HTTP_204_NO_CONTENT,
               summary="For a code entered by mistake; its redemption history goes with it")
async def delete_code(code_id: int, session: DbSession, user: AdminUser):
    code = await session.get(GiftCode, code_id)
    if code is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such code")
    await write_audit(session, user, "giftcode.delete", "giftcode", code.id, {"name": code.code})
    await session.delete(code)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
