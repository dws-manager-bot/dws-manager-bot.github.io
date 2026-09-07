"""Shared FastAPI dependencies."""
from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import AuditLog
from ..schemas import MeOut
from ..security import decode_token

bearer = HTTPBearer(auto_error=False)

DbSession = Annotated[AsyncSession, Depends(get_session)]


async def current_user(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> MeOut:
    if creds is None:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Not signed in",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_token(creds.credentials)
    return MeOut(
        discord_id=int(payload["sub"]),
        username=payload.get("name", "unknown"),
        is_admin=bool(payload.get("adm")),
    )


async def require_admin(
    user: Annotated[MeOut, Depends(current_user)],
) -> MeOut:
    if not user.is_admin:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "This action needs an alliance admin role"
        )
    return user


CurrentUser = Annotated[MeOut, Depends(current_user)]
AdminUser = Annotated[MeOut, Depends(require_admin)]


async def write_audit(
    session: AsyncSession,
    user: MeOut,
    action: str,
    entity: str | None = None,
    entity_id: str | int | None = None,
    detail: dict | None = None,
) -> None:
    session.add(
        AuditLog(
            actor_discord_id=user.discord_id,
            actor_name=user.username,
            action=action,
            entity=entity,
            entity_id=str(entity_id) if entity_id is not None else None,
            detail=detail,
        )
    )
