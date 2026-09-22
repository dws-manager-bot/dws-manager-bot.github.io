"""The players endpoint, exercised against a real database.

Runs on SQLite so it needs no server, like the line-up tests. What matters here
is the name history: a rename keeps the old name, a spelling fix replaces it,
and someone who leaves is kept rather than erased.
"""
from __future__ import annotations

from datetime import date

import pytest
import pytest_asyncio
from fastapi import FastAPI, HTTPException, status
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.ext.compiler import compiles

from dwsbot.api.deps import current_user, get_session, require_admin
from dwsbot.api.routers import players
from dwsbot.db import Base
from dwsbot.models import AuditLog, Player
from dwsbot.schemas import MeOut


@compiles(JSONB, "sqlite")
def _jsonb_on_sqlite(type_, compiler, **kw):  # noqa: ARG001
    return "JSON"


ADMIN = MeOut(discord_id=1, username="Admin", is_admin=True)
MEMBER = MeOut(discord_id=2, username="Member", is_admin=False)
DAY1, DAY2 = date(2026, 9, 9), date(2026, 9, 23)


@pytest_asyncio.fixture
async def client_factory(monkeypatch):
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    monkeypatch.setattr(players, "_today", lambda: DAY1)

    def build(user: MeOut):
        app = FastAPI()
        app.include_router(players.router)

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

    build.maker = maker
    yield build
    await engine.dispose()


async def _add(c, name="Dubai88", **extra):
    r = await c.post("/players", json={"name": name, **extra})
    assert r.status_code == 201, r.text
    return r.json()


def _history(player):
    return [(n["name"], n["first_seen"], n["last_seen"]) for n in player["names"]]


@pytest.mark.asyncio
async def test_only_admins_may_read(client_factory):
    async with client_factory(MEMBER) as c:
        assert (await c.get("/players")).status_code == 403


@pytest.mark.asyncio
async def test_a_new_player_gets_an_id_and_starts_a_history(client_factory):
    async with client_factory(ADMIN) as c:
        p = await _add(c, "  Dubai88 ", bgb_cp=278_997_886, total_cp=1_618_239_833, rank=4)
    assert p["name"] == "Dubai88"          # stripped, so no second spelling
    assert len(p["id"]) == 36 and p["active"] is True
    assert p["total_cp"] == 1_618_239_833  # past int4
    assert _history(p) == [("Dubai88", "2026-09-09", "2026-09-09")]


@pytest.mark.asyncio
async def test_two_current_members_cannot_share_a_name(client_factory):
    async with client_factory(ADMIN) as c:
        p = await _add(c, "Sandy")
        assert (await c.post("/players", json={"name": "Sandy"})).status_code == 409
        # Once the first Sandy has left, the name is free for someone else.
        await c.patch(f"/players/{p['id']}", json={"active": False})
        await _add(c, "Sandy")


@pytest.mark.asyncio
async def test_a_rename_keeps_the_old_name(client_factory, monkeypatch):
    async with client_factory(ADMIN) as c:
        p = await _add(c, "Hostile Crisis")
        monkeypatch.setattr(players, "_today", lambda: DAY2)
        r = await c.patch(
            f"/players/{p['id']}", json={"name": "Unhinged Crisis", "name_change": "rename"}
        )
    assert r.status_code == 200, r.text
    assert r.json()["name"] == "Unhinged Crisis"
    assert _history(r.json()) == [
        ("Hostile Crisis", "2026-09-09", "2026-09-09"),
        ("Unhinged Crisis", "2026-09-23", "2026-09-23"),
    ]


@pytest.mark.asyncio
async def test_a_spelling_fix_replaces_the_misread(client_factory):
    async with client_factory(ADMIN) as c:
        p = await _add(c, "ƏYamƐ")
        r = await c.patch(f"/players/{p['id']}", json={"name": "ǝYamɐ", "name_change": "correct"})
    assert r.status_code == 200, r.text
    assert _history(r.json()) == [("ǝYamɐ", "2026-09-09", "2026-09-09")]


@pytest.mark.asyncio
async def test_renaming_back_reuses_the_earlier_name(client_factory, monkeypatch):
    async with client_factory(ADMIN) as c:
        p = await _add(c, "Cedy Nesli")
        await c.patch(f"/players/{p['id']}", json={"name": "X CEDY", "name_change": "rename"})
        monkeypatch.setattr(players, "_today", lambda: DAY2)
        r = await c.patch(
            f"/players/{p['id']}", json={"name": "Cedy Nesli", "name_change": "rename"}
        )
        assert r.status_code == 200, r.text
        assert sorted(_history(r.json())) == [
            ("Cedy Nesli", "2026-09-09", "2026-09-23"),
            ("X CEDY", "2026-09-09", "2026-09-09"),
        ]
        # A spelling fix cannot land on an earlier name: that would lose one.
        r = await c.patch(f"/players/{p['id']}", json={"name": "X CEDY", "name_change": "correct"})
        assert r.status_code == 409


@pytest.mark.asyncio
async def test_a_new_name_must_say_what_it_is(client_factory):
    async with client_factory(ADMIN) as c:
        p = await _add(c, "Armikoo")
        r = await c.patch(f"/players/{p['id']}", json={"name": "JAÍNA"})
        assert r.status_code == 422
        # The same name back is not a change, so it needs no kind.
        r = await c.patch(f"/players/{p['id']}", json={"name": "Armikoo", "rank": 3})
        assert r.status_code == 200 and r.json()["rank"] == 3


@pytest.mark.asyncio
async def test_leaving_keeps_the_player_and_is_recorded(client_factory):
    async with client_factory(ADMIN) as c:
        p = await _add(c, "Stinkycät")
        r = await c.patch(f"/players/{p['id']}", json={"active": False})
        assert r.json()["active"] is False
        listed = (await c.get("/players")).json()
    assert [x["name"] for x in listed] == ["Stinkycät"]
    async with client_factory.maker() as s:
        actions = [a.action for a in await s.scalars(select(AuditLog).order_by(AuditLog.id))]
    assert actions == ["player.create", "player.left"]


@pytest.mark.asyncio
async def test_delete_erases_a_mistake(client_factory):
    async with client_factory(ADMIN) as c:
        p = await _add(c, "Typo McTypo")
        assert (await c.delete(f"/players/{p['id']}")).status_code == 204
        assert (await c.get("/players")).json() == []
        assert (await c.delete(f"/players/{p['id']}")).status_code == 404


@pytest.mark.asyncio
async def test_a_stored_row_outside_the_input_rules_still_reads(client_factory):
    """The rules are for new input. A row put in by hand must never 500 the list."""
    async with client_factory.maker() as s:
        s.add(Player(name="Imported", rank=9, industry_level=0, bgb_cp=-1))
        await s.commit()
    async with client_factory(ADMIN) as c:
        r = await c.get("/players")
    assert r.status_code == 200 and r.json()[0]["rank"] == 9


@pytest.mark.asyncio
async def test_a_save_that_changes_nothing_records_nothing(client_factory):
    async with client_factory(ADMIN) as c:
        p = await _add(c, "XoD", rank=4)
        r = await c.patch(f"/players/{p['id']}", json={"rank": 4, "notes": None})
        assert r.status_code == 200
        await c.patch(f"/players/{p['id']}", json={"rank": 5, "bgb_cp": None})
    async with client_factory.maker() as s:
        rows = list(await s.scalars(select(AuditLog).order_by(AuditLog.id)))
    assert [(a.action, (a.detail or {}).get("fields")) for a in rows] == [
        ("player.create", None),
        ("player.update", ["rank"]),
    ]
