"""Redeeming gift codes on the game's own site.

The site's "exchange center" is one GET: the account's game id, the code, and
the login token (`uuid`) that the site issues when someone scans its QR code
with the game. The id also goes in a `userToken` header. A token the site does
not know answers `{"code": 10006}`; everything else answers `{"errorCode": ...}`.

Nothing here logs or stores the request, which carries the token. What is kept
is the site's own `message`.

One run at a time, started by an admin. The site rate-limits a little (E009,
which clears in about six seconds), so calls are spaced out and a run takes
roughly six seconds per call. That is why it runs in the background rather than
inside the request that started it.
"""
from __future__ import annotations

import asyncio
import enum
import logging
from collections import Counter
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from .db import get_sessionmaker
from .models import AppUser, GiftCode, GiftCodeRedemption, GiftCodeStatus, RedemptionState

log = logging.getLogger(__name__)

REDEEM_URL = "https://giftcenter.darkwar-survival.com/code.php"
COOLDOWN_SECONDS = 6.0
# Calls per account per code before an unknown code or a system error is left alone.
MAX_ATTEMPTS = 3
# An account in either of these is done with the code: it is never called for again.
FINAL = {RedemptionState.REDEEMED.value, RedemptionState.ALREADY.value}


class Outcome(enum.StrEnum):
    """What one call to the site came to."""

    OK = "ok"
    ALREADY = "already"
    NOT_FOUND = "not_found"
    EXPIRED = "expired"
    EXHAUSTED = "exhausted"
    COOLDOWN = "cooldown"
    LOGIN = "login"        # the site does not accept this account's token
    ERROR = "error"


_BY_CODE = {
    "ok": Outcome.OK,
    "E004": Outcome.NOT_FOUND,
    "E005": Outcome.EXPIRED,
    "E006": Outcome.ALREADY,
    "E007": Outcome.EXHAUSTED,
    "E009": Outcome.COOLDOWN,
}
_STATE = {
    Outcome.OK: RedemptionState.REDEEMED,
    Outcome.ALREADY: RedemptionState.ALREADY,
    Outcome.NOT_FOUND: RedemptionState.NOT_FOUND,
    Outcome.EXPIRED: RedemptionState.EXPIRED,
    Outcome.EXHAUSTED: RedemptionState.EXHAUSTED,
    Outcome.ERROR: RedemptionState.ERROR,
}
_LOGIN_REFUSED = 10006


def interpret(body: object) -> tuple[Outcome, str]:
    """Read the site's answer. Anything unrecognised is an error, kept verbatim."""
    if not isinstance(body, dict):
        return Outcome.ERROR, "unreadable response"
    message = str(body.get("message") or "")[:200]
    if body.get("code") == _LOGIN_REFUSED:
        return Outcome.LOGIN, message
    # E001-E003 and E008 are the site's own system errors, so they land here too.
    outcome = _BY_CODE.get(body.get("errorCode"), Outcome.ERROR)
    return outcome, message or str(body.get("errorCode") or "")


Caller = Callable[[str, str, str], Awaitable[tuple[Outcome, str]]]


def http_caller(client: httpx.AsyncClient) -> Caller:
    async def call(uid: str, uuid: str, code: str) -> tuple[Outcome, str]:
        try:
            resp = await client.get(
                REDEEM_URL,
                params={"uid": uid, "code": code, "uuid": uuid, "fromkoc": ""},
                headers={"userToken": uid},
            )
            body = resp.json()
        except (httpx.HTTPError, ValueError) as exc:
            # The class name only: some httpx messages quote the URL, token and all.
            return Outcome.ERROR, f"request failed ({type(exc).__name__})"
        return interpret(body)

    return call


async def eligible_users(session: AsyncSession) -> list[AppUser]:
    """Everyone who asked for their codes to be redeemed and can be."""
    stmt = (
        select(AppUser)
        .where(
            AppUser.auto_redeem.is_(True),
            AppUser.game_uid.is_not(None),
            AppUser.game_uuid.is_not(None),
        )
        .order_by(AppUser.id)
    )
    return list(await session.scalars(stmt))


def is_owed(row: GiftCodeRedemption | None) -> bool:
    """Whether the account still has a call coming for a code it has a row for."""
    return row is None or (row.state not in FINAL and row.attempts < MAX_ATTEMPTS)


async def run(
    maker: async_sessionmaker[AsyncSession],
    caller: Caller,
    *,
    cooldown: float = COOLDOWN_SECONDS,
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
) -> dict[str, int]:
    """Redeem every live code for every account that is owed one.

    Newest code first: a first-come-first-served code is the one that can run out
    while we work. A code the site calls expired or used up is closed for all
    accounts and the run moves on. Each call is committed as it lands, so a run
    that dies halfway loses nothing it had already done.
    """
    summary: Counter[str] = Counter()
    async with maker() as session:
        codes = list(
            await session.scalars(
                select(GiftCode)
                .where(GiftCode.status == GiftCodeStatus.ACTIVE.value)
                .order_by(GiftCode.id.desc())
            )
        )
        users = await eligible_users(session)
        refused: set[int] = set()
        called = False

        for code in codes:
            rows = {
                r.user_id: r
                for r in await session.scalars(
                    select(GiftCodeRedemption).where(GiftCodeRedemption.code_id == code.id)
                )
            }
            for user in users:
                row = rows.get(user.id)
                if user.id in refused or not is_owed(row):
                    continue
                if called:
                    await sleep(cooldown)
                called = True

                outcome, message = await caller(user.game_uid, user.game_uuid, code.code)
                if outcome is Outcome.COOLDOWN:
                    await sleep(cooldown * 2)
                    outcome, message = await caller(user.game_uid, user.game_uuid, code.code)

                now = datetime.now(UTC)
                if outcome is Outcome.LOGIN:
                    user.game_login_failed_at = now
                    refused.add(user.id)
                    summary["login_refused"] += 1
                    await session.commit()
                    continue
                if outcome is Outcome.COOLDOWN:
                    # Still rate-limited: not the code's fault, so no attempt is spent.
                    summary["cooldown"] += 1
                    continue

                if row is None:
                    row = GiftCodeRedemption(code_id=code.id, user_id=user.id, attempts=0)
                    session.add(row)
                    rows[user.id] = row
                row.state = _STATE[outcome].value
                row.attempts += 1
                row.response = message or None
                row.last_attempt_at = now
                user.game_login_failed_at = None     # the token worked
                summary[outcome.value] += 1

                if outcome in (Outcome.EXPIRED, Outcome.EXHAUSTED):
                    code.status = _STATE[outcome].value
                    code.closed_response = message or None
                    code.closed_at = now
                    summary["codes_closed"] += 1
                    await session.commit()
                    break
                await session.commit()
    return dict(summary)


# ------------------------------------------------------------- the one run
#
# Module state, because there is one app process. A second would also hold a
# second Discord session, which the deployment already forbids.

@dataclass
class RunState:
    running: bool = False
    started_at: datetime | None = None
    finished_at: datetime | None = None
    summary: dict[str, int] = field(default_factory=dict)
    error: str | None = None
    task: asyncio.Task | None = None


state = RunState()


async def _guarded(maker: async_sessionmaker[AsyncSession]) -> None:
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            state.summary = await run(maker, http_caller(client))
    except Exception:
        log.exception("gift-code run failed")
        state.error = "The run stopped on an error. The server log has the details."
    finally:
        state.running = False
        state.finished_at = datetime.now(UTC)


def start(maker: async_sessionmaker[AsyncSession] | None = None) -> bool:
    """Begin a run in the background. False if one is already going."""
    if state.running:
        return False
    state.running = True
    state.started_at = datetime.now(UTC)
    state.finished_at = None
    state.summary = {}
    state.error = None
    # Kept on the state: the loop only holds a weak reference to a task.
    state.task = asyncio.create_task(_guarded(maker or get_sessionmaker()))
    return True
