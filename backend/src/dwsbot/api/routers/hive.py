"""The hive map members see.

An admin draws the formation from the member table in their browser and applies
it, which uploads the picture. Members get that picture and its caption, nothing
else: the CP, group and flag behind it never leave the admin endpoints.
"""
from __future__ import annotations

import json
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, Response, UploadFile, status
from sqlalchemy import delete, select

from ...models import HiveMap
from ...schemas import HiveMapOut
from ..deps import AdminUser, CurrentUser, DbSession, write_audit

router = APIRouter(prefix="/hive", tags=["hive"])

PNG = b"\x89PNG\r\n\x1a\n"
MAX_BYTES = 6 * 1024 * 1024
KEEP = 10     # applied maps kept: the latest is shown, the rest are a way back


async def _latest(session) -> HiveMap:
    row = await session.scalar(select(HiveMap).order_by(HiveMap.id.desc()).limit(1))
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No hive map has been applied yet")
    return row


@router.get("/applied", response_model=HiveMapOut, summary="When the map was applied, and with what")
async def applied(session: DbSession, _: CurrentUser):
    return await _latest(session)


@router.get("/applied/image", summary="The applied map, as a PNG",
            responses={200: {"content": {"image/png": {}}}})
async def applied_image(session: DbSession, _: CurrentUser):
    row = await _latest(session)
    return Response(row.png, media_type="image/png", headers={"Cache-Control": "private, no-cache"})


@router.post("/applied", response_model=HiveMapOut, status_code=status.HTTP_201_CREATED,
             summary="Make this drawing the map members see")
async def apply(
    session: DbSession,
    user: AdminUser,
    image: Annotated[UploadFile, File()],
    shelters: Annotated[int, Form(ge=1, le=300)],
    options: Annotated[str, Form()] = "{}",
):
    png = await image.read(MAX_BYTES + 1)
    if len(png) > MAX_BYTES:
        raise HTTPException(413, "The picture is too large")
    if not png.startswith(PNG):
        raise HTTPException(422, "That is not a PNG picture")
    try:
        opts = json.loads(options)
    except ValueError:
        opts = None
    if not isinstance(opts, dict):
        raise HTTPException(422, "The options are not a JSON object")

    row = HiveMap(
        png=png, shelters=shelters, options=opts,
        applied_by_id=user.discord_id, applied_by_name=user.username,
    )
    session.add(row)
    await session.flush()
    await session.execute(
        delete(HiveMap).where(
            HiveMap.id.in_(select(HiveMap.id).order_by(HiveMap.id.desc()).offset(KEEP))
        )
    )
    await write_audit(session, user, "hive.apply", "hive_map", row.id, {"shelters": shelters})
    await session.commit()
    await session.refresh(row)
    return row
