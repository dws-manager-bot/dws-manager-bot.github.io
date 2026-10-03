"""Domain model for the alliance manager.

Discord snowflakes exceed 32 bits, so every ID that comes from Discord is a
BigInteger, never Integer.
"""
from __future__ import annotations

import enum
import uuid
from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    false,
    func,
    text,
    true,
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


class Player(Base, TimestampMixin):
    """One in-game account, followed across nickname changes.

    The game exposes no stable id and players rename freely, so the id is ours: a
    UUID issued when the account is first recorded. This is not `Member`, which
    is a Discord account; a player need not be on Discord at all.

    Defaults are server-side so a row inserted by hand in psql is complete.
    """

    __tablename__ = "players"

    # Both defaults: the app knows the id before it flushes, and psql gets one too.
    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    # The current nickname. Every name ever seen, this one included, is in player_names.
    name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    # DWS alliance ranks run R1 (newest) .. R5 (leader).
    rank: Mapped[int | None] = mapped_column(Integer)
    industry_level: Mapped[int | None] = mapped_column(Integer)
    # BigInteger: the top total CP is already 1.6 billion, and int4 stops at 2.1.
    bgb_cp: Mapped[int | None] = mapped_column(BigInteger)
    total_cp: Mapped[int | None] = mapped_column(BigInteger)
    # False once they leave the alliance. The row stays, so a return is the same player.
    active: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default=true(), nullable=False
    )
    notes: Mapped[str | None] = mapped_column(Text)

    names: Mapped[list[PlayerName]] = relationship(
        back_populates="player", cascade="all, delete-orphan", order_by="PlayerName.first_seen"
    )

    def __repr__(self) -> str:
        return f"<Player {self.name} R{self.rank}>"


class PlayerName(Base):
    """A nickname a player has been seen under, and between which dates.

    Not unique across players: a name one player drops, another can later take.
    """

    __tablename__ = "player_names"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    player_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("players.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    # Dates of the first and latest data this name was read from.
    first_seen: Mapped[date | None] = mapped_column(Date)
    last_seen: Mapped[date | None] = mapped_column(Date)

    player: Mapped[Player] = relationship(back_populates="names")

    __table_args__ = (UniqueConstraint("player_id", "name", name="uq_player_name"),)


class BgbEvent(Base, TimestampMixin):
    """One Black Gold Battlefield, identified by the day it is fought.

    Registration closes on the Thursday and the roster screenshots arrive on the
    Friday, but the date we file everything under is the battle's own — the same
    `<YYYYMMDD>` the folders on the admin's Mac use.
    """

    __tablename__ = "bgb_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    battle_date: Mapped[date] = mapped_column(Date, nullable=False, unique=True)
    note: Mapped[str | None] = mapped_column(Text)
    # When the result was read in. Null until then, which is what tells "nobody
    # fought" apart from "we have not looked yet".
    results_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # The Discord thread the cards were posted to, once they have been. Kept so
    # the button can link to it and warn before making a second one -- a post to
    # a channel the alliance reads is not something to do twice by accident.
    thread_id: Mapped[int | None] = mapped_column(BigInteger)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    registrations: Mapped[list[BgbRegistration]] = relationship(
        back_populates="event", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<BgbEvent {self.battle_date}>"


class BgbRegistration(Base, TimestampMixin):
    """A seat on one team for one battle. Only the registered are rows.

    `name` and `bgb_cp` are copies taken when the roster was recorded, not
    lookups. The lineup card for a battle has to keep showing the CP the seats
    were drafted on, and the name the member was going by that week, however
    much either has moved since.

    A null `player_id` is a mercenary: hired from another alliance for this one
    battle. They deliberately have no row in `players` — the member import reads
    an absent row as somebody who left, and a mercenary was never here to leave —
    so the copies above are all we ever know of them.
    """

    __tablename__ = "bgb_registrations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    event_id: Mapped[int] = mapped_column(
        ForeignKey("bgb_events.id", ondelete="CASCADE"), nullable=False, index=True
    )
    player_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("players.id", ondelete="CASCADE"), index=True
    )
    # The game runs two teams, each with its own roster of 20 + 10.
    team: Mapped[str] = mapped_column(String(1), nullable=False)
    # "starter" or "substitute" -- the game's own two words for the columns.
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    bgb_cp: Mapped[int | None] = mapped_column(BigInteger)

    # Filled in after the battle, from the result mail's ranking.
    #
    # Three states, and the difference between them is the point: null score
    # with `participated` set means they were not in the ranking at all, and so
    # were dropped from the line-up before the whistle; a score of zero means
    # the game listed them and they never fought. `participated` is null until
    # the result is read, and is the admin's own reading where they disagree
    # with the number -- which is why it is stored rather than derived.
    score: Mapped[int | None] = mapped_column(BigInteger)
    participated: Mapped[bool | None] = mapped_column(Boolean)

    event: Mapped[BgbEvent] = relationship(back_populates="registrations")
    player: Mapped[Player | None] = relationship()

    # A member registers once for a battle, on one team. Mercenaries slip past
    # this, since two nulls do not collide; they are kept apart by name when the
    # sheet is read, which is the only thing telling them apart anyway.
    __table_args__ = (UniqueConstraint("event_id", "player_id", name="uq_bgb_seat"),)

    def __repr__(self) -> str:
        return f"<BgbRegistration {self.name} {self.team}/{self.role}>"


class AttendanceEvent(Base, TimestampMixin):
    """One occasion the alliance turned out for, and was counted at.

    Not `EventDefinition`, which is the bot's calendar -- when a thing happens
    and who to remind. This is the record of who actually showed up, kept so a
    season's rewards can be handed out on something better than memory.

    `kind` is a plain string with no check constraint, so a new sort of event
    needs no migration. "strife_pass" is the first.

    BGB is deliberately not stored here. Its attendance lives on the roster it
    was fought from, because only the registered could attend at all -- and a
    member who was never picked has not missed anything.
    """

    __tablename__ = "attendance_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    held_on: Mapped[date] = mapped_column(Date, nullable=False)
    # The game's own heading, e.g. "Declare war on Lv.6 Strife Pass (East)".
    title: Mapped[str | None] = mapped_column(String(200))
    note: Mapped[str | None] = mapped_column(Text)

    records: Mapped[list[AttendanceRecord]] = relationship(
        back_populates="event", cascade="all, delete-orphan"
    )

    __table_args__ = (UniqueConstraint("kind", "held_on", name="uq_attendance_event"),)

    def __repr__(self) -> str:
        return f"<AttendanceEvent {self.kind} {self.held_on}>"


class AttendanceRecord(Base, TimestampMixin):
    """Whether one member turned out, and what they contributed.

    `merits` is the game's own contribution figure where it was captured, and
    null where it was not -- which is not the same as zero, and is why turning
    up and contributing are two separate columns.

    `online_minutes` is how much of the two-hour war window (11:00-13:00 ST) the
    member was online, 0 to 120. The Members-list screenshots show when someone
    was last seen but never when they arrived, so it counts every minute they
    were not shown to be offline: a best case, not a stopwatch. Null where it
    was never worked out.
    """

    __tablename__ = "attendance_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    event_id: Mapped[int] = mapped_column(
        ForeignKey("attendance_events.id", ondelete="CASCADE"), nullable=False, index=True
    )
    player_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("players.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # The name they were going by that day, which is often not today's.
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    present: Mapped[bool] = mapped_column(Boolean, nullable=False)
    merits: Mapped[int | None] = mapped_column(BigInteger)
    rank: Mapped[int | None] = mapped_column(Integer)
    online_minutes: Mapped[int | None] = mapped_column(SmallInteger)

    event: Mapped[AttendanceEvent] = relationship(back_populates="records")
    player: Mapped[Player] = relationship()

    __table_args__ = (UniqueConstraint("event_id", "player_id", name="uq_attendance_record"),)

    def __repr__(self) -> str:
        return f"<AttendanceRecord {self.name} {'in' if self.present else 'out'}>"


class SeasonAward(Base, TimestampMixin):
    """Which reward tier a member falls in for a season.

    The game hands seasonal rewards out in four fixed bands, and the sizes are
    the game's, not ours: one leader, eight backbone, thirty key players, and
    everybody else a contributor. Only the first three are assigned — the
    contributors are whoever is left, so a member with no row here is one.

    Kept per season, because the alliance is judged afresh each time.
    """

    __tablename__ = "season_awards"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    season: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    player_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("players.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # leader | backbone | key. A contributor has no row: they are the remainder,
    # and writing sixty of them down would make the absence of one meaningful.
    tier: Mapped[str] = mapped_column(String(16), nullable=False)

    player: Mapped[Player] = relationship()

    __table_args__ = (UniqueConstraint("season", "player_id", name="uq_season_award"),)

    def __repr__(self) -> str:
        return f"<SeasonAward {self.season} {self.tier}>"


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


# ------------------------------------------------------------- war planner
#
# The season map's strategy board. Four tables, from the longest-lived down:
# the alliances on the map, who holds what right now, the days a war is fought,
# and the plans drawn for each day. The map itself is static game data and
# lives in the frontend; these hold only what the alliance decides.


class WarAlliance(Base, TimestampMixin):
    """An alliance on the season map, on either camp.

    Colors are unique within a season because the color is how the map says who
    holds what. Two alliances in one color would make the map lie.
    """

    __tablename__ = "war_alliances"
    __table_args__ = (
        UniqueConstraint("season", "name", name="uq_war_alliance_name"),
        UniqueConstraint("season", "color", name="uq_war_alliance_color"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    season: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    tag: Mapped[str | None] = mapped_column(String(16))
    # 1 or 2, the game's own camp numbers (worldcity.belong_eden_camp).
    camp: Mapped[int] = mapped_column(Integer, nullable=False)
    color: Mapped[str] = mapped_column(String(7), nullable=False)
    # The state it comes from: a season camp spans several servers.
    server: Mapped[str | None] = mapped_column(String(16))
    notes: Mapped[str | None] = mapped_column(Text)
    updated_by_id: Mapped[int | None] = mapped_column(BigInteger)
    updated_by_name: Mapped[str | None] = mapped_column(String(100))


class WarHolding(Base):
    """Who holds one territory right now: the board every plan is drawn over.

    An absent row is a neutral territory. Deleting an alliance deletes its rows,
    which is the same thing as its territories going neutral.
    """

    __tablename__ = "war_holdings"

    season: Mapped[int] = mapped_column(Integer, primary_key=True)
    # worldcity id from the game data: a Pyramid, pass, Stronghold or Oasis.
    city_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    alliance_id: Mapped[int] = mapped_column(
        ForeignKey("war_alliances.id", ondelete="CASCADE"), nullable=False, index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    updated_by_id: Mapped[int | None] = mapped_column(BigInteger)
    updated_by_name: Mapped[str | None] = mapped_column(String(100))


class WarDay(Base, TimestampMixin):
    """One day a war is fought, and the plans drawn for it. Usually a Saturday."""

    __tablename__ = "war_days"
    __table_args__ = (UniqueConstraint("season", "day", name="uq_war_day"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    season: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    day: Mapped[date] = mapped_column(Date, nullable=False)
    title: Mapped[str | None] = mapped_column(String(80))
    notes: Mapped[str | None] = mapped_column(Text)
    created_by_id: Mapped[int | None] = mapped_column(BigInteger)
    created_by_name: Mapped[str | None] = mapped_column(String(100))


class WarPlan(Base, TimestampMixin):
    """One admin's draft for a war day, or the day's official plan.

    Same shape as the Pass War line-ups: a draft belongs to one admin, and
    publishing copies it into the official plan rather than moving it, so the
    author keeps working on the draft it came from.

    `doc` holds the scenarios: each has its planned captures and losses and its
    drawings. Every drawing carries its own id, which is what will let two
    admins edit one plan live without overwriting each other.

    `version` goes up on every save. A save that carries an older version was
    made over a copy that has since changed, and is refused rather than allowed
    to silently undo the newer one.
    """

    __tablename__ = "war_plans"
    __table_args__ = (
        UniqueConstraint("day_id", "owner_id", name="uq_war_plan_owner"),
        # NULL owners are distinct to a unique constraint, so the one-official
        # rule needs its own index.
        Index(
            "uq_war_plan_official", "day_id", unique=True,
            postgresql_where=text("owner_id IS NULL"),
            sqlite_where=text("owner_id IS NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    day_id: Mapped[int] = mapped_column(
        ForeignKey("war_days.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # NULL marks the day's official plan.
    owner_id: Mapped[int | None] = mapped_column(BigInteger)
    owner_name: Mapped[str | None] = mapped_column(String(100))
    doc: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    # For the official plan: whose draft it was published from.
    source_id: Mapped[int | None] = mapped_column(Integer)
    source_name: Mapped[str | None] = mapped_column(String(100))
    # A draft its owner has opened to every admin, to edit together live.
    shared: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )
    # For the official plan: when it was last posted to Discord, and where.
    posted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    posted_url: Mapped[str | None] = mapped_column(String(200))
    updated_by_id: Mapped[int | None] = mapped_column(BigInteger)
    updated_by_name: Mapped[str | None] = mapped_column(String(100))
