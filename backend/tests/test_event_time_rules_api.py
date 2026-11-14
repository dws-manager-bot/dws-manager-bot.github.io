"""An event whose runs take turns at two times, and run earlier on Sundays.

Frankenstein Round 2 as the alliance runs it: every 3 days, 23:00 and 19:00
server time by turns, never 23:00 on a Sunday, and the run after a Sunday one
at 23:00. The maths is in test_recurrence; this holds the API to it: the rule is
stored and handed back as sent, and the preview the Events form shows follows it.
"""
from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.ext.compiler import compiles

from dwsbot.api.deps import current_user, get_session, require_admin
from dwsbot.api.routers import events
from dwsbot.db import Base
from dwsbot.schemas import MeOut


@compiles(JSONB, "sqlite")
def _jsonb_on_sqlite(type_, compiler, **kw):  # noqa: ARG001
    return "JSON"


ADMIN = MeOut(discord_id=1, username="Admin", is_admin=True)
ST = ZoneInfo("Etc/GMT+2")

ROUND2 = {
    "key": "frankenstein-round2",
    "name": "Frankenstein Round 2",
    "schedule_type": "rotation",
    "rotation_days": 3,
    "reference_date": "2026-11-13T02:00:00Z",     # midnight ST, the 23:00 run's day
    "start_time": "23:00",
    "alternate_times": ["19:00"],
    "weekday_times": {"6": "19:00"},
    "duration_minutes": 42,
    "timezone": "Etc/GMT+2",
}


@pytest_asyncio.fixture
async def client():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)

    app = FastAPI()
    app.include_router(events.router)

    async def _session():
        async with maker() as s:
            yield s

    async def _admin():
        return ADMIN

    app.dependency_overrides[get_session] = _session
    app.dependency_overrides[current_user] = _admin
    app.dependency_overrides[require_admin] = _admin
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        yield c
    await engine.dispose()


async def test_the_rule_is_stored_and_handed_back(client):
    r = await client.post("/events", json=ROUND2)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["alternate_times"] == ["19:00"]
    assert body["weekday_times"] == {"6": "19:00"}

    r = await client.put(f"/events/{body['id']}", json={**ROUND2, "weekday_times": None})
    assert r.status_code == 200, r.text
    assert r.json()["weekday_times"] is None


async def test_the_preview_takes_turns_and_keeps_sundays_early(client):
    r = await client.post("/events/preview", json=ROUND2)
    assert r.status_code == 200, r.text
    runs = [datetime.fromisoformat(s).astimezone(ST) for s in r.json()]
    assert len(runs) == 10
    for before, after in zip(runs, runs[1:], strict=False):
        assert (after.date() - before.date()).days == 3
        # The turn after a run follows the time it ran at.
        assert after.hour == (19 if before.hour == 23 else 23) or after.weekday() == 6
    assert all(run.hour == 19 for run in runs if run.weekday() == 6)
    assert {run.hour for run in runs} == {19, 23}


async def test_alternating_times_off_a_rotation_are_refused(client):
    weekly = {**ROUND2, "schedule_type": "weekly", "weekdays": [6]}
    r = await client.post("/events", json=weekly)
    assert r.status_code == 422
    assert "need a rotation" in r.text
