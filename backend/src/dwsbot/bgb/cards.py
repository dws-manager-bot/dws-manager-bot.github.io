"""Briefing cards for a recorded roster, in any of the fifteen languages.

The allocator in `lineup` wants a list of name/CP/role, which is exactly what a
battle's registrations are. This turns one into the other, renders, and hands
back PNG bytes — so nothing is written to disk and nothing is cached: a card
takes about a fifth of a second to draw, which is cheaper than keeping it.
"""
from __future__ import annotations

import io
import zipfile
from datetime import date

from . import lineup
from .sheet import STARTER

# The game's own name for each language, and ours for it — the buttons read
# "한국어 (Korean)", so a member finds their own language by its own name and an
# admin can still tell which button is which.
ENGLISH_NAMES = {
    "en": "English", "ko": "Korean", "ja": "Japanese",
    "zh": "Chinese, Traditional", "zh_cn": "Chinese, Simplified", "th": "Thai",
    "vi": "Vietnamese", "id": "Indonesian", "tr": "Turkish", "de": "German",
    "it": "Italian", "fr": "French", "es": "Spanish", "pt": "Portuguese",
    "ar": "Arabic",
}

LANGUAGES = [
    {"code": code, "native": lineup.LANG_NAMES.get(code, code),
     "english": ENGLISH_NAMES.get(code, code)}
    for code in lineup.STRINGS
]
CODES = [entry["code"] for entry in LANGUAGES]


def file_name(team: str, lang: str) -> str:
    """The name the Mac's own workflow gives this file, so the two agree."""
    suffix = "" if lang == "en" else f"_{lang}"
    return f"lineup_team{team}{suffix}.png"


def _players(registrations: list) -> list:
    """Registrations as the allocator's own roster.

    The game says "substitute" and the allocator says "secondary"; they are the
    same seat. CP is the figure the roster was recorded with, not today's.
    """
    return [
        lineup.Player(
            name=r.name,
            cp=r.bgb_cp or 0,
            role="starter" if r.role == STARTER else "secondary",
        )
        for r in registrations
    ]


def render(registrations: list, team: str, battle_date: date, lang: str) -> bytes:
    """One team's card, as PNG bytes."""
    lineup.set_lang(lang)
    label = (f"{lineup.pretty_team(f'team{team}')}  ·  "
             f"{lineup.pretty_date(battle_date.strftime('%Y%m%d'))}")
    allocated = lineup.allocate(_players(registrations), label)
    out = io.BytesIO()
    lineup.render(allocated, out)
    return out.getvalue()


def render_all(by_team: dict[str, list], battle_date: date) -> bytes:
    """Every card for a battle, zipped the way the dated folders are laid out."""
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as bundle:
        for team, registrations in sorted(by_team.items()):
            if not registrations:
                continue
            for lang in CODES:
                bundle.writestr(
                    f"team{team}/{file_name(team, lang)}",
                    render(registrations, team, battle_date, lang),
                )
    return out.getvalue()


def warnings(registrations: list, team: str) -> list[str]:
    """What the allocator would complain about — a short roster, mostly."""
    lineup.set_lang("en")
    return lineup.allocate(_players(registrations), f"team{team}").warnings
