"""Credentials the suite must not need.

Importing `dwsbot.discord_bot.bot` constructs the client at module scope, and
the client reads Settings, which requires a token, a guild id and a JWT secret.
On a developer's machine `.env` quietly supplies all three; CI has no `.env`,
so a test that imports the bot passes locally and fails there.

Setting placeholders here, before any test module is imported, makes the two
environments agree. Nothing in the suite talks to Discord, so the values only
have to satisfy validation.
"""
from __future__ import annotations

import os

os.environ.setdefault("DISCORD_TOKEN", "test-token")
os.environ.setdefault("GUILD_ID", "1")
os.environ.setdefault("JWT_SECRET", "x" * 40)
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost/test")
