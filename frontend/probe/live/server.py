"""A throwaway API for driving the War planner live, end to end.

The real /war router and live hub on SQLite, with stand-ins for /auth/me and
/health, seeded with two alliances, a war day and a draft owned by "Goba".
It never touches the real database: the URL is set here, before anything
reads settings — which matters, because backend/.env points at production.

    backend/.venv/bin/python frontend/probe/live/server.py      # API on :8765
    cd frontend && VITE_API_URL=http://127.0.0.1:8765 \
      npx vite build --outDir /tmp/war-live/dist --emptyOutDir
    python3 -m http.server 8898 --directory /tmp/war-live/dist
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
      --remote-debugging-port=9223 --user-data-dir=/tmp/war-live/chrome about:blank &
    backend/.venv/bin/python frontend/probe/live/drive.py       # two admins, one draft
"""
import asyncio
import datetime as dt
import json
import os
import sys
import tempfile

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
SP = os.path.join(tempfile.gettempdir(), "war-live")
os.makedirs(SP, exist_ok=True)
DB = os.path.join(SP, "e2e.db")
if os.path.exists(DB):
    os.remove(DB)
os.environ.update(
    DISCORD_TOKEN="x", GUILD_ID="1", JWT_SECRET="e2e-secret-" + "x" * 40,
    DATABASE_URL=f"sqlite+aiosqlite:///{DB}",
    CORS_ORIGINS="http://127.0.0.1:8898,http://localhost:8898",
)
sys.path.insert(0, os.path.join(REPO, "backend", "src"))

import uvicorn  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from sqlalchemy.dialects.postgresql import JSONB  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402
from sqlalchemy.ext.compiler import compiles  # noqa: E402
from sqlalchemy.pool import NullPool  # noqa: E402


@compiles(JSONB, "sqlite")
def _jsonb(type_, compiler, **kw):
    return "JSON"


from dwsbot import warlive  # noqa: E402
from dwsbot.api.deps import CurrentUser, get_session  # noqa: E402
from dwsbot.api.routers import warplan  # noqa: E402
from dwsbot.db import Base  # noqa: E402
from dwsbot.models import WarAlliance, WarDay, WarHolding, WarPlan  # noqa: E402
from dwsbot.security import issue_token  # noqa: E402

engine = create_async_engine(os.environ["DATABASE_URL"], poolclass=NullPool)
maker = async_sessionmaker(engine, expire_on_commit=False)


async def seed():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with maker() as s:
        iw = WarAlliance(season=5, name="Iron Wolves", tag="IW", camp=1, color="#2563eb")
        rt = WarAlliance(season=5, name="Red Tide", tag="RT", camp=2, color="#dc2626")
        s.add_all([iw, rt])
        await s.flush()
        s.add_all([WarHolding(season=5, city_id=145, alliance_id=iw.id),
                   WarHolding(season=5, city_id=219, alliance_id=rt.id)])
        day = WarDay(season=5, day=dt.date(2026, 10, 3), title="Strife Pass")
        s.add(day)
        await s.flush()
        plan = WarPlan(day_id=day.id, owner_id=1, owner_name="Goba", version=1,
                       doc={"scenarios": [{"id": "a", "name": "Plan A", "changes": {}, "items": []}]})
        s.add(plan)
        await s.commit()
        return plan.id


plan_id = asyncio.run(seed())
warlive.hub.sessions = maker

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["http://127.0.0.1:8898", "http://localhost:8898"],
                   allow_methods=["*"], allow_headers=["*"])
app.include_router(warplan.router)


async def _session():
    async with maker() as s:
        yield s


app.dependency_overrides[get_session] = _session


@app.get("/auth/me")
async def me(user: CurrentUser):
    return {"discord_id": str(user.discord_id), "username": user.username, "is_admin": user.is_admin}


@app.get("/health")
async def health():
    return {"status": "ok", "database": True, "discord": False, "scheduled_jobs": 0}


with open(os.path.join(SP, "e2e_tokens.json"), "w") as f:
    json.dump({
        "plan": plan_id,
        "goba": issue_token(discord_id=1, username="Goba", is_admin=True),
        "nyx": issue_token(discord_id=3, username="Nyx", is_admin=True),
    }, f)

uvicorn.run(app, host="127.0.0.1", port=8765, log_level="warning")
