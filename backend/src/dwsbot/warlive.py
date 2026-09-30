"""Live War planner rooms: several admins on one plan at once.

While anyone has a plan open, its doc is held here in memory and every edit
arrives as a small operation — put this drawing, remove that one, plan this
territory, rename that scenario. The room applies operations in the order they
arrive, gives each a sequence number, and sends it to everyone in the room, the
sender included. Every client applies the same operations in the same order,
which is what keeps them agreeing; a client shows its own unconfirmed edits on
top until they come back.

Operations are whole objects, so when two admins move the same arrow at once
the one the room saw second wins, for everybody. That is the only conflict
there is, and it is the right outcome for a drawing.

The room writes itself back a moment after the edits stop, and whenever
something outside it needs the current doc (publishing, a plain read). If the
row changed underneath — a save from a client that could not connect live —
the room reloads it and tells everyone rather than writing over it.

This works in memory because the deployment is one process (replicas: 1, for
the Discord gateway); a second replica would need a shared broker instead.
"""
from __future__ import annotations

import asyncio
import contextlib
import copy
import json
import logging
import secrets
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import func, update

from .db import SessionLocal
from .models import WarDay, WarPlan

log = logging.getLogger(__name__)

MAX_DOC_BYTES = 1_000_000
MAX_SCENARIOS = 12
MAX_ITEMS = 1500
MAX_CHANGES = 400
ITEM_TYPES = frozenset({"arrow", "line", "pencil", "pin", "route", "sticker", "note", "stamp"})

# Seconds of quiet before a room writes itself back.
SAVE_AFTER = 1.2

# Cursor colors, handed out by who joined, so two admins never share one.
PEER_COLORS = (
    "#f472b6", "#22d3ee", "#a3e635", "#fb923c", "#c084fc", "#facc15", "#34d399", "#60a5fa",
)


class OpError(ValueError):
    """An operation that is malformed, or would break a plan's limits."""


# ---------------------------------------------------------------- operations

def _check_id(value: Any, what: str) -> str:
    if not isinstance(value, str) or not 1 <= len(value) <= 40:
        raise OpError(f"{what} needs an id")
    return value


def _check_item(item: Any) -> dict:
    if not isinstance(item, dict):
        raise OpError("a drawing must be an object")
    _check_id(item.get("id"), "a drawing")
    if item.get("type") not in ITEM_TYPES:
        raise OpError("unknown kind of drawing")
    return item


def _check_changes(changes: Any) -> dict:
    if not isinstance(changes, dict) or len(changes) > MAX_CHANGES:
        raise OpError("a scenario can change at most 400 territories")
    for key, value in changes.items():
        if not str(key).isdigit():
            raise OpError("territory ids must be numbers")
        if value is not None and (isinstance(value, bool) or not isinstance(value, int)):
            raise OpError("a territory goes to an alliance id, or to nobody")
    return dict(changes)


def _check_name(value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        raise OpError("a scenario needs a name")
    return value.strip()[:40]


def _check_scenario(s: Any) -> dict:
    if not isinstance(s, dict):
        raise OpError("a scenario must be an object")
    items = s.get("items") or []
    if not isinstance(items, list) or len(items) > MAX_ITEMS:
        raise OpError("too many drawings in one scenario")
    out = {
        "id": _check_id(s.get("id"), "a scenario"),
        "name": _check_name(s.get("name") or "Plan"),
        "changes": _check_changes(s.get("changes") or {}),
        "items": [_check_item(i) for i in items],
    }
    if s.get("notes"):
        out["notes"] = str(s["notes"])[:4000]
    return out


def check_doc(doc: Any) -> dict:
    if not isinstance(doc, dict) or not isinstance(doc.get("scenarios"), list):
        raise OpError("a plan must have scenarios")
    scenarios = [_check_scenario(s) for s in doc["scenarios"]]
    if not 1 <= len(scenarios) <= MAX_SCENARIOS:
        raise OpError("a plan has between 1 and 12 scenarios")
    if len({s["id"] for s in scenarios}) != len(scenarios):
        raise OpError("two scenarios share an id")
    return {"scenarios": scenarios}


def apply_op(doc: dict, op: Any) -> dict:
    """The doc with one operation applied; the doc passed in is not changed.

    frontend/src/warplan/ops.js is the same function in JavaScript. The two
    must agree exactly, or clients drift from the room.
    """
    if not isinstance(op, dict):
        raise OpError("an operation must be an object")
    kind = op.get("t")
    scenarios = list(doc.get("scenarios", []))

    def at(sid: Any) -> int:
        for i, s in enumerate(scenarios):
            if s.get("id") == sid:
                return i
        raise OpError("that scenario is gone")

    if kind == "doc":
        return copy.deepcopy(check_doc(op.get("doc")))

    if kind in ("item", "unitem", "change"):
        i = at(op.get("s"))
        s = dict(scenarios[i])
        if kind == "item":
            item = _check_item(op.get("item"))
            items = list(s.get("items", []))
            for k, existing in enumerate(items):
                if existing.get("id") == item["id"]:
                    items[k] = item
                    break
            else:
                if len(items) >= MAX_ITEMS:
                    raise OpError("too many drawings in one scenario")
                items.append(item)
            s["items"] = items
        elif kind == "unitem":
            s["items"] = [x for x in s.get("items", []) if x.get("id") != op.get("id")]
        else:
            city = str(op.get("city", ""))
            changes = dict(s.get("changes", {}))
            if op.get("clear"):
                changes.pop(city, None)
            else:
                changes[city] = op.get("v")
            s["changes"] = _check_changes(changes)
        scenarios[i] = s

    elif kind == "scen":
        data = op.get("scenario")
        if not isinstance(data, dict):
            raise OpError("a scenario must be an object")
        sid = _check_id(data.get("id"), "a scenario")
        existing = next((i for i, s in enumerate(scenarios) if s.get("id") == sid), -1)
        if existing >= 0:
            s = dict(scenarios[existing])
            if "name" in data:
                s["name"] = _check_name(data["name"])
            if "notes" in data:
                s["notes"] = str(data["notes"] or "")[:4000]
            if "changes" in data:
                s["changes"] = _check_changes(data["changes"])
            if "items" in data:
                s["items"] = _check_scenario({**s, "items": data["items"]})["items"]
            scenarios[existing] = s
        else:
            if len(scenarios) >= MAX_SCENARIOS:
                raise OpError("a plan has at most 12 scenarios")
            s = _check_scenario(data)
            pos = op.get("at")
            if isinstance(pos, int) and not isinstance(pos, bool) and 0 <= pos <= len(scenarios):
                scenarios.insert(pos, s)
            else:
                scenarios.append(s)

    elif kind == "unscen":
        i = at(op.get("s"))
        if len(scenarios) <= 1:
            raise OpError("a plan keeps at least one scenario")
        del scenarios[i]

    else:
        raise OpError("unknown operation")

    return {**doc, "scenarios": scenarios}


# --------------------------------------------------------------------- rooms

@dataclass
class Client:
    """One open connection: an admin with the planner open in one tab."""

    sid: str
    user_id: int
    name: str
    color: str = "#fbbf24"
    plan_id: int | None = None
    scenario: str | None = None
    cursor: list | None = None
    sel: str | None = None
    outbox: asyncio.Queue = field(default_factory=asyncio.Queue)

    def send(self, message: dict) -> None:
        # Queued, never awaited here: the order messages are queued in is the
        # order the client receives them, whoever else is slow.
        self.outbox.put_nowait(message)

    def peer(self) -> dict:
        return {"sid": self.sid, "id": str(self.user_id), "name": self.name, "color": self.color,
                "scenario": self.scenario, "cursor": self.cursor, "sel": self.sel}


@dataclass
class Room:
    plan_id: int
    day_id: int
    owner_id: int | None
    shared: bool
    doc: dict
    version: int
    seq: int = 0
    dirty: bool = False
    saved_seq: int = 0
    last_by: tuple[int, str] | None = None
    saver: asyncio.Task | None = None
    clients: dict[str, Client] = field(default_factory=dict)

    def editable(self, user_id: int) -> bool:
        # The official plan changes only by publishing a draft over it.
        if self.owner_id is None:
            return False
        return self.owner_id == user_id or self.shared

    def broadcast(self, message: dict, skip: str | None = None) -> None:
        for c in self.clients.values():
            if c.sid != skip:
                c.send(message)


class Hub:
    def __init__(self, sessions=SessionLocal) -> None:
        self.sessions = sessions
        self.rooms: dict[int, Room] = {}
        self._loading: dict[int, asyncio.Lock] = {}

    # --------------------------------------------------------- lifecycle

    def connect(self, user_id: int, name: str) -> Client:
        return Client(sid=secrets.token_hex(6), user_id=user_id, name=name)

    def here(self, plan_id: int) -> int:
        room = self.rooms.get(plan_id)
        return len({c.user_id for c in room.clients.values()}) if room else 0

    async def _load(self, plan_id: int, season: int | None) -> Room | None:
        """The plan as stored; None if it is gone, or (given a season) not this season's."""
        async with self.sessions() as session:
            row = await session.get(WarPlan, plan_id)
            if row is None:
                return None
            day = await session.get(WarDay, row.day_id)
            if day is None or (season is not None and day.season != season):
                return None
            try:
                doc = check_doc(row.doc)
            except OpError:
                doc = {"scenarios": [{"id": "a", "name": "Plan A", "changes": {}, "items": []}]}
            return Room(plan_id=row.id, day_id=row.day_id, owner_id=row.owner_id,
                        shared=bool(row.shared), doc=doc, version=row.version)

    async def join(self, client: Client, plan_id: int, season: int) -> None:
        await self.leave(client)
        lock = self._loading.setdefault(plan_id, asyncio.Lock())
        async with lock:
            room = self.rooms.get(plan_id)
            if room is None:
                room = await self._load(plan_id, season)
                if room is None:
                    client.send({"type": "gone", "plan": plan_id})
                    return
                self.rooms[plan_id] = room
        used = {c.color for c in room.clients.values()}
        client.color = next((c for c in PEER_COLORS if c not in used), PEER_COLORS[0])
        client.plan_id = plan_id
        client.cursor = None
        client.sel = None
        room.clients[client.sid] = client
        client.send({
            "type": "state", "plan": plan_id, "doc": room.doc, "version": room.version,
            "seq": room.seq, "editable": room.editable(client.user_id), "you": client.sid,
            "color": client.color,
            "peers": [c.peer() for c in room.clients.values() if c.sid != client.sid],
        })
        room.broadcast({"type": "joined", "plan": plan_id, "peer": client.peer()}, skip=client.sid)
        self._day_presence(room.day_id)

    async def leave(self, client: Client) -> None:
        room = self.rooms.get(client.plan_id) if client.plan_id is not None else None
        client.plan_id = None
        if room is None or room.clients.pop(client.sid, None) is None:
            return
        room.broadcast({"type": "left", "plan": room.plan_id, "sid": client.sid})
        self._day_presence(room.day_id)
        if not room.clients:
            await self.flush(room.plan_id)
            # Someone may have joined while that save was in flight.
            if not room.clients and self.rooms.get(room.plan_id) is room:
                del self.rooms[room.plan_id]

    def _day_presence(self, day_id: int) -> None:
        """Who is on this war day, and on which plan — for the plan bar."""
        people = [
            {"sid": c.sid, "id": str(c.user_id), "name": c.name, "color": c.color,
             "plan": r.plan_id}
            for r in self.rooms.values() if r.day_id == day_id
            for c in r.clients.values()
        ]
        for r in self.rooms.values():
            if r.day_id == day_id:
                r.broadcast({"type": "here", "day": day_id, "people": people})

    # ------------------------------------------------------------ editing

    def op(self, client: Client, cid: Any, op: Any) -> None:
        room = self.rooms.get(client.plan_id) if client.plan_id is not None else None
        if room is None:
            client.send({"type": "reject", "cid": cid, "reason": "That plan is not open"})
            return
        if not room.editable(client.user_id):
            client.send({"type": "reject", "cid": cid, "reason": "This plan is read only for you"})
            return
        try:
            doc = apply_op(room.doc, op)
        except OpError as exc:
            client.send({"type": "reject", "cid": cid, "reason": str(exc)})
            return
        if len(json.dumps(doc)) > MAX_DOC_BYTES:
            client.send({"type": "reject", "cid": cid, "reason": "that plan is too large"})
            return
        room.doc = doc
        room.seq += 1
        room.dirty = True
        room.last_by = (client.user_id, client.name)
        room.broadcast({"type": "op", "plan": room.plan_id, "seq": room.seq, "op": op,
                        "cid": cid, "by": client.sid})
        self._schedule(room)

    def cursor(self, client: Client, x: Any, y: Any, scenario: Any, sel: Any) -> None:
        room = self.rooms.get(client.plan_id) if client.plan_id is not None else None
        if room is None:
            return
        ok = isinstance(x, (int, float)) and isinstance(y, (int, float))
        client.cursor = [round(float(x), 2), round(float(y), 2)] if ok else None
        client.scenario = scenario if isinstance(scenario, str) else None
        client.sel = sel if isinstance(sel, str) else None
        room.broadcast({"type": "cursor", "plan": room.plan_id, **client.peer()}, skip=client.sid)

    # ------------------------------------------------------------- saving

    def _schedule(self, room: Room) -> None:
        if room.saver and not room.saver.done():
            room.saver.cancel()
        room.saver = asyncio.get_running_loop().create_task(self._save_later(room))

    async def _save_later(self, room: Room) -> None:
        with contextlib.suppress(asyncio.CancelledError):
            await asyncio.sleep(SAVE_AFTER)
            await self._persist(room)

    async def _persist(self, room: Room) -> None:
        if not room.dirty:
            return
        doc, seq, version = room.doc, room.seq, room.version
        room.dirty = False
        by_id, by_name = room.last_by or (None, None)
        try:
            async with self.sessions() as session:
                result = await session.execute(
                    update(WarPlan)
                    .where(WarPlan.id == room.plan_id, WarPlan.version == version)
                    .values(doc=doc, version=version + 1, updated_by_id=by_id,
                            updated_by_name=by_name, updated_at=func.now())
                )
                await session.commit()
        except Exception:
            room.dirty = True
            log.exception("could not save live plan %s", room.plan_id)
            return
        if result.rowcount == 0:
            # Saved from somewhere else while this room held it: take that
            # version rather than write over it.
            await self.reload(room.plan_id, "This plan was saved from somewhere else — "
                                            "showing that version.")
            return
        room.version = version + 1
        room.saved_seq = seq
        if room.seq != seq:
            room.dirty = True
        room.broadcast({"type": "saved", "plan": room.plan_id, "version": room.version, "seq": seq})

    async def flush(self, plan_id: int) -> None:
        """Write a room back now, if it holds anything unsaved."""
        room = self.rooms.get(plan_id)
        if room is None or not room.dirty:
            return
        if room.saver and not room.saver.done():
            room.saver.cancel()
        await self._persist(room)

    # --------------------------------------------------- changes from REST

    async def reload(self, plan_id: int, reason: str | None = None) -> None:
        """The row changed outside the room (a save, a publish): show it to everyone."""
        room = self.rooms.get(plan_id)
        if room is None:
            return
        fresh = await self._load(plan_id, season=None)
        if fresh is None:
            self.gone(plan_id)
            return
        if room.saver and not room.saver.done():
            room.saver.cancel()
        room.doc, room.version, room.shared = fresh.doc, fresh.version, fresh.shared
        room.dirty = False
        room.seq += 1
        for c in room.clients.values():
            c.send({"type": "reset", "plan": plan_id, "doc": room.doc, "version": room.version,
                    "seq": room.seq, "editable": room.editable(c.user_id), "reason": reason})

    def gone(self, plan_id: int) -> None:
        room = self.rooms.pop(plan_id, None)
        if room is None:
            return
        if room.saver and not room.saver.done():
            room.saver.cancel()
        for c in room.clients.values():
            c.plan_id = None
            c.send({"type": "gone", "plan": plan_id})
        self._day_presence(room.day_id)

    def set_shared(self, plan_id: int, shared: bool) -> None:
        room = self.rooms.get(plan_id)
        if room is None:
            return
        room.shared = shared
        for c in room.clients.values():
            c.send({"type": "editable", "plan": plan_id, "editable": room.editable(c.user_id),
                    "shared": shared})


hub = Hub()

