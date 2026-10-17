"""Gift codes: reading the site's answers, the redeemer's bookkeeping, and the API.

Runs on SQLite, like the players tests. The site itself is a scripted stand-in:
what matters is what the redeemer does with each answer, above all that it never
calls twice for a pair that is finished.
"""
from __future__ import annotations

from datetime import UTC, datetime

import pytest
import pytest_asyncio
from fastapi import FastAPI, HTTPException, status
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.ext.compiler import compiles

from dwsbot import giftcodes
from dwsbot.api.deps import current_user, get_session, require_admin
from dwsbot.api.routers import giftcodes as router
from dwsbot.db import Base
from dwsbot.giftcodes import MAX_ATTEMPTS, Outcome, interpret, run
from dwsbot.models import AppUser, AuditLog, GiftCode, GiftCodeRedemption
from dwsbot.schemas import MeOut


@compiles(JSONB, "sqlite")
def _jsonb_on_sqlite(type_, compiler, **kw):  # noqa: ARG001
    return "JSON"


ADMIN = MeOut(discord_id=1, username="Admin", is_admin=True)
MEMBER = MeOut(discord_id=2, username="Member", is_admin=False)
UID_A, UID_B = "1000000000000001", "1000000000000002"
TOKEN = "00000000-aaaa-4bbb-8ccc-000000000001"


# ---------------------------------------------------------------- the answers

@pytest.mark.parametrize(
    ("body", "outcome"),
    [
        ({"errorCode": "ok", "message": "ok"}, Outcome.OK),
        ({"errorCode": "E004", "message": "gift code not exist"}, Outcome.NOT_FOUND),
        ({"errorCode": "E005", "message": "code expired"}, Outcome.EXPIRED),
        ({"errorCode": "E006", "message": "code already exchanged"}, Outcome.ALREADY),
        ({"errorCode": "E007", "message": "count limit"}, Outcome.EXHAUSTED),
        ({"errorCode": "E009", "message": "in cd"}, Outcome.COOLDOWN),
        ({"errorCode": "E001", "message": "boom"}, Outcome.ERROR),
        ({"errorCode": "E999", "message": "never seen"}, Outcome.ERROR),
        ({"code": 10006, "message": "system fail"}, Outcome.LOGIN),
        ("<html>", Outcome.ERROR),
        (None, Outcome.ERROR),
    ],
)
def test_interpret(body, outcome):
    assert interpret(body)[0] is outcome


def test_an_unrecognised_answer_keeps_what_the_site_said():
    assert interpret({"errorCode": "E999", "message": "never seen"})[1] == "never seen"


# ------------------------------------------------------------------- fixtures

@pytest_asyncio.fixture
async def db():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


async def add_user(db, discord_id, uid=UID_A, *, token=TOKEN, auto=True, name="Goba"):
    async with db() as s:
        u = AppUser(discord_id=discord_id, username=name, game_uid=uid, game_uuid=token,
                    auto_redeem=auto)
        s.add(u)
        await s.commit()
        return u.id


async def add_code(db, code, **extra):
    async with db() as s:
        c = GiftCode(code=code, **extra)
        s.add(c)
        await s.commit()
        return c.id


class Site:
    """A stand-in for the gift-code site: answers from a script, remembers the calls."""

    def __init__(self, script):
        self.script = {k: list(v) for k, v in script.items()}
        self.calls = []

    async def __call__(self, uid, uuid, code):
        self.calls.append((uid, code))
        queue = self.script[(uid, code)] if (uid, code) in self.script else self.script[code]
        outcome, message = queue.pop(0) if len(queue) > 1 else queue[0]
        return outcome, message


async def _no_sleep(_):
    return None


async def go(db, site):
    return await run(db, site, cooldown=0, sleep=_no_sleep)


async def rows(db):
    async with db() as s:
        return list(await s.scalars(select(GiftCodeRedemption)))


# ---------------------------------------------------------------- the redeemer

async def test_a_finished_pair_is_never_called_again(db):
    await add_user(db, 10)
    await add_code(db, "ZOM8IE")
    site = Site({"ZOM8IE": [(Outcome.OK, "ok")]})

    assert await go(db, site) == {"ok": 1}
    assert await go(db, site) == {}
    assert len(site.calls) == 1
    assert [r.state for r in await rows(db)] == ["redeemed"]


async def test_having_it_already_is_final_too(db):
    await add_user(db, 10)
    await add_code(db, "DWDC12LS")
    site = Site({"DWDC12LS": [(Outcome.ALREADY, "code already exchanged")]})

    await go(db, site)
    await go(db, site)
    assert len(site.calls) == 1
    assert (await rows(db))[0].state == "already"


async def test_newest_code_goes_first(db):
    await add_user(db, 10)
    await add_code(db, "OLDER1")
    await add_code(db, "NEWER2")
    site = Site({"OLDER1": [(Outcome.OK, "ok")], "NEWER2": [(Outcome.OK, "ok")]})

    await go(db, site)
    assert [c for _, c in site.calls] == ["NEWER2", "OLDER1"]


async def test_a_used_up_code_is_closed_for_everyone(db):
    a = await add_user(db, 10, UID_A)
    await add_user(db, 11, UID_B, name="Nyx")
    capped = await add_code(db, "MOONCAKE8")
    live = await add_code(db, "LIVE9999")
    site = Site({"MOONCAKE8": [(Outcome.EXHAUSTED, "count limit")],
                 "LIVE9999": [(Outcome.OK, "ok")]})

    summary = await go(db, site)

    # The newer code is tried first; the capped one stops after a single call.
    assert [c for _, c in site.calls].count("MOONCAKE8") == 1
    assert summary["codes_closed"] == 1
    async with db() as s:
        closed = await s.get(GiftCode, capped)
        assert (closed.status, closed.closed_response) == ("exhausted", "count limit")
        assert closed.closed_at is not None
        assert (await s.get(GiftCode, live)).status == "active"
    assert a  # the first account is the one that found it out

    # Closed means closed: a second run does not touch it.
    site.calls.clear()
    await go(db, site)
    assert "MOONCAKE8" not in [c for _, c in site.calls]


async def test_an_expired_code_is_closed(db):
    await add_user(db, 10)
    code = await add_code(db, "DWDC6R4M")
    await go(db, Site({"DWDC6R4M": [(Outcome.EXPIRED, "code expired")]}))
    async with db() as s:
        assert (await s.get(GiftCode, code)).status == "expired"


async def test_an_unknown_code_is_given_up_on_after_a_few_tries(db):
    await add_user(db, 10)
    await add_code(db, "TYPO123")
    site = Site({"TYPO123": [(Outcome.NOT_FOUND, "gift code not exist")]})

    for _ in range(MAX_ATTEMPTS + 2):
        await go(db, site)
    assert len(site.calls) == MAX_ATTEMPTS
    assert (await rows(db))[0].attempts == MAX_ATTEMPTS


async def test_a_refused_login_stops_that_account_only(db):
    bad = await add_user(db, 10, UID_A)
    await add_user(db, 11, UID_B, name="Nyx")
    await add_code(db, "ONE11111")
    await add_code(db, "TWO22222")
    site = Site({
        (UID_A, "ONE11111"): [(Outcome.LOGIN, "system fail")],
        (UID_A, "TWO22222"): [(Outcome.LOGIN, "system fail")],
        (UID_B, "ONE11111"): [(Outcome.OK, "ok")],
        (UID_B, "TWO22222"): [(Outcome.OK, "ok")],
    })

    summary = await go(db, site)

    assert summary == {"login_refused": 1, "ok": 2}
    assert [uid for uid, _ in site.calls].count(UID_A) == 1     # not once per code
    async with db() as s:
        assert (await s.get(AppUser, bad)).game_login_failed_at is not None
    assert all(r.state == "redeemed" for r in await rows(db))   # and no row for the refusal


async def test_a_login_that_works_again_clears_the_warning(db):
    user = await add_user(db, 10)
    await add_code(db, "CODE1111")
    async with db() as s:
        u = await s.get(AppUser, user)
        u.game_login_failed_at = datetime.now(UTC)
        await s.commit()

    await go(db, Site({"CODE1111": [(Outcome.OK, "ok")]}))
    async with db() as s:
        assert (await s.get(AppUser, user)).game_login_failed_at is None


async def test_rate_limiting_is_retried_once_and_costs_no_attempt(db):
    await add_user(db, 10)
    await add_code(db, "BUSY1111")

    site = Site({"BUSY1111": [(Outcome.COOLDOWN, "in cd"), (Outcome.OK, "ok")]})
    await go(db, site)
    assert len(site.calls) == 2
    assert (await rows(db))[0].state == "redeemed"


async def test_still_rate_limited_after_the_retry_leaves_no_trace(db):
    await add_user(db, 10)
    await add_code(db, "BUSY2222")
    site = Site({"BUSY2222": [(Outcome.COOLDOWN, "in cd")]})

    assert await go(db, site) == {"cooldown": 1}
    assert await rows(db) == []


async def test_only_accounts_that_asked_and_can_be_served_are_called(db):
    await add_user(db, 10, UID_A, auto=False)
    await add_user(db, 11, UID_B, token=None, name="Nyx")
    await add_user(db, 12, None, name="Sol")
    await add_code(db, "NOBODY11")
    site = Site({"NOBODY11": [(Outcome.OK, "ok")]})

    assert await go(db, site) == {}
    assert site.calls == []


# ------------------------------------------------------------------------ API

@pytest_asyncio.fixture
async def client_factory(db, monkeypatch):
    monkeypatch.setattr(giftcodes, "start", lambda maker=None: True)
    giftcodes.state.running = False

    def build(user: MeOut):
        app = FastAPI()
        app.include_router(router.router)

        async def _session():
            async with db() as s:
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

    return build


async def test_members_cannot_touch_any_of_it(client_factory):
    async with client_factory(MEMBER) as c:
        for method, path in [("get", "/giftcodes"), ("post", "/giftcodes"),
                             ("get", "/giftcodes/accounts"), ("post", "/giftcodes/run")]:
            assert (await getattr(c, method)(path)).status_code == 403


async def test_register_a_code_and_list_it(client_factory, db):
    async with client_factory(ADMIN) as c:
        r = await c.post("/giftcodes", json={"code": "  ZOM8IE ", "note": "from the game"})
        assert r.status_code == 201, r.text
        assert r.json()["code"] == "ZOM8IE"      # whitespace stripped
        assert r.json()["status"] == "active"
        assert r.json()["source"] == "manual"

        listed = (await c.get("/giftcodes")).json()
        assert [x["code"] for x in listed] == ["ZOM8IE"]
    async with db() as s:
        entry = await s.scalar(select(AuditLog).where(AuditLog.action == "giftcode.create"))
        assert entry.detail == {"name": "ZOM8IE"}


async def test_the_same_code_twice_is_a_conflict_whatever_the_case(client_factory):
    async with client_factory(ADMIN) as c:
        await c.post("/giftcodes", json={"code": "ZOM8IE"})
        for again in ("ZOM8IE", "zom8ie"):
            r = await c.post("/giftcodes", json={"code": again})
            assert r.status_code == 409          # an application error, not a 5xx


@pytest.mark.parametrize("bad", ["", "ab", "has space", "semi;colon", "x" * 41])
async def test_a_code_must_look_like_one(client_factory, bad):
    async with client_factory(ADMIN) as c:
        assert (await c.post("/giftcodes", json={"code": bad})).status_code == 422


async def test_a_stored_code_that_breaks_todays_rules_still_reads_back(client_factory, db):
    """The pattern is on the input only: a row stored before it, or by hand, must list."""
    await add_code(db, "x")
    async with client_factory(ADMIN) as c:
        r = await c.get("/giftcodes")
        assert r.status_code == 200
        assert r.json()[0]["code"] == "x"


async def test_deleting_a_code_removes_its_history(client_factory, db):
    await add_user(db, 10)
    code = await add_code(db, "OOPS1234")
    await go(db, Site({"OOPS1234": [(Outcome.OK, "ok")]}))
    assert len(await rows(db)) == 1

    async with client_factory(ADMIN) as c:
        assert (await c.delete(f"/giftcodes/{code}")).status_code == 204
        assert (await c.delete(f"/giftcodes/{code}")).status_code == 404
    assert await rows(db) == []


async def test_the_list_says_who_is_done_and_who_is_still_owed(client_factory, db):
    await add_user(db, 10, UID_A)
    await add_user(db, 11, UID_B, name="Nyx")
    await add_code(db, "HALFWAY1")
    await go(db, Site({"HALFWAY1": [(Outcome.OK, "ok")]}))
    await add_user(db, 12, "1000000000000003", name="Sol")     # joins afterwards

    async with client_factory(ADMIN) as c:
        item = (await c.get("/giftcodes")).json()[0]
    assert (item["redeemed"], item["waiting"]) == (2, 1)
    assert {r["username"] for r in item["results"]} == {"Goba", "Nyx"}
    assert "uuid" not in str(item)


async def test_a_closed_code_is_waiting_on_nobody(client_factory, db):
    await add_user(db, 10)
    await add_code(db, "CLOSED11", status="expired")
    async with client_factory(ADMIN) as c:
        assert (await c.get("/giftcodes")).json()[0]["waiting"] == 0


async def test_setting_up_an_account_never_echoes_the_token(client_factory, db):
    async with db() as s:
        s.add(AppUser(discord_id=10, username="Goba"))
        await s.commit()
        uid = (await s.scalar(select(AppUser))).id

    async with client_factory(ADMIN) as c:
        r = await c.patch(f"/giftcodes/accounts/{uid}",
                          json={"game_uid": UID_A, "game_uuid": TOKEN, "auto_redeem": True})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["game_uid"] == UID_A
        assert (body["has_login"], body["auto_redeem"]) == (True, True)
        assert TOKEN not in r.text
        assert TOKEN not in (await c.get("/giftcodes/accounts")).text
    async with db() as s:
        assert TOKEN not in str((await s.scalar(select(AuditLog))).detail)


async def test_the_game_id_travels_as_a_string(client_factory, db):
    async with db() as s:
        s.add(AppUser(discord_id=10, username="Goba", game_uid=UID_A))
        await s.commit()
    async with client_factory(ADMIN) as c:
        account = (await c.get("/giftcodes/accounts")).json()[0]
    assert account["game_uid"] == UID_A and isinstance(account["discord_id"], str)


async def test_auto_redeem_needs_both_halves(client_factory, db):
    async with db() as s:
        s.add(AppUser(discord_id=10, username="Goba", game_uid=UID_A))
        await s.commit()
        uid = (await s.scalar(select(AppUser))).id
    async with client_factory(ADMIN) as c:
        r = await c.patch(f"/giftcodes/accounts/{uid}", json={"auto_redeem": True})
        assert r.status_code == 409


async def test_clearing_the_token_switches_auto_redeem_off(client_factory, db):
    uid = await add_user(db, 10)
    async with client_factory(ADMIN) as c:
        r = await c.patch(f"/giftcodes/accounts/{uid}", json={"game_uuid": ""})
        assert r.status_code == 200
        assert (r.json()["has_login"], r.json()["auto_redeem"]) == (False, False)


async def test_a_new_token_clears_the_refusal(client_factory, db):
    uid = await add_user(db, 10)
    async with db() as s:
        u = await s.get(AppUser, uid)
        u.game_login_failed_at = datetime.now(UTC)
        await s.commit()
    async with client_factory(ADMIN) as c:
        before = (await c.get("/giftcodes/accounts")).json()[0]
        assert before["login_failed_at"] is not None
        after = (await c.patch(f"/giftcodes/accounts/{uid}",
                               json={"game_uuid": "00000000-aaaa-4bbb-8ccc-000000000002"})).json()
        assert after["login_failed_at"] is None


async def test_two_accounts_cannot_claim_one_game_id(client_factory, db):
    await add_user(db, 10, UID_A)
    other = await add_user(db, 11, UID_B, name="Nyx")
    async with client_factory(ADMIN) as c:
        r = await c.patch(f"/giftcodes/accounts/{other}", json={"game_uid": UID_A})
        assert r.status_code == 409


@pytest.mark.parametrize("bad", ["abc", "12345", "1000000000000001x", "1" * 21])
async def test_a_game_id_is_digits(client_factory, db, bad):
    uid = await add_user(db, 10)
    async with client_factory(ADMIN) as c:
        assert (await c.patch(f"/giftcodes/accounts/{uid}",
                              json={"game_uid": bad})).status_code == 422


async def test_a_run_needs_someone_to_redeem_for_and_something_to_redeem(client_factory, db):
    async with client_factory(ADMIN) as c:
        assert (await c.post("/giftcodes/run")).status_code == 409      # nobody set up
        await add_user(db, 10)
        assert (await c.post("/giftcodes/run")).status_code == 409      # no codes
        await add_code(db, "READY111")
        r = await c.post("/giftcodes/run")
        assert r.status_code == 202, r.text


async def test_a_second_run_cannot_start_over_the_first(client_factory, db):
    await add_user(db, 10)
    await add_code(db, "READY222")
    giftcodes.state.running = True
    try:
        async with client_factory(ADMIN) as c:
            assert (await c.post("/giftcodes/run")).status_code == 409
            assert (await c.get("/giftcodes/run")).json()["running"] is True
    finally:
        giftcodes.state.running = False
