"""Live War planner editing: the operations, and rooms over a real WebSocket.

The rooms are exercised through Starlette's TestClient against SQLite, with two
admins connected at once. That covers the ordering, permissions, saving and
the REST endpoints that have to agree with a live room. It does not prove
anything about Cloudflare's WebSocket handling in front of the real thing.
"""
from __future__ import annotations

import asyncio
import copy

import pytest
from fastapi import FastAPI, HTTPException, Request, status
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.pool import NullPool
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from dwsbot import warlive
from dwsbot.api.deps import current_user, get_session, require_admin
from dwsbot.api.routers import warplan
from dwsbot.db import Base
from dwsbot.schemas import MeOut, WarDoc
from dwsbot.security import issue_token
from dwsbot.warlive import OpError, apply_op, check_doc


@compiles(JSONB, "sqlite")
def _jsonb_on_sqlite(type_, compiler, **kw):  # noqa: ARG001
    return "JSON"


# ---------------------------------------------------------------- operations

DOC = {"scenarios": [
    {"id": "a", "name": "Plan A", "changes": {"219": 1},
     "items": [{"id": "p", "type": "pin", "x": 1}]},
    {"id": "b", "name": "Plan B", "changes": {}, "items": []},
]}


def test_an_item_is_put_by_id_and_removed_by_id():
    doc = apply_op(DOC, {"t": "item", "s": "a", "item": {"id": "p", "type": "pin", "x": 9}})
    doc = apply_op(doc, {"t": "item", "s": "a", "item": {"id": "q", "type": "note", "text": "hi"}})
    assert doc["scenarios"][0]["items"] == [
        {"id": "p", "type": "pin", "x": 9}, {"id": "q", "type": "note", "text": "hi"}]
    doc = apply_op(doc, {"t": "unitem", "s": "a", "id": "p"})
    assert [i["id"] for i in doc["scenarios"][0]["items"]] == ["q"]
    # The doc passed in is never changed: clients keep a confirmed copy.
    assert DOC["scenarios"][0]["items"] == [{"id": "p", "type": "pin", "x": 1}]


def test_a_waypoint_route_is_a_drawing_like_any_other():
    route = {"id": "r", "type": "route", "points": [[840, 470], [860, 490], [874, 500]]}
    doc = apply_op(DOC, {"t": "item", "s": "b", "item": route})
    assert doc["scenarios"][1]["items"] == [route]


def test_a_line_and_a_pencil_stroke_are_drawings_too():
    line = {"id": "l", "type": "line", "a": [840, 470], "b": [874, 500], "width": 1.2}
    stroke = {"id": "s", "type": "pencil", "width": 0.8,
              "points": [[840.5, 470.25], [851.1, 480.9], [874.02, 500.5]]}
    doc = apply_op(DOC, {"t": "item", "s": "b", "item": line})
    doc = apply_op(doc, {"t": "item", "s": "b", "item": stroke})
    assert doc["scenarios"][1]["items"] == [line, stroke]
    assert check_doc(doc) == doc
    # And a draft holding them saves: the schema knows both kinds.
    assert [i.type for i in WarDoc.model_validate(doc).scenarios[1].items] == ["line", "pencil"]
    with pytest.raises(OpError):
        apply_op(DOC, {"t": "item", "s": "b", "item": {"id": "x", "type": "spray"}})


def test_a_territory_is_planned_cleared_and_sent_neutral():
    doc = apply_op(DOC, {"t": "change", "s": "a", "city": 145, "v": 2})
    doc = apply_op(doc, {"t": "change", "s": "a", "city": 136, "v": None})
    doc = apply_op(doc, {"t": "change", "s": "a", "city": 219, "clear": True})
    assert doc["scenarios"][0]["changes"] == {"145": 2, "136": None}


def test_scenarios_are_added_renamed_placed_and_removed():
    doc = apply_op(DOC, {"t": "scen", "scenario": {"id": "c", "name": "Plan C"}, "at": 1})
    assert [s["id"] for s in doc["scenarios"]] == ["a", "c", "b"]
    doc = apply_op(doc, {"t": "scen", "scenario": {"id": "c", "name": "  Rush east "}})
    assert doc["scenarios"][1]["name"] == "Rush east"
    doc = apply_op(doc, {"t": "unscen", "s": "c"})
    assert [s["id"] for s in doc["scenarios"]] == ["a", "b"]


@pytest.mark.parametrize("op", [
    {"t": "item", "s": "zzz", "item": {"id": "x", "type": "pin"}},
    {"t": "item", "s": "a", "item": {"id": "x", "type": "laser"}},
    {"t": "item", "s": "a", "item": {"type": "pin"}},
    {"t": "change", "s": "a", "city": "east", "v": 1},
    {"t": "change", "s": "a", "city": 219, "v": True},
    {"t": "scen", "scenario": {"id": "c", "name": "   "}},
    {"t": "doc", "doc": {"scenarios": []}},
    {"t": "explode"},
    "not even an object",
])
def test_malformed_operations_are_refused(op):
    with pytest.raises(OpError):
        apply_op(DOC, op)


def test_a_plan_keeps_one_scenario_and_at_most_twelve():
    one = {"scenarios": [DOC["scenarios"][0]]}
    with pytest.raises(OpError):
        apply_op(one, {"t": "unscen", "s": "a"})
    full = {"scenarios": [{"id": str(i), "name": f"P{i}", "changes": {}, "items": []}
                          for i in range(12)]}
    with pytest.raises(OpError):
        apply_op(full, {"t": "scen", "scenario": {"id": "13", "name": "One more"}})


def test_a_whole_doc_replaces_everything_and_is_a_copy():
    new = copy.deepcopy(DOC)
    doc = apply_op({"scenarios": []}, {"t": "doc", "doc": new})
    new["scenarios"][0]["name"] = "changed after"
    assert doc["scenarios"][0]["name"] == "Plan A"


# ---------------------------------------------------------------------- live

OWNER = MeOut(discord_id=1, username="Goba", is_admin=True)
OTHER = MeOut(discord_id=3, username="Nyx", is_admin=True)
MEMBER = MeOut(discord_id=2, username="Member", is_admin=False)
USERS = {u.username: u for u in (OWNER, OTHER, MEMBER)}


def token(user: MeOut) -> str:
    return issue_token(discord_id=user.discord_id, username=user.username, is_admin=user.is_admin)


@pytest.fixture
def live(tmp_path):
    # NullPool: TestClient runs the app on its own event loop, and a pooled
    # aiosqlite connection belongs to the loop that opened it.
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'live.db'}", poolclass=NullPool)

    async def create():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    asyncio.run(create())
    maker = async_sessionmaker(engine, expire_on_commit=False)

    saved = warlive.hub.sessions
    warlive.hub.sessions = maker
    warlive.hub.rooms.clear()
    warlive.hub._loading.clear()

    app = FastAPI()
    app.include_router(warplan.router)

    async def _session():
        async with maker() as s:
            yield s

    async def _user(request: Request):
        return USERS[request.headers.get("x-user", "Goba")]

    async def _admin(request: Request):
        user = await _user(request)
        if not user.is_admin:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "admins only")
        return user

    app.dependency_overrides[get_session] = _session
    app.dependency_overrides[current_user] = _user
    app.dependency_overrides[require_admin] = _admin
    with TestClient(app) as client:
        yield client
    warlive.hub.sessions = saved
    warlive.hub.rooms.clear()


def _as(user: MeOut) -> dict:
    return {"x-user": user.username}


def recv(ws, kind: str, limit: int = 20) -> dict:
    """The next message of this kind, skipping presence and other chatter."""
    for _ in range(limit):
        msg = ws.receive_json()
        if msg["type"] == kind:
            return msg
    raise AssertionError(f"no {kind} message")


def hello(ws, user: MeOut) -> str:
    ws.send_json({"type": "hello", "token": token(user)})
    return recv(ws, "welcome")["you"]


def draft(client, owner=OWNER) -> int:
    day = client.post("/war/days", json={"day": "2026-10-03"}, headers=_as(owner))
    day_id = day.json()["id"] if day.status_code == 201 else client.get(
        "/war/days", headers=_as(owner)).json()[0]["id"]
    doc = {"scenarios": [{"id": "a", "name": "Plan A", "changes": {}, "items": []}]}
    r = client.put(f"/war/days/{day_id}/mine", json={"doc": doc}, headers=_as(owner))
    return r.json()["id"]


PIN = {"id": "p1", "type": "pin", "x": 876, "y": 502, "label": "Gate"}


def test_edits_reach_everyone_in_order_and_save_themselves(live):
    plan = draft(live)
    with live.websocket_connect("/war/live") as a, live.websocket_connect("/war/live") as b:
        hello(a, OWNER)
        hello(b, OTHER)
        a.send_json({"type": "join", "plan": plan})
        assert recv(a, "state")["editable"] is True
        b.send_json({"type": "join", "plan": plan})
        state = recv(b, "state")
        assert state["editable"] is False and [p["name"] for p in state["peers"]] == ["Goba"]
        assert recv(a, "joined")["peer"]["name"] == "Nyx"

        a.send_json({"type": "op", "cid": "c1", "op": {"t": "item", "s": "a", "item": PIN}})
        mine = recv(a, "op")
        theirs = recv(b, "op")
        assert mine["cid"] == "c1" and mine["seq"] == theirs["seq"] == 1
        assert theirs["op"]["item"] == PIN

        # A plain read writes the room back first, so it is never behind.
        got = live.get(f"/war/plans/{plan}", headers=_as(OTHER)).json()
        assert got["doc"]["scenarios"][0]["items"] == [PIN]
        assert got["version"] == 2 and got["updated_by_name"] == "Goba"
        assert got["here"] == 2


def test_someone_elses_draft_is_read_only_until_it_is_shared(live):
    plan = draft(live)
    with live.websocket_connect("/war/live") as a, live.websocket_connect("/war/live") as b:
        hello(a, OWNER)
        nyx = hello(b, OTHER)
        a.send_json({"type": "join", "plan": plan})
        recv(a, "state")
        b.send_json({"type": "join", "plan": plan})
        recv(b, "state")

        b.send_json({"type": "op", "cid": "x", "op": {"t": "item", "s": "a", "item": PIN}})
        assert recv(b, "reject")["cid"] == "x"

        assert live.patch(f"/war/plans/{plan}/share", json={"shared": True},
                          headers=_as(OTHER)).status_code == 403
        r = live.patch(f"/war/plans/{plan}/share", json={"shared": True}, headers=_as(OWNER))
        assert r.json()["shared"] is True
        assert recv(b, "editable")["editable"] is True

        b.send_json({"type": "op", "cid": "y", "op": {"t": "item", "s": "a", "item": PIN}})
        seen, echoed = recv(a, "op"), recv(b, "op")
        assert seen["by"] == echoed["by"] == nyx and echoed["cid"] == "y"
        assert live.get(f"/war/plans/{plan}").json()["doc"]["scenarios"][0]["items"] == [PIN]


def test_cursors_go_to_the_others_only(live):
    plan = draft(live)
    with live.websocket_connect("/war/live") as a, live.websocket_connect("/war/live") as b:
        hello(a, OWNER)
        you = hello(b, OTHER)
        for ws in (a, b):
            ws.send_json({"type": "join", "plan": plan})
            recv(ws, "state")
        b.send_json({"type": "cursor", "x": 876.4, "y": 502.1, "scenario": "a", "sel": None})
        seen = recv(a, "cursor")
        assert (seen["sid"], seen["cursor"], seen["name"]) == (you, [876.4, 502.1], "Nyx")


def test_publishing_takes_the_last_second_of_live_edits(live):
    plan = draft(live)
    with live.websocket_connect("/war/live") as a:
        hello(a, OWNER)
        a.send_json({"type": "join", "plan": plan})
        recv(a, "state")
        a.send_json({"type": "op", "cid": "c", "op": {"t": "item", "s": "a", "item": PIN}})
        recv(a, "op")
        official = live.post(f"/war/plans/{plan}/publish").json()
        assert official["doc"]["scenarios"][0]["items"] == [PIN]
        # The official plan is never edited live, not even by the admin who published it.
        a.send_json({"type": "join", "plan": official["id"]})
        assert recv(a, "state")["editable"] is False


def test_a_stale_save_from_elsewhere_is_refused_and_a_fresh_one_resets_the_room(live):
    plan = draft(live)
    with live.websocket_connect("/war/live") as a:
        hello(a, OWNER)
        a.send_json({"type": "join", "plan": plan})
        recv(a, "state")
        a.send_json({"type": "op", "cid": "c", "op": {"t": "item", "s": "a", "item": PIN}})
        recv(a, "op")
        blank = {"scenarios": [{"id": "a", "name": "Plan A", "changes": {}, "items": []}]}
        # A second window still holding version 1, before the live edit.
        r = live.put(f"/war/days/{live.get('/war/days').json()[0]['id']}/mine",
                     json={"doc": blank, "version": 1})
        assert r.status_code == 409
        r = live.put(f"/war/days/{live.get('/war/days').json()[0]['id']}/mine",
                     json={"doc": blank, "version": 2})
        assert r.status_code == 200
        reset = recv(a, "reset")
        assert reset["doc"]["scenarios"][0]["items"] == [] and reset["version"] == 3


def test_deleting_a_plan_sends_everyone_away(live):
    plan = draft(live)
    with live.websocket_connect("/war/live") as a:
        hello(a, OWNER)
        a.send_json({"type": "join", "plan": plan})
        recv(a, "state")
        assert live.delete(f"/war/plans/{plan}").status_code == 204
        assert recv(a, "gone")["plan"] == plan


@pytest.mark.parametrize(("hello_msg", "headers", "code"), [
    ({"type": "hello", "token": "not-a-token"}, {}, 4401),
    ({"type": "hello", "token": token(MEMBER)}, {}, 4403),
    ({"type": "hello", "token": token(OWNER)}, {"origin": "https://evil.example"}, 4403),
    ({"type": "nothing"}, {}, 4401),
])
def test_only_admins_from_the_site_get_in(live, hello_msg, headers, code):
    with (pytest.raises(WebSocketDisconnect) as closed,
          live.websocket_connect("/war/live", headers=headers) as ws):
        ws.send_json(hello_msg)
        ws.receive_json()
    assert closed.value.code == code
