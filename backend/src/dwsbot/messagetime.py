"""Times inside an announcement, written once and read in everyone's own clock.

Discord renders `<t:EPOCH:f>` in whatever timezone the reader's client is set
to, so one message shows 11:00 to Seoul and 03:00 to London without the author
knowing or caring where anyone is. What it will not do is say which clock that
is, and the alliance plans against the game's — so `{st}` puts the server time
in as fixed text beside it. "11:00 (00:00 ST)" then means the same thing to
everybody.

A literal epoch cannot be typed into a recurring announcement: it would be
right once and wrong every week after. So the author writes a token, and it is
resolved at send time against the occurrence being announced — or, for an
announcement not tied to an event, against the moment it is posted.

The same table lives in `frontend/src/lib/discordtime.js`, which previews it.
"""
from __future__ import annotations

import re
from datetime import datetime

from .servertime import to_server

#: token -> how to render it, given the epoch seconds and the moment itself.
TOKENS: dict[str, str] = {
    "time": "<t:{epoch}:t>",           # 11:00
    "datetime": "<t:{epoch}:F>",       # Wednesday, 9 September 2026 11:00
    "date": "<t:{epoch}:D>",           # 9 September 2026
    "relative": "<t:{epoch}:R>",       # in 30 minutes
    "st": "{st}",                      # 00:00 ST -- the same for every reader
}

_TOKEN_RE = re.compile(r"\{(" + "|".join(TOKENS) + r")\}")


def render_times(text: str | None, when: datetime) -> str | None:
    """Replace every `{token}` in `text` with what it means at `when`."""
    if not text:
        return text
    epoch = int(when.timestamp())
    st = to_server(when).strftime("%H:%M ST")
    return _TOKEN_RE.sub(lambda m: TOKENS[m.group(1)].format(epoch=epoch, st=st), text)
