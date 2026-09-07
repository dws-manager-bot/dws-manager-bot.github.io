"""Domain model for the alliance manager.

Discord snowflakes exceed 32 bits, so every ID that comes from Discord is a
BigInteger, never Integer.
"""
from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy import (
    Enum as SAEnum,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


class ScheduleKind(enum.StrEnum):
    """How an announcement decides its next fire time."""

    CRON = "cron"            # standard 5-field cron, evaluated in `timezone`
    INTERVAL = "interval"    # every N minutes, counted from whenever it loaded
    ROTATION = "rotation"    # every N days, counted from `run_at` -- the first post
    ONCE = "once"            # single shot at `run_at`, then auto-disables
    EVENT = "event"          # derived from a linked EventDefinition occurrence


class SignupStatus(enum.StrEnum):
    YES = "yes"
    MAYBE = "maybe"
    NO = "no"


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class Member(Base, TimestampMixin):
    """One alliance member, linking their Discord account to their in-game identity."""

    __tablename__ = "members"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    discord_id: Mapped[int] = mapped_column(BigInteger, unique=True, index=True, nullable=False)
    discord_name: Mapped[str | None] = mapped_column(String(100))
    game_name: Mapped[str | None] = mapped_column(String(100), index=True)
    # DWS alliance ranks run R1 (newest) .. R5 (leader).
    rank: Mapped[int | None] = mapped_column(Integer)
    power: Mapped[int | None] = mapped_column(BigInteger)
    timezone: Mapped[str | None] = mapped_column(String(64))
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)

    signups: Mapped[list[Signup]] = relationship(back_populates="member")

    def __repr__(self) -> str:
        return f"<Member {self.game_name or self.discord_name} R{self.rank}>"


class Announcement(Base, TimestampMixin):
    """A recurring message the bot posts to a channel on a schedule.

    Rows here are the single source of truth for the scheduler; APScheduler jobs
    are rebuilt from this table rather than persisted separately, so the
    backoffice only ever has to write to Postgres.
    """

    __tablename__ = "announcements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)

    channel_id: Mapped[int] = mapped_column(BigInteger, nullable=False)

    kind: Mapped[ScheduleKind] = mapped_column(
        SAEnum(ScheduleKind, name="schedule_kind", native_enum=False, length=16),
        default=ScheduleKind.CRON,
        nullable=False,
    )
    cron_expr: Mapped[str | None] = mapped_column(String(120))
    # The period, for INTERVAL and ROTATION alike; a rotation stores whole days
    # as minutes so there is one column meaning one thing.
    interval_minutes: Mapped[int | None] = mapped_column(Integer)
    # The moment for ONCE, and the cycle's anchor for ROTATION.
    run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Seoul", nullable=False)

    # Message payload. `body` supports Discord markdown; when `use_embed` is set
    # it is rendered as an embed description instead of plain content.
    title: Mapped[str | None] = mapped_column(String(256))
    body: Mapped[str] = mapped_column(Text, nullable=False)
    use_embed: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    embed_color: Mapped[str | None] = mapped_column(String(7))          # "#RRGGBB"
    # "@everyone", "@here", or a role mention string
    mention: Mapped[str | None] = mapped_column(String(64))

    event_id: Mapped[int | None] = mapped_column(
        ForeignKey("event_definitions.id", ondelete="SET NULL")
    )
    # For EVENT-kind rows: fire this many minutes before the occurrence starts.
    lead_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    last_fired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(Text)
    fire_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # The id is what a byline is really keyed on: names change, ids do not.
    # The stored name is only a fallback for when the bot is offline or the
    # person has left the guild.
    created_by_id: Mapped[int | None] = mapped_column(BigInteger)
    updated_by_id: Mapped[int | None] = mapped_column(BigInteger)
    created_by_name: Mapped[str | None] = mapped_column(String(100))
    updated_by_name: Mapped[str | None] = mapped_column(String(100))


    event: Mapped[EventDefinition | None] = relationship(back_populates="announcements")

    __table_args__ = (Index("ix_announcements_enabled_kind", "enabled", "kind"),)

    def __repr__(self) -> str:
        return f"<Announcement {self.name} {self.kind.value}>"


class EventDefinition(Base, TimestampMixin):
    """A recurring in-game event (Alliance Duel, boss rallies, server events...).

    DWS events rotate rather than sitting on a fixed weekday, so three schedule
    shapes are supported: fixed weekdays, an N-day rotation from a reference
    date, and one-off dates.
    """

    __tablename__ = "event_definitions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # "weekly" -> weekdays, "rotation" -> rotation_days + reference_date, "fixed" -> fixed_dates
    schedule_type: Mapped[str] = mapped_column(String(16), default="weekly", nullable=False)
    weekdays: Mapped[list | None] = mapped_column(JSONB)        # [0=Mon .. 6=Sun]
    rotation_days: Mapped[int | None] = mapped_column(Integer)
    reference_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    fixed_dates: Mapped[list | None] = mapped_column(JSONB)     # ISO date strings

    start_time: Mapped[str | None] = mapped_column(String(5))   # "20:30" local to `timezone`
    duration_minutes: Mapped[int] = mapped_column(Integer, default=60, nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Seoul", nullable=False)

    signup_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # The id is what a byline is really keyed on: names change, ids do not.
    # The stored name is only a fallback for when the bot is offline or the
    # person has left the guild.
    created_by_id: Mapped[int | None] = mapped_column(BigInteger)
    updated_by_id: Mapped[int | None] = mapped_column(BigInteger)
    created_by_name: Mapped[str | None] = mapped_column(String(100))
    updated_by_name: Mapped[str | None] = mapped_column(String(100))


    announcements: Mapped[list[Announcement]] = relationship(back_populates="event")
    instances: Mapped[list[EventInstance]] = relationship(
        back_populates="definition", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<EventDefinition {self.key}>"


class EventInstance(Base, TimestampMixin):
    """A concrete occurrence of an EventDefinition that members can sign up for."""

    __tablename__ = "event_instances"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    definition_id: Mapped[int] = mapped_column(
        ForeignKey("event_definitions.id", ondelete="CASCADE"), nullable=False
    )
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # The moment the recurrence rule produced, which this row stands in for.
    # Set on every instance, so a single occurrence can be moved or skipped
    # without touching the rule and shifting every future date with it.
    # `starts_at` is the time it actually happens; when the two differ, this
    # occurrence has been rescheduled.
    original_starts_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), index=True
    )
    override_note: Mapped[str | None] = mapped_column(String(200))

    # Set once the signup post exists, so the bot can edit it in place.
    channel_id: Mapped[int | None] = mapped_column(BigInteger)
    message_id: Mapped[int | None] = mapped_column(BigInteger)

    definition: Mapped[EventDefinition] = relationship(back_populates="instances")
    signups: Mapped[list[Signup]] = relationship(
        back_populates="instance", cascade="all, delete-orphan"
    )

    __table_args__ = (UniqueConstraint("definition_id", "starts_at", name="uq_instance_slot"),)


class Signup(Base, TimestampMixin):
    __tablename__ = "signups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    instance_id: Mapped[int] = mapped_column(
        ForeignKey("event_instances.id", ondelete="CASCADE"), nullable=False
    )
    member_id: Mapped[int] = mapped_column(
        ForeignKey("members.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[SignupStatus] = mapped_column(
        SAEnum(SignupStatus, name="signup_status", native_enum=False, length=8), nullable=False
    )

    instance: Mapped[EventInstance] = relationship(back_populates="signups")
    member: Mapped[Member] = relationship(back_populates="signups")

    __table_args__ = (UniqueConstraint("instance_id", "member_id", name="uq_signup_once"),)


class AppUser(Base, TimestampMixin):
    """Someone permitted to sign in to the backoffice.

    Populated on first successful Discord OAuth login; `is_admin` is refreshed
    from live guild roles on every login rather than trusted from the row.
    """

    __tablename__ = "app_users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    discord_id: Mapped[int] = mapped_column(BigInteger, unique=True, index=True, nullable=False)
    username: Mapped[str | None] = mapped_column(String(100))
    avatar: Mapped[str | None] = mapped_column(String(128))
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class WarLineup(Base, TimestampMixin):
    """The alliance's Pass Occupation War line-up — one shared plan.

    Two kinds share the table. "official" is the published plan every member
    loads; "draft:<discord_id>" is one officer's working copy. Publishing copies a
    draft into "official" rather than moving it, so nobody's work is consumed by
    someone else picking a different plan.

    `order` is the priority list of member names, which is the whole point: it is a
    hand-tuned ordering, not derivable from BGB CP, and mercenaries have no CP to
    rank by at all.
    """

    __tablename__ = "war_lineups"

    slug: Mapped[str] = mapped_column(String(64), primary_key=True)
    # NULL marks the published plan everyone loads; a draft belongs to one officer,
    # so publishing never destroys the draft it was copied from.
    owner_id: Mapped[int | None] = mapped_column(BigInteger, index=True)
    owner_name: Mapped[str | None] = mapped_column(String(100))
    title: Mapped[str | None] = mapped_column(String(80))
    order: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    mercs: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    opts: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    updated_by_id: Mapped[int | None] = mapped_column(BigInteger)
    updated_by_name: Mapped[str | None] = mapped_column(String(100))


class AuditLog(Base):
    """Append-only record of backoffice mutations."""

    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    actor_discord_id: Mapped[int | None] = mapped_column(BigInteger)
    actor_name: Mapped[str | None] = mapped_column(String(100))
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    entity: Mapped[str | None] = mapped_column(String(64))
    entity_id: Mapped[str | None] = mapped_column(String(64))
    detail: Mapped[dict | None] = mapped_column(JSONB)
