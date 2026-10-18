"""The applied hive map: admins upload the picture, members only ever read it.

What matters is who may do which, that only a PNG is accepted, and that a member
is handed nothing but the picture and its caption.
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from fastapi import FastAPI, HTTPException, status
from httpx import ASGITransport, AsyncClient
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.ext.compiler import compiles

from dwsbot.api.deps import current_user, get_session, require_admin
from dwsbot.api.routers import hive
from dwsbot.db import Base
from dwsbot.schemas import MeOut


@compiles(JSONB, "sqlite")
def _jsonb_on_sqlite(type_, compiler, **kw):  # noqa: ARG001
    return "JSON"


ADMIN = MeOut(discord_id=1, username="Admin", is_admin=True)
MEMBER = MeOut(discord_id=2, username="Member", is_admin=False)
PNG = b"\x89PNG\r\n\x1a\n" + b"pretend pixels"


@pytest_asyncio.fixture
async def client_factory():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)

    def build(user: MeOut):
        app = FastAPI()
        app.include_router(hive.router)

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

    yield build
    await engine.dispose()


def upload(client, png=PNG, shelters="90", options='{"version": 1}'):
    return client.post(
        "/hive/applied",
        files={"image": ("map.png", png, "image/png")},
        data={"shelters": shelters, "options": options},
    )


@pytest.mark.asyncio
async def test_nothing_applied_yet_is_a_404(client_factory):
    async with client_factory(MEMBER) as c:
        assert (await c.get("/hive/applied")).status_code == 404
        assert (await c.get("/hive/applied/image")).status_code == 404


@pytest.mark.asyncio
async def test_admin_applies_and_member_reads_only_the_picture(client_factory):
    async with client_factory(ADMIN) as admin:
        made = await upload(admin)
        assert made.status_code == 201
        assert made.json()["shelters"] == 90
    async with client_factory(MEMBER) as member:
        caption = (await member.get("/hive/applied")).json()
        assert set(caption) == {"id", "applied_at", "applied_by_name", "shelters", "options"}
        image = await member.get("/hive/applied/image")
        assert image.status_code == 200
        assert image.headers["content-type"] == "image/png"
        assert image.content == PNG


@pytest.mark.asyncio
async def test_a_member_cannot_apply(client_factory):
    async with client_factory(MEMBER) as c:
        assert (await upload(c)).status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize("png, shelters, options", [
    (b"GIF89a....", "90", "{}"),               # not a PNG
    (PNG, "0", "{}"),                          # nobody in it
    (PNG, "90", "not json"),
    (PNG, "90", "[1, 2]"),                     # JSON, but not an object
])
async def test_bad_uploads_are_422(client_factory, png, shelters, options):
    async with client_factory(ADMIN) as c:
        assert (await upload(c, png, shelters, options)).status_code == 422


@pytest.mark.asyncio
async def test_the_latest_is_shown_and_old_ones_are_pruned(client_factory):
    async with client_factory(ADMIN) as c:
        for n in range(hive.KEEP + 3):
            await upload(c, PNG + bytes([n]), shelters=str(n + 1))
        latest = (await c.get("/hive/applied")).json()
        assert latest["shelters"] == hive.KEEP + 3
        assert (await c.get("/hive/applied/image")).content == PNG + bytes([hive.KEEP + 2])
