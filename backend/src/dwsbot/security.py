"""Backoffice authentication.

The frontend is a static bundle on GitHub Pages, so it can hold no client
secret and no bot token. Login therefore runs entirely server-side: Discord
redirects back to *this* API, the API exchanges the code, verifies the user
holds a member or admin role in the alliance guild, and only then mints a
short-lived JWT for the SPA to carry.
"""
from __future__ import annotations

import hmac
import logging
import secrets
import time
from datetime import UTC, datetime, timedelta

import httpx
import jwt
from fastapi import HTTPException, status

from .config import get_settings

log = logging.getLogger(__name__)

DISCORD_API = "https://discord.com/api/v10"
_ALGORITHM = "HS256"


# --------------------------------------------------------------------- state

APPS = ("backoffice", "passwar")


def make_state(app: str = "backoffice") -> str:
    """A CSRF state token that needs no server-side session store.

    It also carries which frontend started the login, so one registered Discord
    redirect URI can serve several apps -- adding a new one needs no change in
    the Discord developer portal.
    """
    settings = get_settings()
    app = app if app in APPS else "backoffice"
    nonce = secrets.token_urlsafe(16)
    issued = str(int(time.time()))
    sig = hmac.new(
        settings.jwt_secret.encode(), f"{nonce}.{app}.{issued}".encode(), "sha256"
    ).hexdigest()[:32]
    return f"{nonce}.{app}.{issued}.{sig}"


def verify_state(state: str, max_age_seconds: int = 600) -> str | None:
    """Return the app the login began from, or None if the state is bad or stale."""
    settings = get_settings()
    try:
        nonce, app, issued, sig = state.split(".")
    except ValueError:
        return None
    expected = hmac.new(
        settings.jwt_secret.encode(), f"{nonce}.{app}.{issued}".encode(), "sha256"
    ).hexdigest()[:32]
    if not hmac.compare_digest(sig, expected):
        return None
    if (time.time() - int(issued)) > max_age_seconds:
        return None
    return app if app in APPS else "backoffice"


# --------------------------------------------------------------------- oauth

def authorize_url(state: str) -> str:
    settings = get_settings()
    from urllib.parse import urlencode

    query = urlencode(
        {
            "client_id": settings.discord_client_id,
            "redirect_uri": settings.oauth_redirect_uri,
            "response_type": "code",
            # guilds.members.read lets us read the caller's roles in the alliance
            # guild without the bot needing to have cached them.
            "scope": "identify guilds.members.read",
            "state": state,
            "prompt": "none",
        }
    )
    return f"https://discord.com/oauth2/authorize?{query}"


async def exchange_code(code: str) -> str:
    settings = get_settings()
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"{DISCORD_API}/oauth2/token",
            data={
                "client_id": settings.discord_client_id,
                "client_secret": settings.discord_client_secret,
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": settings.oauth_redirect_uri,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    if resp.status_code != 200:
        log.warning("token exchange failed: %s %s", resp.status_code, resp.text[:200])
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Discord rejected the login code")
    return resp.json()["access_token"]


def display_name(user: dict, nick: str | None) -> str:
    """What to call someone, most alliance-specific first.

    Members set their server nickname to their in-game name, so it identifies a
    line-up's owner far better than a Discord account name does. Falls back to the
    account's display name, then to the raw username.
    """
    for candidate in (nick, user.get("global_name"), user.get("username")):
        if candidate and str(candidate).strip():
            return str(candidate).strip()
    return "unknown"


async def fetch_identity(access_token: str) -> tuple[dict, list[str], bool, str | None]:
    """Return the Discord user, their role IDs in the alliance guild, whether they
    are in that guild at all, and their nickname there.

    A member with no roles and a non-member both yield an empty role list, so
    membership is reported separately.
    """
    settings = get_settings()
    headers = {"Authorization": f"Bearer {access_token}"}
    async with httpx.AsyncClient(timeout=15) as client:
        user_resp = await client.get(f"{DISCORD_API}/users/@me", headers=headers)
        if user_resp.status_code != 200:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Could not read Discord profile")
        user = user_resp.json()

        member_resp = await client.get(
            f"{DISCORD_API}/users/@me/guilds/{settings.guild_id}/member", headers=headers
        )
        if member_resp.status_code != 200:
            # Not in the alliance server at all.
            return user, [], False, None
        member = member_resp.json()
        return user, member.get("roles", []), True, member.get("nick")


# ----------------------------------------------------------------------- jwt

def issue_token(*, discord_id: int, username: str, is_admin: bool) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    payload = {
        "sub": str(discord_id),
        "name": username,
        # Only members are issued a token. The claim marks one minted under that
        # rule; tokens from before it admitted any guild member, Guests included.
        "mem": True,
        "adm": is_admin,
        "iat": now,
        "exp": now + timedelta(hours=settings.jwt_ttl_hours),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=_ALGORITHM)


def decode_token(token: str) -> dict:
    settings = get_settings()
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Session expired — sign in again"
        ) from None
    except jwt.InvalidTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid session token") from None
