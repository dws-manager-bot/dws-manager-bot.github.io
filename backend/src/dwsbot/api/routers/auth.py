"""Discord OAuth2 login for the backoffice."""
from __future__ import annotations

import logging
from datetime import UTC, datetime
from urllib.parse import urlencode

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select

from ...config import get_settings
from ...models import AppUser
from ...names import guild_display_name
from ...permissions import access_level
from ...schemas import MeOut
from ...security import (
    authorize_url,
    display_name,
    exchange_code,
    fetch_identity,
    issue_token,
    make_state,
    verify_state,
)
from ..deps import CurrentUser, DbSession

log = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/login", summary="Begin Discord OAuth2 login")
async def login(app: str = Query("backoffice")) -> RedirectResponse:
    settings = get_settings()
    if not settings.oauth_enabled:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "OAuth is not configured — set DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET",
        )
    return RedirectResponse(authorize_url(make_state(app)))


@router.get("/callback", summary="OAuth2 redirect target")
async def callback(session: DbSession, code: str = Query(...), state: str = Query(...)):
    settings = get_settings()
    app = verify_state(state)
    if app is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Login state expired or invalid")
    back = settings.frontend_url

    access_token = await exchange_code(code)
    user, role_ids, _in_guild, nick = await fetch_identity(access_token)

    # OAuth gives role IDs; the config names roles. Resolve via the live guild
    # so admins can rename roles without editing environment variables.
    from ...discord_bot.bot import bot

    level = None
    guild = bot.get_guild(settings.guild_id)
    if guild is not None:
        names = [role.name for rid in role_ids if (role := guild.get_role(int(rid)))]
        level = access_level(names, is_owner=guild.owner_id == int(user["id"]))
    else:
        log.warning("guild %s not in cache; cannot verify roles", settings.guild_id)
    is_admin = level == "admin"

    discord_id = int(user["id"])
    row = await session.scalar(select(AppUser).where(AppUser.discord_id == discord_id))
    if row is None:
        row = AppUser(discord_id=discord_id)
        session.add(row)
    row.username = display_name(user, nick)   # server nickname wins
    row.avatar = user.get("avatar")
    row.is_admin = is_admin       # refreshed from live roles on every login
    row.last_login_at = datetime.now(UTC)
    await session.commit()

    # The site admits members only. The admin pages and every write that needs
    # one check the token's is_admin on top of that.
    if level is None:
        # Bounce back with a reason rather than handing out a useless token.
        return RedirectResponse(f"{back}/#" + urlencode({"error": "not_authorised"}))

    token = issue_token(
        discord_id=discord_id, username=row.username or "?", is_admin=is_admin
    )
    # Fragment, not query string: it never reaches a server log or a Referer header.
    return RedirectResponse(f"{back}/#" + urlencode({"token": token}))


@router.get("/me", response_model=MeOut, summary="Who am I")
async def me(user: CurrentUser) -> MeOut:
    # The token carries the name minted at login. Resolving it again here means
    # a nickname change appears on the next page load, not in twelve hours.
    return MeOut(
        discord_id=user.discord_id,
        username=guild_display_name(user.discord_id, user.username) or user.username,
        is_admin=user.is_admin,
    )
