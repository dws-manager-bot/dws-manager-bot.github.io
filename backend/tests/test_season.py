"""The season standing: attendance decides the tier, merits break the ties.

What matters here is what does *not* count. A day whose merit ranking was never
captured must not read as a zero, and BGB must not drag down a member who was
never given a seat.
"""
from __future__ import annotations

from datetime import date

import pytest
import pytest_asyncio
from fastapi import FastAPI, HTTPException, status
from httpx import ASGITransport, AsyncClient
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.ext.compiler import compiles

from dwsbot.api.deps import current_user, get_session, require_admin
from dwsbot.api.routers import season as season_router
from dwsbot.db import Base
from dwsbot.models import (
    AttendanceEvent,
    AttendanceRecord,
    BgbEvent,
    BgbRegistration,
    Player,
    PlayerName,
)  # BgbEvent/BgbRegistration are seeded only to prove they do not show up
from dwsbot.schemas import MeOut


@compiles(JSONB, "sqlite")
def _jsonb_on_sqlite(type_, compiler, **kw):  # noqa: ARG001
    return "JSON"


ADMIN = MeOut(discord_id=1, username="Admin", is_admin=True)
MEMBER = MeOut(discord_id=2, username="Member", is_admin=False)
DAYS = [date(2026, 9, 5), date(2026, 9, 13), date(2026, 9, 19), date(2026, 9, 26)]


@pytest_asyncio.fixture
async def client_factory():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)

    def build(user: MeOut = ADMIN):
        app = FastAPI()
        app.include_router(season_router.router)

        async def _session():
            async with maker() as s:
                yield s

        async def _admin():
            if not user.is_admin:
                raise HTTPException(status.HTTP_403_FORBIDDEN, "admins only")
            return user

        app.dependency_overrides[get_session] = _session
        app.dependency_overrides[current_user] = lambda: user
        app.dependency_overrides[require_admin] = _admin
        return AsyncClient(transport=ASGITransport(app=app), base_url="http://t")

    build.maker = maker
    yield build
    await engine.dispose()


async def seed(maker, people, merits_on=(0, 1, 2)):
    """`people` is name -> list of (present, merits[, online_minutes]) per day."""
    async with maker() as s:
        ids = {}
        for name in people:
            p = Player(name=name)
            p.names.append(PlayerName(name=name, first_seen=DAYS[0], last_seen=DAYS[-1]))
            s.add(p)
            await s.flush()
            ids[name] = p.id
        for i, day in enumerate(DAYS):
            event = AttendanceEvent(kind="strife_pass", held_on=day, title=f"war {i}")
            s.add(event)
            await s.flush()
            for name, days in people.items():
                present, merits, *minutes = days[i]
                if present is None:            # not on that day's sheet at all
                    continue
                s.add(AttendanceRecord(
                    event_id=event.id, player_id=ids[name], name=name, present=present,
                    merits=merits if i in merits_on else None,
                    online_minutes=minutes[0] if minutes else None))
        await s.commit()
    return ids


@pytest.mark.asyncio
async def test_only_admins_may_look(client_factory):
    async with client_factory(MEMBER) as c:
        assert (await c.get("/season")).status_code == 403


@pytest.mark.asyncio
async def test_attendance_decides_the_order(client_factory):
    await seed(client_factory.maker, {
        "AllFour": [(True, 100)] * 4,
        "Three": [(True, 900), (True, 900), (True, 900), (False, None)],
        "Two": [(True, 999), (True, 999), (False, None), (False, None)],
    })
    async with client_factory() as c:
        body = (await c.get("/season")).json()
    # Even with far better merits, fewer days means lower down.
    assert [m["name"] for m in body["members"]] == ["AllFour", "Three", "Two"]
    assert [m["attended"] for m in body["members"]] == [4, 3, 2]
    assert all(m["of"] == 4 for m in body["members"])


@pytest.mark.asyncio
async def test_merits_break_a_tie(client_factory):
    await seed(client_factory.maker, {
        "Carried": [(True, 900)] * 4,
        "Coasted": [(True, 10)] * 4,
        "Middle": [(True, 400)] * 4,
    })
    async with client_factory() as c:
        body = (await c.get("/season")).json()
    assert [m["name"] for m in body["members"]] == ["Carried", "Middle", "Coasted"]
    assert body["members"][0]["merit_standing"] == 1.0
    assert body["members"][-1]["merit_standing"] == 0.0


@pytest.mark.asyncio
async def test_a_day_without_merits_is_not_a_zero(client_factory):
    """One conquest mattered less and its ranking was never captured."""
    await seed(client_factory.maker, {
        "Steady": [(True, 500)] * 4,
        "Rival": [(True, 500)] * 4,
    }, merits_on=(0, 1, 2))
    # Rival scored nothing on the uncaptured day; it must not count against them.
    async with client_factory() as c:
        body = (await c.get("/season")).json()
    for m in body["members"]:
        assert m["merit_days"] == 3, "the fourth day has no ranking, so it is not counted"
        assert m["attended"] == 4
        assert m["days"][3]["present"] is True
        assert m["days"][3]["merits"] is None
    assert [e["has_merits"] for e in body["events"]] == [True, True, True, False]


@pytest.mark.asyncio
async def test_a_member_with_no_merit_day_sorts_below_one_with_a_standing(client_factory):
    await seed(client_factory.maker, {
        "Ranked": [(True, 10)] * 4,          # the very worst standing there is
        "Unranked": [(True, None)] * 4,      # never in a captured ranking
    })
    async with client_factory() as c:
        body = (await c.get("/season")).json()
    assert [m["name"] for m in body["members"]] == ["Ranked", "Unranked"]
    assert body["members"][1]["merit_standing"] is None
    assert body["members"][1]["merit_days"] == 0


@pytest.mark.asyncio
async def test_bgb_is_nowhere_in_the_season(client_factory):
    ids = await seed(client_factory.maker, {
        "Picked": [(True, 100)] * 4,
        "NeverPicked": [(True, 100)] * 4,
    })
    async with client_factory.maker() as s:
        event = BgbEvent(battle_date=date(2026, 9, 27))
        s.add(event)
        await s.flush()
        s.add(BgbRegistration(event_id=event.id, player_id=ids["Picked"], team="A",
                              role="starter", name="Picked", participated=True, score=5))
        s.add(BgbRegistration(event_id=event.id, player_id=ids["NeverPicked"], team="B",
                              role="starter", name="NeverPicked", participated=False))
        await s.commit()
    async with client_factory() as c:
        payload = (await c.get("/season")).json()
    body = {m["name"]: m for m in payload["members"]}
    # One fought a battle and one missed their start, and the season cannot tell:
    # only a fraction of members ever get a seat, so BGB is neither counted here
    # nor reported here. `bgb_cp` stays -- that is the member's power, not a
    # record of anything they did.
    assert body["Picked"]["attended"] == body["NeverPicked"]["attended"] == 4
    # The whole shape, so a BGB field cannot creep back in unnoticed.
    assert set(body["Picked"]) == {
        "player_id", "name", "rank", "bgb_cp", "total_cp", "attended", "of", "days",
        "merit_standing", "merit_days", "online_minutes", "online_of", "first_seen",
    }


@pytest.mark.asyncio
async def test_a_member_absent_from_a_sheet_counts_as_away(client_factory):
    await seed(client_factory.maker, {
        "Missing": [(True, 100), (None, None), (True, 100), (True, 100)],
    })
    async with client_factory() as c:
        m = (await c.get("/season")).json()["members"][0]
    assert m["attended"] == 3
    assert m["days"][1]["recorded"] is False and m["days"][1]["present"] is False


# --- the reward board -------------------------------------------------------
#
# The game hands rewards out in four fixed bands, and the sizes are its: one
# leader, six backbone, thirty key players, and the rest contributors. Only
# the first three are recorded; the fourth is whoever is left.

async def board(client, awards, season="5"):
    return await client.put("/season/awards", json={"season": season, "awards": awards})


@pytest.mark.asyncio
async def test_an_empty_board_makes_everyone_a_contributor(client_factory):
    await seed(client_factory.maker, {"A": [(True, 1)] * 4, "B": [(True, 2)] * 4})
    async with client_factory() as c:
        body = (await c.get("/season/awards")).json()
    assert body["awards"] == {}
    assert body["caps"] == {"leader": 1, "backbone": 6, "key": 30, "contributor": 63}


@pytest.mark.asyncio
async def test_a_board_is_saved_and_read_back(client_factory):
    ids = await seed(client_factory.maker, {f"M{i}": [(True, i)] * 4 for i in range(4)})
    async with client_factory() as c:
        r = await board(c, [
            {"player_id": str(ids["M0"]), "tier": "leader"},
            {"player_id": str(ids["M1"]), "tier": "backbone"},
            {"player_id": str(ids["M2"]), "tier": "key"},
        ])
        assert r.status_code == 200, r.text
        body = (await c.get("/season/awards")).json()
    assert body["awards"] == {str(ids["M0"]): "leader", str(ids["M1"]): "backbone",
                              str(ids["M2"]): "key"}
    # M3 was never placed, which is what being a contributor is.
    assert str(ids["M3"]) not in body["awards"]


@pytest.mark.asyncio
async def test_the_game_s_band_sizes_are_enforced(client_factory):
    ids = await seed(client_factory.maker, {f"M{i}": [(True, 1)] * 4 for i in range(10)})
    async with client_factory() as c:
        r = await board(c, [{"player_id": str(ids[f"M{i}"]), "tier": "leader"}
                            for i in range(2)])
        assert r.status_code == 422 and "leader takes 1, not 2" in r.json()["detail"]

        r = await board(c, [{"player_id": str(ids[f"M{i}"]), "tier": "backbone"}
                            for i in range(7)])
        assert r.status_code == 422 and "backbone takes 6, not 7" in r.json()["detail"]

        # Six is fine.
        r = await board(c, [{"player_id": str(ids[f"M{i}"]), "tier": "backbone"}
                            for i in range(6)])
        assert r.status_code == 200, r.text


@pytest.mark.asyncio
async def test_a_member_cannot_be_in_two_tiers(client_factory):
    ids = await seed(client_factory.maker, {"A": [(True, 1)] * 4})
    async with client_factory() as c:
        r = await board(c, [{"player_id": str(ids["A"]), "tier": "leader"},
                            {"player_id": str(ids["A"]), "tier": "backbone"}])
    assert r.status_code == 422 and "only be in one tier" in r.json()["detail"]


@pytest.mark.asyncio
async def test_a_board_naming_a_stranger_is_refused(client_factory):
    await seed(client_factory.maker, {"A": [(True, 1)] * 4})
    async with client_factory() as c:
        r = await board(c, [{"player_id": "11111111-2222-3333-4444-555555555555",
                             "tier": "leader"}])
    assert r.status_code == 422 and "not a member" in r.json()["detail"]


@pytest.mark.asyncio
async def test_saving_replaces_the_board_rather_than_adding_to_it(client_factory):
    ids = await seed(client_factory.maker, {"A": [(True, 1)] * 4, "B": [(True, 2)] * 4})
    async with client_factory() as c:
        await board(c, [{"player_id": str(ids["A"]), "tier": "leader"}])
        await board(c, [{"player_id": str(ids["B"]), "tier": "leader"}])
        body = (await c.get("/season/awards")).json()
    # A was dragged out; the board on the page is the board.
    assert body["awards"] == {str(ids["B"]): "leader"}


@pytest.mark.asyncio
async def test_seasons_are_kept_apart(client_factory):
    ids = await seed(client_factory.maker, {"A": [(True, 1)] * 4})
    async with client_factory() as c:
        await board(c, [{"player_id": str(ids["A"]), "tier": "leader"}], season="5")
        assert (await c.get("/season/awards?season=6")).json()["awards"] == {}
        assert (await c.get("/season/awards?season=5")).json()["awards"] != {}


@pytest.mark.asyncio
async def test_the_standing_carries_what_the_candidates_sort_by(client_factory):
    """Rank, attendance, BGB CP and total CP all have to reach the page."""
    ids = await seed(client_factory.maker, {"A": [(True, 5)] * 4})
    async with client_factory.maker() as s:
        player = await s.get(Player, ids["A"])
        player.rank, player.bgb_cp, player.total_cp = 5, 292_185_930, 1_694_095_810
        await s.commit()
    async with client_factory() as c:
        m = (await c.get("/season")).json()["members"][0]
    assert (m["rank"], m["bgb_cp"], m["total_cp"], m["attended"]) == \
        (5, 292_185_930, 1_694_095_810, 4)


@pytest.mark.asyncio
async def test_online_time_adds_up_over_the_season(client_factory):
    """120 a conquest at most, over the conquests that were timed at all."""
    await seed(client_factory.maker, {
        "AllWar": [(True, 100, 120), (True, 100, 120), (True, 100, None), (True, 100, 90)],
        "Merited": [(True, 900, 10), (True, 900, 10), (True, 900, None), (True, 900, 10)],
        # Not on the first sheet at all: away, so that conquest adds nothing.
        "Joined": [(None, None), (True, 500, 120), (True, 500, None), (True, 500, 120)],
    })
    async with client_factory() as c:
        body = (await c.get("/season")).json()
    m = {x["name"]: x for x in body["members"]}
    # The third conquest was never timed, so the most there is is 3 x 120.
    assert (m["AllWar"]["online_minutes"], m["AllWar"]["online_of"]) == (330, 360)
    assert (m["Merited"]["online_minutes"], m["Merited"]["online_of"]) == (30, 360)
    assert (m["Joined"]["online_minutes"], m["Joined"]["online_of"]) == (240, 360)
    assert [d["online_minutes"] for d in m["Joined"]["days"]] == [None, 120, None, 120]
    assert [e["has_minutes"] for e in body["events"]] == [True, True, False, True]
    # It is shown, not counted: Merited outranks AllWar on merits alone, however
    # much longer AllWar was online.
    assert [x["name"] for x in body["members"]] == ["Merited", "AllWar", "Joined"]


@pytest.mark.asyncio
async def test_a_season_never_timed_has_no_online_total(client_factory):
    await seed(client_factory.maker, {"Someone": [(True, 100)] * 4})
    async with client_factory() as c:
        member = (await c.get("/season")).json()["members"][0]
    assert (member["online_minutes"], member["online_of"]) == (None, 0)
