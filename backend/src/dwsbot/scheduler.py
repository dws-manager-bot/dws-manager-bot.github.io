"""Announcement scheduler.

The `announcements` table is the source of truth. APScheduler holds no durable
state of its own: every job is rebuilt from the database by `reload()`, which
the API calls after any mutation. That keeps the backoffice a plain CRUD app —
it writes a row, asks for a reload, and the schedule is live.
"""
from __future__ import annotations

import logging
from collections.abc import Awaitable
from datetime import datetime, timedelta
from typing import Protocol
from zoneinfo import ZoneInfo

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.date import DateTrigger
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from .cron import cron_trigger
from .db import SessionLocal
from .models import Announcement, ScheduleKind
from .occurrences import Occurrence, resolve_occurrences

log = logging.getLogger(__name__)

# How far ahead the EVENT planner looks, and how often it runs. The window is
# wider than the interval so an occurrence can't slip between two planner runs.
PLANNER_INTERVAL_MINUTES = 15
PLANNER_HORIZON_MINUTES = 90


class Sender(Protocol):
    """Anything that can deliver a rendered announcement to a channel.

    `occurrence` is set only for event-linked announcements, and lets the
    message say that this date was rescheduled and why.
    """

    def __call__(
        self, announcement: Announcement, occurrence: Occurrence | None = None
    ) -> Awaitable[None]: ...


class AnnouncementScheduler:
    def __init__(self, timezone: str = "UTC") -> None:
        self._scheduler = AsyncIOScheduler(timezone=ZoneInfo(timezone))
        self._send: Sender | None = None

    def set_sender(self, send: Sender) -> None:
        self._send = send

    def start(self) -> None:
        if not self._scheduler.running:
            self._scheduler.start()
            self._scheduler.add_job(
                self._plan_event_announcements,
                IntervalTrigger(minutes=PLANNER_INTERVAL_MINUTES),
                id="__event_planner__",
                replace_existing=True,
                next_run_time=datetime.now(self._scheduler.timezone),
            )
            log.info("scheduler started")

    def shutdown(self) -> None:
        if self._scheduler.running:
            self._scheduler.shutdown(wait=False)

    @property
    def jobs(self) -> list:
        return self._scheduler.get_jobs()

    # ------------------------------------------------------------------ load

    async def reload(self) -> int:
        """Rebuild every announcement job from the database. Returns job count."""
        for job in self._scheduler.get_jobs():
            if not job.id.startswith("__"):
                job.remove()

        async with SessionLocal() as session:
            rows = (
                await session.scalars(
                    select(Announcement)
                    .where(Announcement.enabled.is_(True))
                    .options(selectinload(Announcement.event))
                )
            ).all()

        loaded = 0
        for ann in rows:
            try:
                if self._register(ann):
                    loaded += 1
            except Exception:
                # One bad cron expression must not stop the rest from loading.
                log.exception("could not schedule announcement id=%s (%s)", ann.id, ann.name)

        log.info("scheduler reloaded: %d/%d announcements active", loaded, len(rows))
        return loaded

    def _register(self, ann: Announcement) -> bool:
        tz = ZoneInfo(ann.timezone or "UTC")
        job_id = f"ann:{ann.id}"

        if ann.kind == ScheduleKind.CRON:
            if not ann.cron_expr:
                log.warning("announcement %s is CRON but has no expression", ann.id)
                return False
            # Not from_crontab: its day-of-week numbering differs from
            # crontab's, which shifts every weekday by one.
            trigger = cron_trigger(ann.cron_expr, tz)
        elif ann.kind == ScheduleKind.INTERVAL:
            if not ann.interval_minutes or ann.interval_minutes < 1:
                log.warning("announcement %s is INTERVAL but has no interval", ann.id)
                return False
            trigger = IntervalTrigger(minutes=ann.interval_minutes, timezone=tz)
        elif ann.kind == ScheduleKind.ROTATION:
            if not ann.interval_minutes or not ann.run_at:
                log.warning("announcement %s is ROTATION but has no period or first post", ann.id)
                return False
            # start_date is the whole difference from a bare interval: it anchors
            # the cycle, so "every 14 days from the 9th" keeps landing on the
            # 9th, 23rd and 7th rather than on whenever the process last
            # restarted. A first post already past is fine -- APScheduler counts
            # whole periods forward from it.
            trigger = IntervalTrigger(
                minutes=ann.interval_minutes, start_date=ann.run_at, timezone=tz,
            )
        elif ann.kind == ScheduleKind.ONCE:
            if not ann.run_at or ann.run_at <= datetime.now(tz):
                return False
            trigger = DateTrigger(run_date=ann.run_at, timezone=tz)
        elif ann.kind == ScheduleKind.EVENT:
            # Handled by the planner, which creates one-shot jobs per occurrence.
            return True
        else:
            return False

        self._scheduler.add_job(
            self._fire, trigger, id=job_id, args=[ann.id], replace_existing=True,
            misfire_grace_time=300, coalesce=True,
        )
        return True

    # --------------------------------------------------------------- planner

    async def _plan_event_announcements(self) -> None:
        """Queue one-shot jobs for event-linked announcements coming up soon."""
        async with SessionLocal() as session:
            rows = (
                await session.scalars(
                    select(Announcement)
                    .where(
                        Announcement.enabled.is_(True),
                        Announcement.kind == ScheduleKind.EVENT,
                    )
                    .options(selectinload(Announcement.event))
                )
            ).all()

        now = datetime.now(self._scheduler.timezone)
        horizon = now + timedelta(minutes=PLANNER_HORIZON_MINUTES)

        for ann in rows:
            if not ann.event or not ann.event.enabled:
                continue
            # Through resolve_occurrences, so a postponed date is announced at
            # its new time rather than the one the rule would have produced.
            async with SessionLocal() as session:
                upcoming = await resolve_occurrences(session, ann.event, count=5)
            for occ in upcoming:
                occurrence = occ.starts_at
                fire_at = occurrence - timedelta(minutes=ann.lead_minutes)
                if not (now < fire_at <= horizon):
                    continue
                # Deterministic id makes re-planning idempotent: the same
                # occurrence always maps to the same job.
                job_id = f"ann:{ann.id}:{int(occurrence.timestamp())}"
                self._scheduler.add_job(
                    self._fire,
                    DateTrigger(run_date=fire_at),
                    id=job_id,
                    # The occurrence travels with the job so the message can
                    # mention a reschedule; re-resolved at fire time so a note
                    # edited after planning still reaches the post.
                    args=[ann.id, occurrence.isoformat()],
                    replace_existing=True,
                    misfire_grace_time=300,
                )

    # ------------------------------------------------------------------ fire

    async def _fire(self, announcement_id: int, occurrence_iso: str | None = None) -> None:
        if self._send is None:
            log.error("no sender bound; dropping announcement %s", announcement_id)
            return

        async with SessionLocal() as session:
            ann = await session.scalar(
                select(Announcement)
                .where(Announcement.id == announcement_id)
                .options(selectinload(Announcement.event))
            )
            if ann is None or not ann.enabled:
                return
            occurrence = await self._occurrence_for(session, ann, occurrence_iso)
            try:
                await self._send(ann, occurrence)
                ann.last_fired_at = datetime.now(ZoneInfo("UTC"))
                ann.fire_count += 1
                ann.last_error = None
                if ann.kind == ScheduleKind.ONCE:
                    ann.enabled = False   # one-shot rows retire themselves
            except Exception as exc:
                log.exception("announcement %s failed to send", announcement_id)
                ann.last_error = f"{type(exc).__name__}: {exc}"[:2000]
            await session.commit()

    @staticmethod
    async def _occurrence_for(
        session, ann: Announcement, occurrence_iso: str | None
    ) -> Occurrence | None:
        """Find the occurrence this job was queued for, if any."""
        if not occurrence_iso or ann.kind != ScheduleKind.EVENT or not ann.event:
            return None
        target = datetime.fromisoformat(occurrence_iso)
        for candidate in await resolve_occurrences(session, ann.event, count=5):
            if candidate.starts_at == target:
                return candidate
        return None


scheduler = AnnouncementScheduler()
