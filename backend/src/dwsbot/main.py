"""Entrypoint: the Discord gateway client and the HTTP API share one event loop.

Running them together is deliberate. The backoffice's "send test now" button
needs a live gateway connection, and the scheduler needs to reach both the
database and Discord. One process keeps that trivial.

The consequence is that this deployment must stay at replicas: 1 — a second
replica would open a second gateway session and fire every announcement twice.
"""
from __future__ import annotations

import asyncio
import contextlib
import logging
import signal

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .discord_bot.bot import bot
from .scheduler import scheduler

log = logging.getLogger(__name__)


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="DWS Alliance Manager",
        description="Backoffice API for the Dark War Survival alliance Discord bot",
        version="0.1.0",
    )

    # The SPA is served from GitHub Pages, a different origin, so CORS is
    # mandatory rather than optional here.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,      # auth rides in the Authorization header
        allow_methods=["*"],
        allow_headers=["*"],
    )

    from .api.routers import (
        announcements,
        auth,
        events,
        history,
        lineups,
        members,
        meta,
        players,
        setup,
    )

    app.include_router(meta.router)
    app.include_router(auth.router)
    app.include_router(announcements.router)
    app.include_router(events.router)
    app.include_router(members.router)
    app.include_router(players.router)
    app.include_router(history.router)
    app.include_router(setup.router)
    app.include_router(lineups.router)
    return app


app = create_app()


def _report_setup(task: asyncio.Task) -> None:
    """Surface a failed scheduler start-up instead of letting it vanish."""
    if task.cancelled():
        return
    exc = task.exception()
    if exc is not None:
        log.error("scheduler start-up failed", exc_info=exc)
    else:
        log.info("scheduler start-up complete")


async def _run() -> None:
    settings = get_settings()
    logging.basicConfig(
        level=settings.log_level.upper(),
        format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
    )

    scheduler.set_sender(bot.send_announcement)

    config = uvicorn.Config(
        app,
        host=settings.api_host,
        port=settings.api_port,
        log_level=settings.log_level.lower(),
        # On: a request that fails at the edge otherwise leaves no trace
        # anywhere, which made a broken channel id very hard to diagnose.
        access_log=True,
    )
    server = uvicorn.Server(config)

    async def start_scheduler_when_ready() -> None:
        await bot.wait_until_ready()
        scheduler.start()
        await scheduler.reload()

    # Only these two staying alive means "the service is up". If either dies,
    # take the whole process down so the pod restarts cleanly rather than
    # lingering with a bot but no API (or the reverse).
    services = [
        asyncio.create_task(bot.start(settings.discord_token), name="discord"),
        asyncio.create_task(server.serve(), name="api"),
    ]

    # Start-up work, NOT a service: it returns as soon as the schedule is
    # loaded. It must stay out of the wait below, or its ordinary completion
    # would immediately trigger shutdown.
    setup = asyncio.create_task(start_scheduler_when_ready(), name="scheduler")
    setup.add_done_callback(_report_setup)

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        with contextlib.suppress(NotImplementedError):
            loop.add_signal_handler(sig, stop.set)

    done, pending = await asyncio.wait(
        [*services, asyncio.create_task(stop.wait(), name="signal")],
        return_when=asyncio.FIRST_COMPLETED,
    )
    log.info("shutting down: %s finished first", {t.get_name() for t in done})

    scheduler.shutdown()
    server.should_exit = True
    await bot.close()
    for task in (*pending, setup):
        task.cancel()
    await asyncio.gather(*pending, setup, return_exceptions=True)


def main() -> None:
    with contextlib.suppress(KeyboardInterrupt):
        asyncio.run(_run())


if __name__ == "__main__":
    main()
