"""Validation guards that keep unschedulable rows out of the database."""
from __future__ import annotations

from datetime import UTC

import pytest
from pydantic import ValidationError

from dwsbot.models import ScheduleKind
from dwsbot.schemas import AnnouncementCreate, EventCreate

BASE = dict(name="Daily reset", channel_id=123456789012345678, body="Reset is here")


def test_cron_announcement_is_accepted():
    ann = AnnouncementCreate(**BASE, kind=ScheduleKind.CRON, cron_expr="0 9 * * *")
    assert ann.cron_expr == "0 9 * * *"


def test_cron_kind_requires_an_expression():
    with pytest.raises(ValidationError, match="cron_expr is required"):
        AnnouncementCreate(**BASE, kind=ScheduleKind.CRON)


def test_malformed_cron_is_rejected_before_it_reaches_the_scheduler():
    with pytest.raises(ValidationError, match="invalid cron expression"):
        AnnouncementCreate(**BASE, kind=ScheduleKind.CRON, cron_expr="99 99 * * *")


def test_interval_kind_requires_minutes():
    with pytest.raises(ValidationError, match="interval_minutes is required"):
        AnnouncementCreate(**BASE, kind=ScheduleKind.INTERVAL)


def test_event_kind_requires_an_event():
    with pytest.raises(ValidationError, match="event_id is required"):
        AnnouncementCreate(**BASE, kind=ScheduleKind.EVENT)


def test_unknown_timezone_is_rejected():
    with pytest.raises(ValidationError, match="unknown timezone"):
        AnnouncementCreate(
            **BASE, kind=ScheduleKind.CRON, cron_expr="0 9 * * *", timezone="Mars/Olympus"
        )


def test_embed_color_must_be_a_hex_triplet():
    with pytest.raises(ValidationError):
        AnnouncementCreate(
            **BASE, kind=ScheduleKind.CRON, cron_expr="0 9 * * *", embed_color="red"
        )


def test_weekly_event_requires_weekdays():
    with pytest.raises(ValidationError, match="weekdays is required"):
        EventCreate(key="duel", name="Alliance Duel", schedule_type="weekly")


def test_rotation_event_requires_reference_date():
    with pytest.raises(ValidationError, match="reference_date"):
        EventCreate(key="duel", name="Alliance Duel", schedule_type="rotation", rotation_days=5)


def test_event_key_must_be_url_safe():
    with pytest.raises(ValidationError):
        EventCreate(key="Alliance Duel!", name="x", schedule_type="weekly", weekdays=[0])


def test_weekday_range_is_enforced():
    with pytest.raises(ValidationError, match="0 \\(Monday\\) through 6"):
        EventCreate(key="duel", name="x", schedule_type="weekly", weekdays=[7])


# --------------------------------------------------------------- snowflakes

JS_MAX_SAFE_INT = 9007199254740991
REAL_CHANNEL_ID = 1498289516216193194   # a real PoU channel; ~166x the JS limit


def test_snowflake_is_larger_than_javascript_can_represent():
    """The premise of the bug: a snowflake cannot survive a JS number."""
    assert REAL_CHANNEL_ID > JS_MAX_SAFE_INT
    # This is what Number() does to it in the browser.
    assert int(float(REAL_CHANNEL_ID)) != REAL_CHANNEL_ID


def test_channel_id_serializes_to_json_as_a_string():
    """Sent as a JSON number it would round in the browser and point nowhere."""
    ann = AnnouncementCreate(
        name="Daily reset", channel_id=REAL_CHANNEL_ID, body="x",
        kind=ScheduleKind.CRON, cron_expr="0 9 * * *",
    )
    dumped = ann.model_dump(mode="json")
    assert dumped["channel_id"] == "1498289516216193194"
    assert isinstance(dumped["channel_id"], str)


def test_channel_id_accepts_a_string_and_keeps_full_precision():
    ann = AnnouncementCreate(
        name="Daily reset", channel_id="1498289516216193194", body="x",
        kind=ScheduleKind.CRON, cron_expr="0 9 * * *",
    )
    assert ann.channel_id == REAL_CHANNEL_ID          # int server-side
    assert str(ann.channel_id) == "1498289516216193194"


def test_channel_out_also_serializes_as_a_string():
    from dwsbot.schemas import ChannelOut

    out = ChannelOut(id=REAL_CHANNEL_ID, name="bot-heaven").model_dump(mode="json")
    assert out["id"] == "1498289516216193194"


def test_member_discord_id_serializes_as_a_string():
    from dwsbot.schemas import MemberOut

    out = MemberOut(
        id=1, discord_id=REAL_CHANNEL_ID, active=True
    ).model_dump(mode="json")
    assert out["discord_id"] == "1498289516216193194"


# ------------------------------------------------------------ one-shot time

def test_one_shot_in_the_past_is_rejected():
    """The scheduler silently refuses these, so they must not be storable."""
    from datetime import datetime, timedelta

    with pytest.raises(ValidationError, match="run_at must be in the future"):
        AnnouncementCreate(
            **BASE, kind=ScheduleKind.ONCE,
            run_at=datetime.now(UTC) - timedelta(hours=1),
        )


def test_one_shot_in_the_future_is_accepted():
    from datetime import datetime, timedelta

    when = datetime.now(UTC) + timedelta(hours=1)
    ann = AnnouncementCreate(**BASE, kind=ScheduleKind.ONCE, run_at=when)
    assert ann.run_at == when


# ------------------------------------ output models must never reject storage

def test_reading_back_a_past_one_shot_does_not_raise():
    """A row stored last week must stay readable forever.

    Regression: the "run_at must be in the future" rule was declared on
    AnnouncementBase, which AnnouncementOut inherits. Listing announcements
    then raised ValidationError on the way *out*, returning 500 for the whole
    collection because one old row existed.
    """
    from datetime import datetime, timedelta

    from dwsbot.schemas import AnnouncementOut

    out = AnnouncementOut(
        id=1, name="Test announcement", channel_id=REAL_CHANNEL_ID,
        kind=ScheduleKind.ONCE,
        run_at=datetime.now(UTC) - timedelta(days=240),
        body="x",
    )
    assert out.id == 1
    assert out.model_dump(mode="json")["channel_id"] == str(REAL_CHANNEL_ID)


def test_output_model_tolerates_a_structurally_incomplete_row():
    """Even a cron row with no expression must be listable, not fatal."""
    from dwsbot.schemas import AnnouncementOut

    out = AnnouncementOut(
        id=2, name="broken", channel_id=REAL_CHANNEL_ID,
        kind=ScheduleKind.CRON, cron_expr=None, body="x",
    )
    assert out.cron_expr is None


def test_update_still_enforces_the_future_rule():
    """Tightening output must not loosen input."""
    from datetime import datetime, timedelta

    from dwsbot.schemas import AnnouncementUpdate

    with pytest.raises(ValidationError, match="run_at must be in the future"):
        AnnouncementUpdate(
            **BASE, kind=ScheduleKind.ONCE,
            run_at=datetime.now(UTC) - timedelta(hours=1),
        )
