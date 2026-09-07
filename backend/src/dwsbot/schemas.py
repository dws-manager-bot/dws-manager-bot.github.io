"""Pydantic request/response models for the backoffice API."""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from croniter import croniter
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    PlainSerializer,
    field_validator,
    model_validator,
)

from .models import ScheduleKind

# A Discord snowflake is ~1.5e18, while JavaScript's Number.MAX_SAFE_INTEGER is
# only ~9.0e15. Sent as a JSON number it silently loses precision in the
# browser -- both on JSON.parse and on the way back -- which yields a valid
# looking but nonexistent channel id and an "Unknown Channel" from Discord.
# Kept as int server-side, always rendered as a string in JSON.
Snowflake = Annotated[
    int,
    PlainSerializer(str, return_type=str, when_used="json-unless-none"),
]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ------------------------------------------------------------- announcements

class AnnouncementBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    enabled: bool = True
    channel_id: Snowflake
    kind: ScheduleKind = ScheduleKind.CRON
    cron_expr: str | None = None
    interval_minutes: int | None = Field(None, ge=1)
    run_at: datetime | None = None
    timezone: str = "Asia/Seoul"
    title: str | None = Field(None, max_length=256)
    body: str = Field(..., min_length=1)
    use_embed: bool = True
    embed_color: str | None = Field(None, pattern=r"^#[0-9a-fA-F]{6}$")
    mention: str | None = None
    event_id: int | None = None
    lead_minutes: int = Field(0, ge=0, le=10080)

    @field_validator("timezone")
    @classmethod
    def _known_timezone(cls, v: str) -> str:
        from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

        try:
            ZoneInfo(v)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError(f"unknown timezone: {v}") from exc
        return v


class AnnouncementCreate(AnnouncementBase):
    """Incoming payload. All the business rules live here, not on the base.

    They must not sit on AnnouncementBase, because AnnouncementOut inherits it:
    a rule like "run_at must be in the future" is true of new input but false
    of a row stored last week, and enforcing it on the way out turns every
    read of that row into a 500.
    """

    @model_validator(mode="after")
    def _schedule_is_complete(self):
        """Reject a schedule the scheduler would silently refuse to register."""
        if self.kind == ScheduleKind.CRON:
            if not self.cron_expr:
                raise ValueError("cron_expr is required when kind is 'cron'")
            if not croniter.is_valid(self.cron_expr):
                raise ValueError(f"invalid cron expression: {self.cron_expr}")
        elif self.kind == ScheduleKind.INTERVAL and not self.interval_minutes:
            raise ValueError("interval_minutes is required when kind is 'interval'")
        elif self.kind == ScheduleKind.ROTATION:
            if not self.interval_minutes:
                raise ValueError("interval_minutes is required when kind is 'rotation'")
            # Stored as minutes, but a rotation repeats in whole days: anything
            # else would be an interval wearing the wrong name.
            if self.interval_minutes % 1440:
                raise ValueError("a rotation must be a whole number of days")
            if not self.run_at:
                raise ValueError("run_at is required when kind is 'rotation': it is the first post")
        elif self.kind == ScheduleKind.ONCE:
            if not self.run_at:
                raise ValueError("run_at is required when kind is 'once'")
            # The scheduler will not register a one-shot whose moment has
            # passed, which looked like a silent no-op in the UI.
            if self.run_at <= datetime.now(UTC):
                raise ValueError("run_at must be in the future")
        elif self.kind == ScheduleKind.EVENT and not self.event_id:
            raise ValueError("event_id is required when kind is 'event'")
        return self


class AnnouncementUpdate(AnnouncementCreate):
    pass


class AnnouncementOut(ORMModel, AnnouncementBase):
    """Outgoing representation: field shapes only, no business rules."""

    id: int
    last_fired_at: datetime | None = None
    last_error: str | None = None
    fire_count: int = 0
    created_by_name: str | None = None
    updated_by_name: str | None = None
    # When the bot will post. Filled from the live scheduler, or derived from
    # the linked event for kind="event".
    next_run_at: datetime | None = None
    # For kind="event" only: when the event itself begins. next_run_at is this
    # minus lead_minutes, and showing both is what makes the offset legible —
    # a lone "21:30" reads as the event's own start time.
    event_starts_at: datetime | None = None


# -------------------------------------------------------------------- events

class EventBase(BaseModel):
    key: str = Field(..., min_length=1, max_length=64, pattern=r"^[a-z0-9][a-z0-9\-_]*$")
    name: str = Field(..., min_length=1, max_length=120)
    description: str | None = None
    enabled: bool = True
    schedule_type: str = Field("weekly", pattern=r"^(weekly|rotation|fixed)$")
    weekdays: list[int] | None = None
    rotation_days: int | None = Field(None, ge=1, le=365)
    reference_date: datetime | None = None
    fixed_dates: list[str] | None = None
    start_time: str | None = Field(None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    duration_minutes: int = Field(60, ge=1)
    timezone: str = "Asia/Seoul"
    signup_enabled: bool = False

    @field_validator("weekdays")
    @classmethod
    def _valid_weekdays(cls, v):
        if v and any(d < 0 or d > 6 for d in v):
            raise ValueError("weekdays must be 0 (Monday) through 6 (Sunday)")
        return v

    @model_validator(mode="after")
    def _schedule_is_complete(self):
        if self.schedule_type == "weekly" and not self.weekdays:
            raise ValueError("weekdays is required when schedule_type is 'weekly'")
        if self.schedule_type == "rotation" and not (self.rotation_days and self.reference_date):
            raise ValueError("rotation_days and reference_date are required for 'rotation'")
        if self.schedule_type == "fixed" and not self.fixed_dates:
            raise ValueError("fixed_dates is required when schedule_type is 'fixed'")
        return self


class SchedulePreviewIn(BaseModel):
    """Just the scheduling half of an announcement, for the 'when' preview."""

    kind: ScheduleKind = ScheduleKind.CRON
    cron_expr: str | None = None
    interval_minutes: int | None = Field(None, ge=1)
    run_at: datetime | None = None
    timezone: str = "Asia/Seoul"


class SchedulePreviewOut(BaseModel):
    description: str
    next_runs: list[datetime] = []
    error: str | None = None


class OccurrenceOut(BaseModel):
    """One upcoming occurrence, after moves and skips are applied."""

    starts_at: datetime
    original_starts_at: datetime
    moved: bool = False
    note: str | None = None
    instance_id: int | None = None


class OccurrenceOverrideIn(BaseModel):
    """Move or skip one date without touching the recurrence rule.

    `starts_at` of None means skip this occurrence entirely.
    """

    original_starts_at: datetime
    starts_at: datetime | None = None
    note: str | None = Field(None, max_length=200)


class EventCreate(EventBase):
    pass


class AuditOut(BaseModel):
    """One line of the change history."""

    id: int
    at: datetime
    actor_name: str | None = None
    action: str
    entity: str | None = None
    entity_id: str | None = None
    detail: dict | None = None


class EventOut(ORMModel, EventBase):
    # EventBase's structural rules are safe to inherit here: they describe the
    # shape of a definition rather than a moment in time, so a stored row that
    # satisfied them at write time still satisfies them at read time.
    id: int
    upcoming: list[datetime] = []
    created_by_name: str | None = None
    updated_by_name: str | None = None


# ------------------------------------------------------------------- members

class MemberOut(ORMModel):
    id: int
    discord_id: Snowflake
    discord_name: str | None = None
    game_name: str | None = None
    rank: int | None = None
    power: int | None = None
    timezone: str | None = None
    active: bool
    notes: str | None = None


class MemberUpdate(BaseModel):
    game_name: str | None = None
    rank: int | None = Field(None, ge=1, le=5)
    power: int | None = Field(None, ge=0)
    timezone: str | None = None
    active: bool | None = None
    notes: str | None = None


# ---------------------------------------------------------------------- meta

class ChannelOut(BaseModel):
    id: Snowflake
    name: str
    category: str | None = None


class RoleOut(BaseModel):
    id: Snowflake
    name: str
    color: str | None = None


class MeOut(BaseModel):
    discord_id: Snowflake
    username: str
    is_admin: bool


class MercIn(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    bgb: int = Field(default=0, ge=0)


class LineupIn(BaseModel):
    order: list[str] = Field(default_factory=list)
    mercs: list[MercIn] = Field(default_factory=list)
    opts: dict = Field(default_factory=dict)
    title: str | None = Field(default=None, max_length=80)


class LineupOut(ORMModel):
    slug: str
    order: list[str]
    mercs: list[MercIn]
    opts: dict
    title: str | None = None
    owner_id: int | None = None
    owner_name: str | None = None
    updated_by_name: str | None = None
    updated_at: datetime | None = None


class LineupSummary(ORMModel):
    slug: str
    title: str | None = None
    owner_id: int | None = None
    owner_name: str | None = None
    updated_by_name: str | None = None
    updated_at: datetime | None = None
    members: int = 0
    mercs: int = 0


class HealthOut(BaseModel):
    status: str
    database: bool
    discord: bool
    scheduled_jobs: int
    bot_user: str | None = None
