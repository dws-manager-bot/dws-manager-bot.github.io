"""Recording a BGB registration, and the cards it produces.

The sheet only ever says who is on which team in which seat, so these check the
things that would quietly ruin a battle: a roster over the game's own limits, a
member on both sides, a file that read as empty, and a re-upload for a date that
already has a roster.
"""
from __future__ import annotations

import io
from datetime import date

import pytest
import pytest_asyncio
from fastapi import FastAPI, HTTPException, status
from httpx import ASGITransport, AsyncClient
from openpyxl import Workbook, load_workbook
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.ext.compiler import compiles

from dwsbot.api.deps import current_user, get_session, require_admin
from dwsbot.api.routers import bgb as bgb_router
from dwsbot.bgb import sheet
from dwsbot.db import Base
from dwsbot.models import AuditLog, BgbRegistration, Player, PlayerName
from dwsbot.schemas import MeOut


@compiles(JSONB, "sqlite")
def _jsonb_on_sqlite(type_, compiler, **kw):  # noqa: ARG001
    return "JSON"


ADMIN = MeOut(discord_id=1, username="Admin", is_admin=True)
MEMBER = MeOut(discord_id=2, username="Member", is_admin=False)
BATTLE = date(2026, 9, 26)


@pytest_asyncio.fixture
async def client_factory():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)

    def build(user: MeOut = ADMIN):
        app = FastAPI()
        app.include_router(bgb_router.router)

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


async def seed(maker, count: int = 36) -> list[tuple[str, str]]:
    """`count` members, strongest first, returning (name, id) pairs."""
    out = []
    async with maker() as session:
        for i in range(count):
            player = Player(name=f"Member {i:02d}", bgb_cp=300_000_000 - i * 5_000_000)
            player.names.append(PlayerName(name=player.name, first_seen=date(2026, 9, 9),
                                           last_seen=date(2026, 9, 9)))
            session.add(player)
            await session.flush()
            out.append((player.name, str(player.id)))
        await session.commit()
    return out


def sheet_of(per_team: dict[str, list[dict]]) -> bytes:
    """A workbook in the template's shape, as someone would upload it."""
    book = Workbook()
    book.remove(book.active)
    for team in sheet.TEAMS:
        page = book.create_sheet(sheet.SHEETS[team])
        page.append([heading for heading, _ in sheet.COLUMNS])
        for row in per_team.get(team, []):
            page.append([row.get(attribute) for _, attribute in sheet.COLUMNS])
    out = io.BytesIO()
    book.save(out)
    return out.getvalue()


def marks(people, starters: int, substitutes: int = 0, start: int = 0) -> list[dict]:
    """Rows marking a slice of the roster: `starters` O, then `substitutes` O."""
    rows = []
    for offset in range(starters + substitutes):
        name, player_id = people[start + offset]
        rows.append({"id": player_id, "name": name, "bgb_cp": None,
                     sheet.STARTER: "O" if offset < starters else "X",
                     sheet.SUBSTITUTE: "X" if offset < starters else "O"})
    return rows


def hired(name: str, cp: int, role: str = sheet.STARTER) -> dict:
    """A mercenary's row: a name, a CP, no id, and the Mercenary column marked."""
    return {"id": None, "name": name, "bgb_cp": cp, sheet.MERCENARY: "O",
            sheet.STARTER: "O" if role == sheet.STARTER else "X",
            sheet.SUBSTITUTE: "O" if role == sheet.SUBSTITUTE else "X"}


async def upload(client, data: bytes, battle_date: date = BATTLE):
    return await client.post("/bgb/roster/preview",
                             files={"file": ("bgb.xlsx", data, "application/vnd.ms-excel")},
                             data={"battle_date": battle_date.isoformat()})


async def record(client, per_team, battle_date: date = BATTLE):
    """Preview then apply, the way the site does."""
    preview = await upload(client, sheet_of(per_team), battle_date)
    assert preview.status_code == 200, preview.text
    body = preview.json()
    applied = await client.post("/bgb/roster/apply", json={
        "battle_date": battle_date.isoformat(), "fingerprint": body["fingerprint"],
        "file_name": "bgb.xlsx", "rows": body["rows"]})
    return body, applied


@pytest.mark.asyncio
async def test_only_admins_may_take_the_template(client_factory):
    async with client_factory(MEMBER) as c:
        assert (await c.get("/bgb/template.xlsx")).status_code == 403


@pytest.mark.asyncio
async def test_the_template_has_a_sheet_per_team_and_two_empty_columns(client_factory):
    people = await seed(client_factory.maker, 3)
    async with client_factory() as c:
        r = await c.get("/bgb/template.xlsx")
    assert r.status_code == 200
    book = load_workbook(io.BytesIO(r.content))
    assert book.sheetnames == ["Team A", "Team B", sheet.HELP_SHEET]
    for team in ("Team A", "Team B"):
        page = book[team]
        assert [c.value for c in page[1]] == [h for h, _ in sheet.COLUMNS]
        last = len(people) + 1
        # Every member is on both sheets, because either side may claim them.
        assert page.cell(row=last, column=2).value is not None
        # The three mark columns are handed over empty.
        for column in (4, 5, 6):
            assert [page.cell(row=r, column=column).value
                    for r in range(2, last + 1)] == [None] * 3
        # ... and below them, where to type a mercenary in.
        assert "Mercenaries" in str(page.cell(row=last + 2, column=1).value)
    # Strongest first, so the sheet reads in the order the game's popup does.
    assert book["Team A"].cell(row=2, column=2).value == people[0][0]


@pytest.mark.asyncio
async def test_a_registration_records_only_the_marked(client_factory):
    people = await seed(client_factory.maker)
    async with client_factory() as c:
        body, applied = await record(c, {"A": marks(people, 20, 10),
                                         "B": marks(people, 4, 2, start=30)})
    assert applied.status_code == 200, applied.text
    async with client_factory.maker() as s:
        rows = list(await s.scalars(select(BgbRegistration)))
    # 30 on Team A, 6 on Team B -- and nobody else, though 36 members exist.
    assert len(rows) == 36
    assert sum(1 for r in rows if r.team == "A" and r.role == sheet.STARTER) == 20
    assert sum(1 for r in rows if r.team == "A" and r.role == sheet.SUBSTITUTE) == 10
    assert sum(1 for r in rows if r.team == "B") == 6
    # The name and CP are copied onto the seat, not looked up later.
    strongest = next(r for r in rows if r.name == people[0][0])
    assert strongest.bgb_cp == 300_000_000


@pytest.mark.asyncio
async def test_the_game_s_limits_are_refused(client_factory):
    people = await seed(client_factory.maker)
    async with client_factory() as c:
        r = await upload(c, sheet_of({"A": marks(people, 21)}))
        assert "21 starters" in " ".join(r.json()["problems"])
        r = await upload(c, sheet_of({"A": marks(people, 20, 11)}))
        assert "11 substitutes" in " ".join(r.json()["problems"])


@pytest.mark.asyncio
async def test_nobody_plays_for_both_teams(client_factory):
    people = await seed(client_factory.maker)
    async with client_factory() as c:
        r = await upload(c, sheet_of({"A": marks(people, 3), "B": marks(people, 3)}))
    assert "both teams" in " ".join(r.json()["problems"])


@pytest.mark.asyncio
async def test_a_member_cannot_be_starter_and_substitute_at_once(client_factory):
    people = await seed(client_factory.maker, 2)
    name, player_id = people[0]
    async with client_factory() as c:
        r = await upload(c, sheet_of({"A": [{"id": player_id, "name": name,
                                             sheet.STARTER: "O", sheet.SUBSTITUTE: "O"}]}))
    assert "both a starter and a substitute" in " ".join(r.json()["problems"])


@pytest.mark.asyncio
async def test_a_file_that_reads_as_empty_records_nothing(client_factory):
    """The same guard the member import has: no rows must mean no roster."""
    await seed(client_factory.maker, 2)
    async with client_factory() as c:
        r = await upload(c, b"this is not a spreadsheet at all")
        assert "could not be opened" in " ".join(r.json()["problems"])
        # A readable file with nothing marked is not a roster either.
        people = await seed(client_factory.maker, 1)
        empty = [{"id": people[0][1], "name": people[0][0]}]
        r = await upload(c, sheet_of({"A": empty}))
        assert "Nobody is marked" in " ".join(r.json()["problems"])
        assert r.json()["teams"] == []


@pytest.mark.asyncio
async def test_a_row_without_an_id_says_where_to_add_them(client_factory):
    await seed(client_factory.maker, 1)
    async with client_factory() as c:
        r = await upload(c, sheet_of({"A": [{"name": "Somebody New", sheet.STARTER: "O"}]}))
    assert "Members tab" in " ".join(r.json()["problems"])


@pytest.mark.asyncio
async def test_a_corrected_cp_updates_the_member_too(client_factory):
    people = await seed(client_factory.maker, 2)
    rows = marks(people, 2)
    rows[0]["bgb_cp"] = "311,000,000"          # typed with commas, as a person would
    async with client_factory() as c:
        body, applied = await record(c, {"A": rows})
        assert [c["after"] for c in body["cp_changes"]] == [311_000_000]
        assert applied.status_code == 200, applied.text
    async with client_factory.maker() as s:
        player = await s.get(Player, __import__("uuid").UUID(people[0][1]))
        assert player.bgb_cp == 311_000_000
        seat = await s.scalar(select(BgbRegistration).where(BgbRegistration.name == people[0][0]))
        assert seat.bgb_cp == 311_000_000


@pytest.mark.asyncio
async def test_uploading_the_same_date_again_replaces_its_roster(client_factory):
    people = await seed(client_factory.maker)
    async with client_factory() as c:
        await record(c, {"A": marks(people, 20, 10)})
        second = await upload(c, sheet_of({"A": marks(people, 5)}))
        assert second.json()["replaces"] == 30      # what is already on that date
        _, applied = await record(c, {"A": marks(people, 5)})
        assert applied.status_code == 200, applied.text
        events = (await c.get("/bgb/events")).json()
    assert len(events) == 1                          # one battle, not two
    assert events[0]["starters"] == {"A": 5} and events[0]["substitutes"] == {}
    async with client_factory.maker() as s:
        assert len(list(await s.scalars(select(BgbRegistration)))) == 5


@pytest.mark.asyncio
async def test_an_upload_refuses_once_the_member_list_has_moved(client_factory):
    people = await seed(client_factory.maker, 3)
    async with client_factory() as c:
        preview = (await upload(c, sheet_of({"A": marks(people, 3)}))).json()
        async with client_factory.maker() as s:      # somebody renames meanwhile
            player = await s.get(Player, __import__("uuid").UUID(people[0][1]))
            player.name = "Renamed"
            await s.commit()
        r = await c.post("/bgb/roster/apply", json={
            "battle_date": BATTLE.isoformat(), "fingerprint": preview["fingerprint"],
            "rows": preview["rows"]})
    assert r.status_code == 409
    assert "changed while you were looking" in r.json()["detail"]


@pytest.mark.asyncio
async def test_the_recording_is_audited(client_factory):
    people = await seed(client_factory.maker)
    async with client_factory() as c:
        await record(c, {"A": marks(people, 20, 10), "B": marks(people, 2, 0, start=30)})
    async with client_factory.maker() as s:
        entry = await s.scalar(select(AuditLog))
    assert entry.action == "bgb.roster"
    assert entry.detail["counts"] == {
        "A": {"starters": 20, "substitutes": 10, "mercenaries": 0},
        "B": {"starters": 2, "substitutes": 0, "mercenaries": 0}}
    assert entry.detail["battle_date"] == BATTLE.isoformat()
    assert entry.detail["file"] == "bgb.xlsx"


@pytest.mark.asyncio
async def test_the_cards_are_drawn_for_every_language(client_factory):
    people = await seed(client_factory.maker)
    async with client_factory() as c:
        _, applied = await record(c, {"A": marks(people, 20, 10)})
        event_id = applied.json()["event_id"]

        langs = (await c.get("/bgb/languages")).json()
        assert {entry["code"] for entry in langs} >= {"en", "ko", "ar", "th"}
        assert next(e for e in langs if e["code"] == "ko")["native"] == "한국어"

        for lang in ("en", "ko"):
            r = await c.get(f"/bgb/events/{event_id}/card.png?team=A&lang={lang}")
            assert r.status_code == 200
            assert r.headers["content-type"] == "image/png"
            assert r.content[:8] == b"\x89PNG\r\n\x1a\n"
        assert (await c.get(f"/bgb/events/{event_id}/card.png?team=A&lang=xx")).status_code == 404
        # Team B has nobody registered for this battle.
        assert (await c.get(f"/bgb/events/{event_id}/card.png?team=B")).status_code == 404


@pytest.mark.asyncio
async def test_the_zip_is_laid_out_like_the_dated_folders(client_factory):
    import zipfile

    people = await seed(client_factory.maker)
    async with client_factory() as c:
        _, applied = await record(c, {"A": marks(people, 20, 10),
                                      "B": marks(people, 4, 0, start=30)})
        event_id = applied.json()["event_id"]
        r = await c.get(f"/bgb/events/{event_id}/cards.zip")
    assert r.status_code == 200
    names = zipfile.ZipFile(io.BytesIO(r.content)).namelist()
    assert len(names) == 30                                    # 2 teams x 15 languages
    assert "teamA/lineup_teamA.png" in names                   # English has no suffix
    assert "teamB/lineup_teamB_zh_cn.png" in names
    assert "bgb-20260926-cards.zip" in r.headers["content-disposition"]


@pytest.mark.asyncio
async def test_a_recorded_roster_reads_back_strongest_first(client_factory):
    people = await seed(client_factory.maker)
    async with client_factory() as c:
        _, applied = await record(c, {"A": marks(people, 20, 10)})
        teams = (await c.get(f"/bgb/events/{applied.json()['event_id']}")).json()
    assert [t["team"] for t in teams] == ["A"]
    assert len(teams[0]["starters"]) == 20 and len(teams[0]["substitutes"]) == 10
    cps = [s["bgb_cp"] for s in teams[0]["starters"]]
    assert cps == sorted(cps, reverse=True)


# --- mercenaries ------------------------------------------------------------
#
# Another alliance's players are hired for a battle now and then. They take a
# real seat, so they belong on the card -- but never in `players`, because the
# member import reads an absent row as somebody who left, and they were never
# here to leave.

@pytest.mark.asyncio
async def test_a_mercenary_is_recorded_without_a_player(client_factory):
    people = await seed(client_factory.maker)
    rows = marks(people, 18, 10) + [hired("人間です", 64_884_228),
                                    hired("ウルフなう", 45_472_553)]
    async with client_factory() as c:
        body, applied = await record(c, {"A": rows})
    assert body["problems"] == []
    assert applied.status_code == 200, applied.text
    team = body["teams"][0]
    assert len(team["starters"]) == 20 and len(team["substitutes"]) == 10
    # No substitute was promoted to fill a seat, which is what happens when the
    # mercenaries are missing instead.
    assert team["warnings"] == []
    guests = [s for s in team["starters"] if s["mercenary"]]
    assert [s["name"] for s in guests] == ["人間です", "ウルフなう"]
    assert all(s["player_id"] is None for s in guests)

    async with client_factory.maker() as s:
        rows_in_db = list(await s.scalars(select(BgbRegistration)))
        hired_rows = [r for r in rows_in_db if r.player_id is None]
        assert len(rows_in_db) == 30 and len(hired_rows) == 2
        assert {r.name for r in hired_rows} == {"人間です", "ウルフなう"}
        assert sorted(r.bgb_cp for r in hired_rows) == [45_472_553, 64_884_228]
        # And they are nobody's member.
        assert await s.scalar(select(func.count()).select_from(Player)) == len(people)


@pytest.mark.asyncio
async def test_a_mercenary_counts_towards_the_team_s_limits(client_factory):
    people = await seed(client_factory.maker)
    async with client_factory() as c:
        r = await upload(c, sheet_of({"A": marks(people, 20) + [hired("Ronin", 50_000_000)]}))
    assert "21 starters" in " ".join(r.json()["problems"])


@pytest.mark.asyncio
async def test_a_mercenary_needs_a_name_a_cp_and_a_seat(client_factory):
    await seed(client_factory.maker, 2)
    async with client_factory() as c:
        r = await upload(c, sheet_of({"A": [{"name": "Ronin", sheet.MERCENARY: "O",
                                             sheet.STARTER: "O"}]}))
        assert "needs a BGB CP" in " ".join(r.json()["problems"])

        r = await upload(c, sheet_of({"A": [{"bgb_cp": 5, sheet.MERCENARY: "O",
                                             sheet.STARTER: "O"}]}))
        assert "needs a name" in " ".join(r.json()["problems"])

        # Marked as hired but given no seat: they would vanish silently.
        r = await upload(c, sheet_of({"A": [{"name": "Ronin", "bgb_cp": 5,
                                             sheet.MERCENARY: "O"}]}))
        assert "neither a starter nor a substitute" in " ".join(r.json()["problems"])


@pytest.mark.asyncio
async def test_a_member_cannot_be_marked_as_a_mercenary(client_factory):
    people = await seed(client_factory.maker, 2)
    name, player_id = people[0]
    async with client_factory() as c:
        # With their id still on the row.
        r = await upload(c, sheet_of({"A": [{"id": player_id, "name": name, "bgb_cp": 5,
                                             sheet.MERCENARY: "O", sheet.STARTER: "O"}]}))
        assert "they are a member" in " ".join(r.json()["problems"])
        # Or hand-typed as a new row under a name we already know.
        r = await upload(c, sheet_of({"A": [hired(name, 5_000_000)]}))
        assert "already a member" in " ".join(r.json()["problems"])


@pytest.mark.asyncio
async def test_two_mercenaries_may_not_share_a_name(client_factory):
    await seed(client_factory.maker, 2)
    async with client_factory() as c:
        r = await upload(c, sheet_of({"A": [hired("Ronin", 5_000_000),
                                            hired("Ronin", 4_000_000)]}))
    assert "also hired on" in " ".join(r.json()["problems"])


@pytest.mark.asyncio
async def test_nobody_plays_for_both_teams_mercenary_included(client_factory):
    people = await seed(client_factory.maker)
    async with client_factory() as c:
        r = await upload(c, sheet_of({"A": marks(people, 2) + [hired("Ronin", 5_000_000)],
                                      "B": marks(people, 2, 0, start=20)
                                           + [hired("Ronin", 5_000_000)]}))
    assert "both sides" in " ".join(r.json()["problems"])


@pytest.mark.asyncio
async def test_a_line_of_free_text_is_not_a_registration(client_factory):
    """The template's own note sits under the members, and is not a row."""
    people = await seed(client_factory.maker, 3)
    note = {"id": "Mercenaries: add rows here, leaving Player id empty."}
    async with client_factory() as c:
        r = await upload(c, sheet_of({"A": marks(people, 2) + [note]}))
    assert r.json()["problems"] == []
    assert len(r.json()["teams"][0]["starters"]) == 2


@pytest.mark.asyncio
async def test_a_mercenary_takes_a_seat_on_the_card(client_factory):
    people = await seed(client_factory.maker)
    rows = marks(people, 19, 10) + [hired("人間です", 999_000_000)]
    async with client_factory() as c:
        _, applied = await record(c, {"A": rows})
        event_id = applied.json()["event_id"]
        r = await c.get(f"/bgb/events/{event_id}/card.png?team=A&lang=ja")
    assert r.status_code == 200 and r.content[:8] == b"\x89PNG\r\n\x1a\n"


# --- the result -------------------------------------------------------------
#
# Read off the battle-result mail, which ranks both alliances together. Only our
# own seats matter, so the sheet is the roster itself and rows cannot be added.

def result_sheet_of(per_team: dict[str, list[dict]]) -> bytes:
    book = Workbook()
    book.remove(book.active)
    for team in sheet.TEAMS:
        page = book.create_sheet(sheet.SHEETS[team])
        page.append([heading for heading, _ in sheet.RESULT_COLUMNS])
        for row in per_team.get(team, []):
            page.append([row.get(attribute) for _, attribute in sheet.RESULT_COLUMNS])
    out = io.BytesIO()
    book.save(out)
    return out.getvalue()


async def recorded_battle(client_factory, starters=20, substitutes=10):
    """A battle with a roster already in, returning (event_id, seats)."""
    people = await seed(client_factory.maker)
    async with client_factory() as c:
        _, applied = await record(c, {"A": marks(people, starters, substitutes)})
        event_id = applied.json()["event_id"]
        teams = (await c.get(f"/bgb/events/{event_id}")).json()
    seats = teams[0]["starters"] + teams[0]["substitutes"]
    return event_id, seats


async def upload_result(client, event_id: int, rows: list[dict]):
    return await client.post(
        f"/bgb/events/{event_id}/results/preview",
        files={"file": ("r.xlsx", result_sheet_of({"A": rows}), "x")})


def scores(seats, **by_name) -> list[dict]:
    """Every seat, scored. A name absent from `by_name` was not in the ranking."""
    return [{"id": s["registration_id"], "name": s["name"], "team": s["team"],
             "role": s["role"], "score": by_name.get(s["name"].replace(" ", "_"))}
            for s in seats]


@pytest.mark.asyncio
async def test_the_result_template_is_the_battle_s_own_roster(client_factory):
    event_id, seats = await recorded_battle(client_factory, 20, 10)
    async with client_factory() as c:
        r = await c.get(f"/bgb/events/{event_id}/results/template.xlsx")
    assert r.status_code == 200
    book = load_workbook(io.BytesIO(r.content))
    assert book.sheetnames == ["Team A", "Team B", sheet.HELP_SHEET]
    page = book["Team A"]
    assert [c.value for c in page[1]] == [h for h, _ in sheet.RESULT_COLUMNS]
    assert page.max_row == len(seats) + 1          # every seat, and nobody else
    # Starters first, then substitutes: the order the roster is read in.
    assert [page.cell(row=r, column=4).value for r in (2, page.max_row)] == \
        ["starter", "substitute"]
    # Score and Participated are the two handed over empty.
    assert [page.cell(row=r, column=6).value for r in range(2, page.max_row + 1)] == \
        [None] * len(seats)
    assert "20260926" in r.headers["content-disposition"]


@pytest.mark.asyncio
async def test_a_score_is_read_the_way_the_game_prints_it(client_factory):
    event_id, seats = await recorded_battle(client_factory, 3, 0)
    rows = [{"id": seats[0]["registration_id"], "score": "2M"},
            {"id": seats[1]["registration_id"], "score": "993.7K"},
            {"id": seats[2]["registration_id"], "score": "1,300,000"}]
    async with client_factory() as c:
        r = await upload_result(c, event_id, rows)
    assert r.json()["problems"] == []
    got = {o["name"]: o["score"] for o in r.json()["teams"][0]["outcomes"]}
    assert sorted(got.values(), reverse=True) == [2_000_000, 1_300_000, 993_700]


@pytest.mark.asyncio
async def test_blank_and_zero_are_the_two_ways_of_not_fighting(client_factory):
    event_id, seats = await recorded_battle(client_factory, 3, 0)
    rows = [{"id": seats[0]["registration_id"], "score": "1.4M"},
            {"id": seats[1]["registration_id"], "score": 0},      # listed, never fought
            {"id": seats[2]["registration_id"]}]                  # not in the ranking
    async with client_factory() as c:
        r = await upload_result(c, event_id, rows)
    body = r.json()
    assert body["problems"] == []
    team = body["teams"][0]
    assert (team["fought"], team["listed_zero"], team["absent"]) == (1, 1, 1)
    by_name = {o["name"]: o for o in team["outcomes"]}
    zero = by_name[seats[1]["name"]]
    gone = by_name[seats[2]["name"]]
    assert zero["listed"] is True and zero["participated"] is False and zero["score"] == 0
    assert gone["listed"] is False and gone["participated"] is False and gone["score"] is None
    # All three are starters, so the two who did not fight are the follow-up.
    assert {o["name"] for o in body["no_shows"]} == {seats[1]["name"], seats[2]["name"]}


@pytest.mark.asyncio
async def test_only_a_starter_counts_as_a_no_show(client_factory):
    event_id, seats = await recorded_battle(client_factory, 1, 1)
    rows = [{"id": s["registration_id"], "score": 0} for s in seats]
    async with client_factory() as c:
        r = await upload_result(c, event_id, rows)
    body = r.json()
    assert [o["role"] for o in body["no_shows"]] == ["starter"]


@pytest.mark.asyncio
async def test_a_blank_mark_takes_the_score_s_word(client_factory):
    """Otherwise every row left unticked would contradict the number beside it."""
    event_id, seats = await recorded_battle(client_factory, 2, 0)
    rows = [{"id": seats[0]["registration_id"], "score": "1M"},
            {"id": seats[1]["registration_id"], "score": 0}]
    async with client_factory() as c:
        r = await upload_result(c, event_id, rows)
    body = r.json()
    assert body["problems"] == []
    assert [o["participated"] for o in body["teams"][0]["outcomes"]] == [True, False]


@pytest.mark.asyncio
async def test_a_mark_that_contradicts_the_score_is_reported(client_factory):
    event_id, seats = await recorded_battle(client_factory, 2, 0)
    async with client_factory() as c:
        rows = [{"id": seats[0]["registration_id"], "score": "1M", "participated": "X"},
                {"id": seats[1]["registration_id"], "score": 0}]
        r = await upload_result(c, event_id, rows)
        assert "is marked as not having fought" in " ".join(r.json()["problems"])

        rows = [{"id": seats[0]["registration_id"], "score": 0, "participated": "O"},
                {"id": seats[1]["registration_id"], "score": 0}]
        r = await upload_result(c, event_id, rows)
        assert "but scored zero" in " ".join(r.json()["problems"])


@pytest.mark.asyncio
async def test_a_partial_file_is_refused(client_factory):
    """A result covers the whole roster; a short file would silently zero the rest."""
    event_id, seats = await recorded_battle(client_factory, 4, 0)
    rows = [{"id": seats[0]["registration_id"], "score": "1M"}]
    async with client_factory() as c:
        r = await upload_result(c, event_id, rows)
    assert "3 of the battle's 4 seats are not in the file" in " ".join(r.json()["problems"])


@pytest.mark.asyncio
async def test_an_unreadable_result_records_nothing(client_factory):
    event_id, _ = await recorded_battle(client_factory, 2, 0)
    async with client_factory() as c:
        r = await c.post(f"/bgb/events/{event_id}/results/preview",
                         files={"file": ("r.xlsx", b"not a spreadsheet", "x")})
    assert "could not be opened" in " ".join(r.json()["problems"])


@pytest.mark.asyncio
async def test_rows_cannot_be_added_to_a_result(client_factory):
    event_id, seats = await recorded_battle(client_factory, 2, 0)
    rows = [{"id": s["registration_id"], "score": 0} for s in seats] + \
           [{"name": "Somebody Else", "score": "1M"}]
    async with client_factory() as c:
        r = await upload_result(c, event_id, rows)
    assert "no registration id" in " ".join(r.json()["problems"])


@pytest.mark.asyncio
async def test_applying_a_result_writes_the_scores_and_stamps_the_battle(client_factory):
    event_id, seats = await recorded_battle(client_factory, 3, 0)
    rows = [{"id": seats[0]["registration_id"], "score": "2M"},
            {"id": seats[1]["registration_id"], "score": 0},
            {"id": seats[2]["registration_id"]}]
    async with client_factory() as c:
        preview = (await upload_result(c, event_id, rows)).json()
        applied = await c.post(f"/bgb/events/{event_id}/results/apply", json={
            "fingerprint": preview["fingerprint"], "file_name": "r.xlsx",
            "rows": preview["rows"]})
        assert applied.status_code == 200, applied.text
        assert applied.json()["recorded"] is True
        listed = (await c.get("/bgb/events")).json()
        seats_now = (await c.get(f"/bgb/events/{event_id}")).json()[0]["starters"]

    assert listed[0]["results_at"] is not None
    by_name = {s["name"]: s for s in seats_now}
    assert by_name[seats[0]["name"]]["score"] == 2_000_000
    assert by_name[seats[0]["name"]]["participated"] is True
    assert by_name[seats[1]["name"]]["score"] == 0
    assert by_name[seats[1]["name"]]["participated"] is False
    # Absent from the ranking: no score, but we have looked.
    assert by_name[seats[2]["name"]]["score"] is None
    assert by_name[seats[2]["name"]]["participated"] is False

    async with client_factory.maker() as s:
        entry = await s.scalar(select(AuditLog).where(AuditLog.action == "bgb.result"))
    assert entry.detail["counts"]["A"] == {"fought": 1, "absent": 1, "seats": 3}
    assert len(entry.detail["no_shows"]) == 2


@pytest.mark.asyncio
async def test_a_result_refuses_once_the_roster_has_moved(client_factory):
    event_id, seats = await recorded_battle(client_factory, 2, 0)
    rows = [{"id": s["registration_id"], "score": 0} for s in seats]
    async with client_factory() as c:
        preview = (await upload_result(c, event_id, rows)).json()
        async with client_factory.maker() as s:   # the roster is re-recorded meanwhile
            seat = await s.get(BgbRegistration, seats[0]["registration_id"])
            seat.name = "Renamed"
            await s.commit()
        r = await c.post(f"/bgb/events/{event_id}/results/apply", json={
            "fingerprint": preview["fingerprint"], "rows": preview["rows"]})
    assert r.status_code == 409
    assert "roster changed while you were looking" in r.json()["detail"]
