"""The war planner's endpoints, exercised against a real database.

Runs on SQLite, like the line-up tests: that covers routing, permissions, the
version check and the JSON round-trip. It does not prove anything about
Postgres-specific behavior.
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from fastapi import FastAPI, HTTPException, status
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.ext.compiler import compiles

from dwsbot.api.deps import current_user, get_session, require_admin
from dwsbot.api.routers import warplan
from dwsbot.db import Base
from dwsbot.models import AuditLog, WarHolding
from dwsbot.schemas import MeOut


@compiles(JSONB, "sqlite")
def _jsonb_on_sqlite(type_, compiler, **kw):  # noqa: ARG001
    return "JSON"


ADMIN = MeOut(discord_id=1, username="Goba", is_admin=True)
ADMIN2 = MeOut(discord_id=3, username="Nyx", is_admin=True)
# A real snowflake: past 2**53, where a JSON number would lose precision.
BIG = MeOut(discord_id=1_234_567_890_123_456_789, username="Big", is_admin=True)
MEMBER = MeOut(discord_id=2, username="Member", is_admin=False)


@pytest_asyncio.fixture
async def client_factory():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)

    def build(user: MeOut):
        app = FastAPI()
        app.include_router(warplan.router)

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


def doc(*names, items=None, changes=None):
    return {"scenarios": [
        {"id": f"s{i}", "name": n, "changes": changes or {}, "items": items or []}
        for i, n in enumerate(names or ("Plan A",))
    ]}


async def _alliance(c, name="BOT", color="#2563EB", camp=1, **extra):
    r = await c.post("/war/alliances", json={"name": name, "color": color, "camp": camp, **extra})
    assert r.status_code == 201, r.text
    return r.json()


# ------------------------------------------------------------------ access

@pytest.mark.asyncio
async def test_members_cannot_read_the_strategy(client_factory):
    async with client_factory(MEMBER) as c:
        for path in ("/war/alliances", "/war/board", "/war/days"):
            assert (await c.get(path)).status_code == 403


# --------------------------------------------------------------- alliances

@pytest.mark.asyncio
async def test_alliance_round_trip_normalizes_what_it_stores(client_factory):
    async with client_factory(ADMIN) as c:
        a = await _alliance(c, name="  PoU ", color="#FBBF24", tag="  ", server="413")
        assert (a["name"], a["color"], a["tag"], a["server"]) == ("PoU", "#fbbf24", None, "413")
        assert a["season"] == warplan.SEASON

        r = await c.patch(f"/war/alliances/{a['id']}", json={"tag": "PoU", "camp": 2})
        assert (r.json()["tag"], r.json()["camp"], r.json()["name"]) == ("PoU", 2, "PoU")
        assert [x["name"] for x in (await c.get("/war/alliances")).json()] == ["PoU"]


@pytest.mark.asyncio
async def test_a_taken_name_or_color_says_whose_it_is(client_factory):
    async with client_factory(ADMIN) as c:
        bot = await _alliance(c, "BOT", "#2563eb")
        u4a = await _alliance(c, "U4A", "#16a34a")

        r = await c.post("/war/alliances", json={"name": "bot", "color": "#000000", "camp": 1})
        assert r.status_code == 409 and "BOT" in r.json()["detail"]

        r = await c.post("/war/alliances", json={"name": "XoD", "color": "#2563EB", "camp": 2})
        assert r.status_code == 409 and "BOT" in r.json()["detail"]

        # Moving onto another's color is the same clash; keeping your own is not.
        r = await c.patch(f"/war/alliances/{u4a['id']}", json={"color": "#2563eb"})
        assert r.status_code == 409
        r = await c.patch(f"/war/alliances/{bot['id']}", json={"color": "#2563eb", "name": "BOT"})
        assert r.status_code == 200


@pytest.mark.asyncio
async def test_camp_must_be_one_of_the_two(client_factory):
    async with client_factory(ADMIN) as c:
        r = await c.post("/war/alliances", json={"name": "X", "color": "#123456", "camp": 3})
        assert r.status_code == 422


# ------------------------------------------------------------------- board

@pytest.mark.asyncio
async def test_board_takes_and_releases_territories(client_factory):
    async with client_factory(ADMIN) as c:
        bot = await _alliance(c)
        r = await c.put("/war/board", json={"changes": [
            {"city_id": 219, "alliance_id": bot["id"]},
            {"city_id": 145, "alliance_id": bot["id"]},
        ]})
        assert r.status_code == 200
        assert sorted(h["city_id"] for h in r.json()) == [145, 219]
        assert r.json()[0]["updated_by_name"] == "Goba"

        r = await c.put("/war/board", json={"changes": [{"city_id": 145, "alliance_id": None}]})
        assert [h["city_id"] for h in r.json()] == [219]


@pytest.mark.asyncio
async def test_board_refuses_what_the_map_cannot_draw(client_factory):
    async with client_factory(ADMIN) as c:
        bot = await _alliance(c)
        bad_city = {"changes": [{"city_id": 999, "alliance_id": bot["id"]}]}
        r = await c.put("/war/board", json=bad_city)
        assert r.status_code == 422 and "999" in r.json()["detail"]
        r = await c.put("/war/board", json={"changes": [{"city_id": 219, "alliance_id": 4242}]})
        assert r.status_code == 404
        assert (await c.get("/war/board")).json() == []


@pytest.mark.asyncio
async def test_an_unchanged_territory_is_not_logged(client_factory):
    async with client_factory(ADMIN) as c:
        bot = await _alliance(c)
        change = {"changes": [{"city_id": 219, "alliance_id": bot["id"]}]}
        await c.put("/war/board", json=change)
        await c.put("/war/board", json=change)
    async with client_factory.maker() as s:
        logged = list(await s.scalars(select(AuditLog).where(AuditLog.action == "war.board")))
    assert len(logged) == 1
    assert logged[0].detail["changes"] == [{"city": 219, "from": None, "to": bot["id"]}]


@pytest.mark.asyncio
async def test_removing_an_alliance_releases_what_it_held(client_factory):
    async with client_factory(ADMIN) as c:
        bot = await _alliance(c)
        xod = await _alliance(c, "XoD", "#dc2626", camp=2)
        await c.put("/war/board", json={"changes": [
            {"city_id": 219, "alliance_id": bot["id"]},
            {"city_id": 136, "alliance_id": xod["id"]},
        ]})
        assert (await c.delete(f"/war/alliances/{bot['id']}")).status_code == 204
        assert [h["city_id"] for h in (await c.get("/war/board")).json()] == [136]
    async with client_factory.maker() as s:
        assert len(list(await s.scalars(select(WarHolding)))) == 1


# -------------------------------------------------------------------- days

@pytest.mark.asyncio
async def test_one_war_day_per_date(client_factory):
    async with client_factory(ADMIN) as c:
        r = await c.post("/war/days", json={"day": "2026-10-03", "title": " Strife Pass "})
        assert r.status_code == 201
        made = r.json()
        assert (made["title"], made["plans"], made["official"]) == ("Strife Pass", 0, False)
        assert (await c.post("/war/days", json={"day": "2026-10-03"})).status_code == 409


# ------------------------------------------------------------------- plans

async def _day(c, day="2026-10-03"):
    return (await c.post("/war/days", json={"day": day})).json()["id"]


@pytest.mark.asyncio
async def test_saving_a_draft_bumps_its_version_and_keeps_the_drawings(client_factory):
    pin = {"id": "i1", "type": "pin", "x": 876, "y": 502, "label": "Gate", "color": "#fbbf24"}
    async with client_factory(ADMIN) as c:
        day = await _day(c)
        r = await c.put(f"/war/days/{day}/mine", json={"doc": doc(items=[pin])})
        assert r.status_code == 200
        first = r.json()
        assert (first["version"], first["official"], first["owner_name"]) == (1, False, "Goba")
        # Geometry is the client's business and comes back exactly as sent.
        assert first["doc"]["scenarios"][0]["items"] == [pin]

        r = await c.put(f"/war/days/{day}/mine",
                        json={"doc": doc("Plan A", "Plan B"), "version": 1})
        assert (r.json()["version"], r.json()["scenarios"]) == (2, 2)


@pytest.mark.asyncio
async def test_a_save_over_a_stale_copy_is_refused(client_factory):
    async with client_factory(ADMIN) as c:
        day = await _day(c)
        await c.put(f"/war/days/{day}/mine", json={"doc": doc()})
        await c.put(f"/war/days/{day}/mine", json={"doc": doc("Newer"), "version": 1})

        # A second device still holding version 1.
        r = await c.put(f"/war/days/{day}/mine", json={"doc": doc("Older"), "version": 1})
        assert r.status_code == 409
        # And one that thinks there is no draft yet.
        r = await c.put(f"/war/days/{day}/mine", json={"doc": doc("Blank")})
        assert r.status_code == 409

        plans = (await c.get(f"/war/days/{day}/plans")).json()
        mine = (await c.get(f"/war/plans/{plans[0]['id']}")).json()
        assert mine["doc"]["scenarios"][0]["name"] == "Newer"


@pytest.mark.asyncio
async def test_each_admin_keeps_their_own_draft(client_factory):
    async with client_factory(ADMIN) as c:
        day = await _day(c)
        await c.put(f"/war/days/{day}/mine", json={"doc": doc("Goba's")})
    async with client_factory(ADMIN2) as c:
        # Nyx's save lands in Nyx's draft, not over Goba's.
        await c.put(f"/war/days/{day}/mine", json={"doc": doc("Nyx's")})
        plans = (await c.get(f"/war/days/{day}/plans")).json()
        assert [p["owner_name"] for p in plans] == ["Nyx", "Goba"]
        gobas = plans[1]["id"]
        assert (await c.delete(f"/war/plans/{gobas}")).status_code == 403
        kept = (await c.get(f"/war/plans/{gobas}")).json()["doc"]
        assert kept["scenarios"][0]["name"] == "Goba's"


@pytest.mark.asyncio
async def test_publishing_copies_and_leaves_the_draft_in_place(client_factory):
    async with client_factory(ADMIN) as c:
        day = await _day(c)
        draft = (await c.put(f"/war/days/{day}/mine", json={"doc": doc("Plan A")})).json()
    async with client_factory(ADMIN2) as c:
        # Any admin may pick which draft becomes official.
        r = await c.post(f"/war/plans/{draft['id']}/publish")
        assert r.status_code == 200
        official = r.json()
        assert official["official"] is True and official["owner_id"] is None
        assert official["source_name"] == "Goba"
        assert official["updated_by_name"] == "Nyx"
        assert official["doc"] == draft["doc"]

        assert (await c.post(f"/war/plans/{official['id']}/publish")).status_code == 409
        assert (await c.post(f"/war/plans/{draft['id']}/publish")).json()["version"] == 2

        plans = (await c.get(f"/war/days/{day}/plans")).json()
        assert [p["official"] for p in plans] == [True, False]
        days = (await c.get("/war/days")).json()
        assert (days[0]["plans"], days[0]["official"]) == (2, True)

        # Withdrawing the official plan is any admin's call; the draft survives it.
        assert (await c.delete(f"/war/plans/{official['id']}")).status_code == 204
        assert [p["official"] for p in (await c.get(f"/war/days/{day}/plans")).json()] == [False]


@pytest.mark.asyncio
async def test_deleting_a_day_takes_its_plans(client_factory):
    async with client_factory(ADMIN) as c:
        day = await _day(c)
        draft = (await c.put(f"/war/days/{day}/mine", json={"doc": doc()})).json()
        assert (await c.delete(f"/war/days/{day}")).status_code == 204
        assert (await c.get(f"/war/plans/{draft['id']}")).status_code == 404
        assert (await c.get("/war/days")).json() == []


@pytest.mark.asyncio
async def test_owner_id_crosses_json_as_a_string(client_factory):
    async with client_factory(BIG) as c:
        day = await _day(c)
        r = await c.put(f"/war/days/{day}/mine", json={"doc": doc()})
        assert r.json()["owner_id"] == "1234567890123456789"


@pytest.mark.asyncio
@pytest.mark.parametrize("bad", [
    {"scenarios": []},
    doc(*[f"P{i}" for i in range(13)]),
    {"scenarios": [{"id": "a", "name": "A"}, {"id": "a", "name": "B"}]},
    doc(changes={"strife": 1}),
    doc(items=[{"id": "i1", "type": "laser"}]),
])
async def test_malformed_plans_are_refused(client_factory, bad):
    async with client_factory(ADMIN) as c:
        day = await _day(c)
        assert (await c.put(f"/war/days/{day}/mine", json={"doc": bad})).status_code == 422


# ----------------------------------------------------------------- discord

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


def _maps(*names):
    data = {"channel_id": "1546368345", "message": "Rally 10:40", "scenarios": list(names)}
    files = [("images", (f"{i}.png", PNG, "image/png")) for i, _ in enumerate(names)]
    return data, files


@pytest.mark.asyncio
async def test_the_official_plan_posts_once_unless_asked_again(client_factory, monkeypatch):
    import dwsbot.discord_bot.bot as botmod

    sent = []

    async def fake_post(bot, channel_id, **kw):
        sent.append((channel_id, kw["scenarios"], len(kw["images"]), kw["source"]))
        return "https://discord.com/channels/1/2/3"

    monkeypatch.setattr(botmod.bot, "is_ready", lambda: True)
    monkeypatch.setattr(warplan.warpost, "post", fake_post)

    async with client_factory(ADMIN) as c:
        day = await _day(c)
        draft = (await c.put(f"/war/days/{day}/mine", json={"doc": doc()})).json()
        data, files = _maps("Plan A", "Plan B")
        r = await c.post(f"/war/plans/{draft['id']}/post", data=data, files=files)
        assert r.status_code == 409 and "publish" in r.json()["detail"]

        official = (await c.post(f"/war/plans/{draft['id']}/publish")).json()
        r = await c.post(f"/war/plans/{official['id']}/post", data=data, files=files)
        assert r.status_code == 200, r.text
        assert r.json()["url"].endswith("/3") and r.json()["images"] == 2
        assert sent == [(1546368345, ["Plan A", "Plan B"], 2, "Goba")]

        again = await c.post(f"/war/plans/{official['id']}/post", data=data, files=files)
        assert again.status_code == 409 and "already posted" in again.json()["detail"]
        ok = await c.post(f"/war/plans/{official['id']}/post", data={**data, "again": "true"},
                          files=files)
        assert ok.status_code == 200 and len(sent) == 2

        listed = (await c.get(f"/war/days/{day}/plans")).json()
        assert listed[0]["posted_url"].endswith("/3")


@pytest.mark.asyncio
async def test_a_post_needs_one_png_per_scenario(client_factory, monkeypatch):
    import dwsbot.discord_bot.bot as botmod

    monkeypatch.setattr(botmod.bot, "is_ready", lambda: True)
    async with client_factory(ADMIN) as c:
        day = await _day(c)
        draft = (await c.put(f"/war/days/{day}/mine", json={"doc": doc()})).json()
        official = (await c.post(f"/war/plans/{draft['id']}/publish")).json()
        url = f"/war/plans/{official['id']}/post"
        data, files = _maps("Plan A")
        not_png = [("images", ("a.png", b"GIF89a....", "image/png"))]
        assert (await c.post(url, data=data, files=not_png)).status_code == 422
        data2, _ = _maps("Plan A", "Plan B")
        assert (await c.post(url, data=data2, files=files)).status_code == 422


@pytest.mark.asyncio
async def test_a_discord_refusal_comes_back_as_a_409(client_factory, monkeypatch):
    import dwsbot.discord_bot.bot as botmod

    async def boom(*a, **kw):
        raise RuntimeError("Missing Permissions")

    monkeypatch.setattr(botmod.bot, "is_ready", lambda: True)
    monkeypatch.setattr(warplan.warpost, "post", boom)
    async with client_factory(ADMIN) as c:
        day = await _day(c)
        draft = (await c.put(f"/war/days/{day}/mine", json={"doc": doc()})).json()
        official = (await c.post(f"/war/plans/{draft['id']}/publish")).json()
        data, files = _maps("Plan A")
        r = await c.post(f"/war/plans/{official['id']}/post", data=data, files=files)
    assert r.status_code == 409 and "Missing Permissions" in r.json()["detail"]


@pytest.mark.asyncio
async def test_the_post_is_one_message_with_a_heading_and_maps_in_order():
    from datetime import date

    from dwsbot import warpost

    class Channel:
        def __init__(self):
            self.sent = None

        async def send(self, **kw):
            self.sent = kw

            class Message:
                jump_url = "https://discord.com/channels/1/2/99"
            return Message()

    channel = Channel()

    class Bot:
        def get_channel(self, _):
            return channel

    url = await warpost.post(Bot(), 2, day=date(2026, 10, 3), day_title="Strife Pass",
                             message="Rally 10:40", scenarios=["Plan A", "Rush east!"],
                             images=[PNG, PNG], source="Goba")
    assert url.endswith("/99")
    embed = channel.sent["embed"]
    assert embed.title == "War plan · 2026-10-03 (Sat) · Strife Pass"
    assert embed.description == "Rally 10:40"
    assert [f.filename for f in channel.sent["files"]] == ["01_Plan_A.png", "02_Rush_east.png"]
