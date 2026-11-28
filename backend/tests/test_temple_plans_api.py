"""Temple Strife plans: drafts per admin, one official plan, admins only.

Runs on SQLite like the line-up tests; JSONB compiles as JSON there.
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from fastapi import FastAPI, HTTPException, status
from httpx import ASGITransport, AsyncClient
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.ext.compiler import compiles

from dwsbot.api.deps import current_user, get_session, require_admin
from dwsbot.api.routers import temple
from dwsbot.db import Base
from dwsbot.schemas import MeOut


@compiles(JSONB, "sqlite")
def _jsonb_on_sqlite(type_, compiler, **kw):  # noqa: ARG001
    return "JSON"


ADMIN = MeOut(discord_id=1, username="Admin", is_admin=True)
ADMIN2 = MeOut(discord_id=3, username="Second Admin", is_admin=True)
MEMBER = MeOut(discord_id=2, username="Member", is_admin=False)

PLAN = {
    "margin": 15,
    "placed": [{"key": "p1", "name": "Anya", "x": 424, "y": 911}, {"key": "p2", "name": "Dubai88", "x": 421, "y": 911}],
    "groups": {"temple": [], "t1": [], "t2": ["p1", "p2"]},
    "anchors": {"t2": "p1"},
    "votes": {"p1": 1, "p2": 2},
    "options": ["Available from 10 ST", "Available from 12 ST", "Late", "Can't participate"],
    "fillBy": "bgb",
}


@pytest_asyncio.fixture
async def client_factory():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)

    def build(user: MeOut):
        app = FastAPI()
        app.include_router(temple.router)

        async def _session():
            async with maker() as s:
                yield s

        async def _user():
            return user

        async def _admin():
            if not user.is_admin:
                raise HTTPException(status.HTTP_403_FORBIDDEN, "admins only")
            return user

        app.dependency_overrides[get_session] = _session
        app.dependency_overrides[current_user] = _user
        app.dependency_overrides[require_admin] = _admin
        return AsyncClient(transport=ASGITransport(app=app), base_url="http://t")

    yield build
    await engine.dispose()


@pytest.mark.asyncio
async def test_missing_plan_reads_as_empty(client_factory):
    async with client_factory(ADMIN) as c:
        r = await c.get("/temple-plans/official")
    assert r.status_code == 200
    assert r.json()["plan"] == {}


@pytest.mark.asyncio
async def test_draft_round_trips_whole(client_factory):
    async with client_factory(ADMIN) as c:
        put = await c.put("/temple-plans/draft:1", json={"plan": PLAN})
        assert put.status_code == 200, put.text
        got = (await c.get("/temple-plans/draft:1")).json()
    assert got["plan"] == PLAN
    assert got["owner_name"] == "Admin"


@pytest.mark.asyncio
async def test_only_your_own_draft_can_be_saved(client_factory):
    async with client_factory(ADMIN) as c:
        await c.put("/temple-plans/draft:1", json={"plan": PLAN})
    async with client_factory(ADMIN2) as c:
        assert (await c.put("/temple-plans/draft:1", json={"plan": {}})).status_code == 403
        assert (await c.put("/temple-plans/official", json={"plan": PLAN})).status_code == 403
        # but every admin can read every draft
        assert (await c.get("/temple-plans/draft:1")).json()["plan"] == PLAN


@pytest.mark.asyncio
async def test_publishing_copies_the_draft_and_keeps_it(client_factory):
    async with client_factory(ADMIN) as c:
        await c.put("/temple-plans/draft:1", json={"plan": PLAN})
    async with client_factory(ADMIN2) as c:
        pub = await c.post("/temple-plans/draft:1/publish")
        assert pub.status_code == 200, pub.text
        assert pub.json()["updated_by_name"] == "Second Admin"
        official = (await c.get("/temple-plans/official")).json()
        listing = (await c.get("/temple-plans")).json()
    assert official["plan"] == PLAN
    assert official["owner_id"] is None
    assert [r["slug"] for r in listing] == ["official", "draft:1"]
    assert listing[1]["shelters"] == 2
    async with client_factory(ADMIN) as c:
        assert (await c.get("/temple-plans/draft:1")).json()["plan"] == PLAN


@pytest.mark.asyncio
async def test_an_empty_draft_cannot_be_published(client_factory):
    async with client_factory(ADMIN) as c:
        assert (await c.post("/temple-plans/draft:1/publish")).status_code == 404
        assert (await c.post("/temple-plans/official/publish")).status_code == 409


@pytest.mark.asyncio
async def test_members_cannot_read_or_write(client_factory):
    async with client_factory(ADMIN) as c:
        await c.put("/temple-plans/draft:1", json={"plan": PLAN})
    async with client_factory(MEMBER) as c:
        assert (await c.get("/temple-plans")).status_code == 403
        assert (await c.get("/temple-plans/official")).status_code == 403
        assert (await c.put("/temple-plans/draft:2", json={"plan": PLAN})).status_code == 403


@pytest.mark.asyncio
async def test_oversized_plan_is_refused(client_factory):
    big = {"placed": [{"key": f"k{i}", "name": "x" * 200, "x": 1, "y": 1} for i in range(2000)]}
    async with client_factory(ADMIN) as c:
        assert (await c.put("/temple-plans/draft:1", json={"plan": big})).status_code == 413


@pytest.mark.asyncio
async def test_deleting_a_draft(client_factory):
    async with client_factory(ADMIN) as c:
        await c.put("/temple-plans/draft:1", json={"plan": PLAN})
    async with client_factory(ADMIN2) as c:
        assert (await c.delete("/temple-plans/draft:1")).status_code == 403
    async with client_factory(ADMIN) as c:
        assert (await c.delete("/temple-plans/draft:1")).status_code == 204
        assert (await c.get("/temple-plans/draft:1")).json()["plan"] == {}
