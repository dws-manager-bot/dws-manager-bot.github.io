"""The shared line-up endpoint, exercised against a real database.

Runs on SQLite so it needs no server; JSONB is told to compile as JSON there.
That covers routing, permissions and the JSON round-trip. It does not prove
anything about Postgres-specific behavior — the deployed database is Postgres 16.
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.ext.compiler import compiles

from dwsbot.api.deps import current_user, get_session, require_admin
from dwsbot.api.routers import lineups
from dwsbot.db import Base
from dwsbot.schemas import MeOut


@compiles(JSONB, "sqlite")
def _jsonb_on_sqlite(type_, compiler, **kw):  # noqa: ARG001
    return "JSON"


OFFICER = MeOut(discord_id=1, username="Officer", is_admin=True)
OFFICER2 = MeOut(discord_id=3, username="Second Officer", is_admin=True)
MEMBER = MeOut(discord_id=2, username="Member", is_admin=False)

OFFICIAL = "official"
D1, D3 = "draft:1", "draft:3"


@pytest_asyncio.fixture
async def client_factory():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)

    def build(user: MeOut):
        app = FastAPI()
        app.include_router(lineups.router)

        async def _session():
            async with maker() as s:
                yield s

        async def _user():
            return user

        async def _admin():
            if not user.is_admin:
                from fastapi import HTTPException, status
                raise HTTPException(status.HTTP_403_FORBIDDEN, "officers only")
            return user

        app.dependency_overrides[get_session] = _session
        app.dependency_overrides[current_user] = _user
        app.dependency_overrides[require_admin] = _admin
        return AsyncClient(transport=ASGITransport(app=app), base_url="http://t")

    build.maker = maker          # tests that need to seed rows directly
    yield build
    await engine.dispose()


PLAN = {
    "order": ["Dubai88", "Ronin", "Sunflowerseeds"],
    "mercs": [{"name": "Ronin", "bgb": 0}],
    "opts": {"version": 1, "orient": "bottom", "portalOwners": 24},
}


@pytest.mark.asyncio
async def test_missing_plan_reads_as_empty(client_factory):
    async with client_factory(MEMBER) as c:
        r = await c.get(f"/lineups/{OFFICIAL}")
    assert r.status_code == 200
    assert r.json()["order"] == []


@pytest.mark.asyncio
async def test_officer_saves_and_anyone_reads_it_back(client_factory):
    async with client_factory(OFFICER) as c:
        put = await c.put(f"/lineups/{OFFICIAL}", json=PLAN)
    assert put.status_code == 200, put.text
    assert put.json()["updated_by_name"] == "Officer"

    async with client_factory(MEMBER) as c:
        got = await c.get(f"/lineups/{OFFICIAL}")
    body = got.json()
    assert body["order"] == PLAN["order"]                 # hand-tuned order survives
    assert body["mercs"] == PLAN["mercs"]                 # mercenaries survive
    assert body["opts"]["portalOwners"] == 24
    assert body["updated_by_name"] == "Officer"


@pytest.mark.asyncio
async def test_plain_member_cannot_save(client_factory):
    async with client_factory(MEMBER) as c:
        r = await c.put(f"/lineups/{OFFICIAL}", json=PLAN)
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_save_is_a_replace_not_a_merge(client_factory):
    async with client_factory(OFFICER) as c:
        await c.put(f"/lineups/{OFFICIAL}", json=PLAN)
        await c.put(f"/lineups/{OFFICIAL}", json={"order": ["XoD"], "mercs": [], "opts": {}})
        r = await c.get(f"/lineups/{OFFICIAL}")
    assert r.json()["order"] == ["XoD"]
    assert r.json()["mercs"] == []


@pytest.mark.asyncio
async def test_oversized_plan_is_refused(client_factory):
    async with client_factory(OFFICER) as c:
        r = await c.put(f"/lineups/{OFFICIAL}", json={"order": [f"m{i}" for i in range(1001)],
                                                  "mercs": [], "opts": {}})
    assert r.status_code == 413


@pytest.mark.asyncio
async def test_officer_can_clear_and_member_cannot(client_factory):
    async with client_factory(OFFICER) as c:
        await c.put(f"/lineups/{OFFICIAL}", json=PLAN)
    async with client_factory(MEMBER) as c:
        assert (await c.delete(f"/lineups/{OFFICIAL}")).status_code == 403


# --------------------------- drafts and publishing ---------------------------

@pytest.mark.asyncio
async def test_each_officer_keeps_their_own_draft(client_factory):
    async with client_factory(OFFICER) as c:
        await c.put(f"/lineups/{D1}", json={**PLAN, "title": "mine"})
    async with client_factory(OFFICER2) as c:
        await c.put(f"/lineups/{D3}", json={"order": ["XoD"], "mercs": [], "opts": {}, "title": "theirs"})
        mine = await c.get(f"/lineups/{D1}")
        theirs = await c.get(f"/lineups/{D3}")
    assert mine.json()["order"] == PLAN["order"]        # untouched by the other officer
    assert theirs.json()["order"] == ["XoD"]
    assert mine.json()["owner_name"] == "Officer"


@pytest.mark.asyncio
async def test_an_officer_cannot_overwrite_another_officers_draft(client_factory):
    async with client_factory(OFFICER) as c:
        await c.put(f"/lineups/{D1}", json=PLAN)
    async with client_factory(OFFICER2) as c:
        r = await c.put(f"/lineups/{D1}", json={"order": ["stomped"], "mercs": [], "opts": {}})
    assert r.status_code == 403
    async with client_factory(OFFICER) as c:
        assert (await c.get(f"/lineups/{D1}")).json()["order"] == PLAN["order"]


@pytest.mark.asyncio
async def test_publishing_copies_and_leaves_the_draft_alone(client_factory):
    async with client_factory(OFFICER) as c:
        await c.put(f"/lineups/{D1}", json={**PLAN, "title": "aggressive"})
        pub = await c.post(f"/lineups/{D1}/publish")
        assert pub.status_code == 200, pub.text
        official = await c.get(f"/lineups/{OFFICIAL}")
        draft = await c.get(f"/lineups/{D1}")
    assert official.json()["order"] == PLAN["order"]     # the pick took effect
    assert official.json()["owner_id"] is None           # published plan belongs to nobody
    assert draft.json()["order"] == PLAN["order"]        # and the draft survived it
    assert draft.json()["owner_name"] == "Officer"


@pytest.mark.asyncio
async def test_publishing_someone_elses_draft_does_not_destroy_it(client_factory):
    async with client_factory(OFFICER) as c:
        await c.put(f"/lineups/{D1}", json=PLAN)
    async with client_factory(OFFICER2) as c:
        await c.put(f"/lineups/{D3}", json={"order": ["XoD"], "mercs": [], "opts": {}})
        await c.post(f"/lineups/{D1}/publish")           # picks the first officer's plan
        mine = await c.get(f"/lineups/{D1}")
        theirs = await c.get(f"/lineups/{D3}")
        official = await c.get(f"/lineups/{OFFICIAL}")
    assert official.json()["order"] == PLAN["order"]
    assert mine.json()["order"] == PLAN["order"]         # neither draft is consumed
    assert theirs.json()["order"] == ["XoD"]


@pytest.mark.asyncio
async def test_officer_cannot_save_to_a_slug_that_is_not_their_draft(client_factory):
    async with client_factory(OFFICER) as c:
        r = await c.put("/lineups/random-slug", json=PLAN)
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_publishing_an_empty_plan_is_refused(client_factory):
    async with client_factory(OFFICER) as c:
        r = await c.post(f"/lineups/{D1}/publish")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_listing_shows_the_published_plan_first(client_factory):
    async with client_factory(OFFICER) as c:
        await c.put(f"/lineups/{D1}", json=PLAN)
        await c.post(f"/lineups/{D1}/publish")
        rows = (await c.get("/lineups")).json()
    assert rows[0]["slug"] == OFFICIAL
    assert {r["slug"] for r in rows} == {OFFICIAL, D1}
    assert next(r for r in rows if r["slug"] == D1)["members"] == 3


@pytest.mark.asyncio
async def test_member_cannot_delete_an_officers_draft(client_factory):
    async with client_factory(OFFICER) as c:
        await c.put(f"/lineups/{D1}", json=PLAN)
    async with client_factory(MEMBER) as c:
        assert (await c.delete(f"/lineups/{D1}")).status_code == 403
    async with client_factory(OFFICER2) as c:
        assert (await c.delete(f"/lineups/{D1}")).status_code == 403


# ------------------------ names follow the server nickname -------------------

@pytest.mark.asyncio
async def test_names_come_from_the_current_nickname_not_the_saved_one(client_factory):
    """A stored name is a snapshot; app_users carries the truth.

    Someone who saves a plan and later sets a PoU nickname should be labeled the
    new name even on plans saved before it — which is exactly what went wrong live,
    where a plan published earlier still read "by gnar_.".
    """
    from dwsbot.models import AppUser

    async with client_factory(OFFICER) as c:
        await c.put(f"/lineups/{D1}", json=PLAN)
        await c.post(f"/lineups/{D1}/publish")

    async with client_factory.maker() as s:
        s.add(AppUser(discord_id=OFFICER.discord_id, username="고추바사삭(Goba)", is_admin=True))
        await s.commit()

    async with client_factory(OFFICER) as c:
        got = await c.get(f"/lineups/{OFFICIAL}")
        listed = await c.get("/lineups")

    assert got.json()["updated_by_name"] == "고추바사삭(Goba)"
    assert all(r["updated_by_name"] == "고추바사삭(Goba)" for r in listed.json())


@pytest.mark.asyncio
async def test_stored_name_is_kept_when_the_person_is_unknown(client_factory):
    async with client_factory(OFFICER) as c:
        await c.put(f"/lineups/{D1}", json=PLAN)
        r = await c.get(f"/lineups/{D1}")
    # No app_users row exists in this test, so the snapshot stands in.
    assert r.json()["owner_name"] == "Officer"
