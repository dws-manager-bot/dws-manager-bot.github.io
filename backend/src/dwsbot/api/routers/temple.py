"""Temple Strife plans: per-admin drafts plus one official plan.

The same shape as the Pass War line-ups: every admin keeps a draft nobody else
can overwrite, and publishing copies a draft into "official" without touching
the draft. Admins only, reading included — members are not shown these plans.
"""
from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from ...models import TemplePlan
from ...schemas import TemplePlanIn, TemplePlanOut, TemplePlanSummary
from ..deps import AdminUser, DbSession, write_audit
from .lineups import _names

router = APIRouter(prefix="/temple-plans", tags=["temple"])

OFFICIAL = "official"
DRAFT_PREFIX = "draft:"
# A full plan for a hundred members is about 20 KB; this leaves room and no more.
MAX_BYTES = 256_000


def draft_slug(discord_id: int) -> str:
    return f"{DRAFT_PREFIX}{discord_id}"


def _shelters(plan: dict | None) -> int:
    placed = (plan or {}).get("placed")
    return len(placed) if isinstance(placed, list) else 0


def _out(row: TemplePlan, names: dict[int, str]) -> TemplePlanOut:
    return TemplePlanOut(
        slug=row.slug,
        plan=row.plan or {},
        title=row.title,
        owner_id=row.owner_id,
        owner_name=names.get(row.owner_id) or row.owner_name,
        updated_by_name=names.get(row.updated_by_id) or row.updated_by_name,
        updated_at=row.updated_at,
    )


@router.get("", response_model=list[TemplePlanSummary], summary="List the official plan and every draft")
async def list_plans(session: DbSession, _: AdminUser) -> list[TemplePlanSummary]:
    rows = (await session.scalars(select(TemplePlan))).all()
    names = await _names(session, *[r.owner_id for r in rows], *[r.updated_by_id for r in rows])
    out = [
        TemplePlanSummary(
            slug=r.slug, title=r.title, owner_id=r.owner_id,
            owner_name=names.get(r.owner_id) or r.owner_name,
            updated_by_name=names.get(r.updated_by_id) or r.updated_by_name,
            updated_at=r.updated_at, shelters=_shelters(r.plan),
        )
        for r in rows
    ]
    out.sort(key=lambda r: (r.slug != OFFICIAL, -(r.updated_at.timestamp() if r.updated_at else 0)))
    return out


@router.get("/{slug}", response_model=TemplePlanOut, summary="Read one plan")
async def get_plan(slug: str, session: DbSession, _: AdminUser) -> TemplePlanOut:
    row = await session.get(TemplePlan, slug) or TemplePlan(slug=slug, plan={})
    return _out(row, await _names(session, row.owner_id, row.updated_by_id))


@router.put("/{slug}", response_model=TemplePlanOut, summary="Save your own draft")
async def put_plan(slug: str, payload: TemplePlanIn, session: DbSession, user: AdminUser) -> TemplePlanOut:
    if slug != draft_slug(user.discord_id):
        # The official plan changes only by publishing a draft.
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Save to your own draft")
    if len(json.dumps(payload.plan)) > MAX_BYTES:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "Plan is too large")

    row = await session.get(TemplePlan, slug)
    if row is None:
        row = TemplePlan(slug=slug)
        session.add(row)
    row.plan = payload.plan
    row.title = payload.title
    row.owner_id = user.discord_id
    row.owner_name = user.username
    row.updated_by_id = user.discord_id
    row.updated_by_name = user.username
    await write_audit(session, user, "temple_plan.save", "temple_plan", slug,
                      {"shelters": _shelters(payload.plan)})
    await session.commit()
    await session.refresh(row)
    return _out(row, await _names(session, row.owner_id, row.updated_by_id))


@router.post("/{slug}/publish", response_model=TemplePlanOut, summary="Make a draft the official plan")
async def publish(slug: str, session: DbSession, user: AdminUser) -> TemplePlanOut:
    if slug == OFFICIAL:
        raise HTTPException(status.HTTP_409_CONFLICT, "That is already the official plan")
    src = await session.get(TemplePlan, slug)
    if src is None or not src.plan:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That plan is empty or does not exist")

    official = await session.get(TemplePlan, OFFICIAL)
    if official is None:
        official = TemplePlan(slug=OFFICIAL)
        session.add(official)
    official.plan = dict(src.plan)
    official.title = src.title
    official.owner_id = None
    official.owner_name = None
    official.updated_by_id = user.discord_id
    official.updated_by_name = user.username
    await write_audit(session, user, "temple_plan.publish", "temple_plan", OFFICIAL, {"from": slug})
    await session.commit()
    await session.refresh(official)
    return _out(official, await _names(session, official.owner_id, official.updated_by_id))


@router.delete("/{slug}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete your draft")
async def delete_plan(slug: str, session: DbSession, user: AdminUser) -> None:
    if slug != draft_slug(user.discord_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only your own draft can be deleted")
    row = await session.get(TemplePlan, slug)
    if row is None:
        return
    await session.delete(row)
    await write_audit(session, user, "temple_plan.delete", "temple_plan", slug)
    await session.commit()
