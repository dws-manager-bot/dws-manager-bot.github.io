"""The BGB registration as a spreadsheet: two team sheets of O and X.

The game decides the roster, not us — an admin reads it off the "Participants"
popup once registration locks on the Thursday. All this file does is let them
record it against players the site already knows, by handing out a sheet per
team carrying every member's id and marking two empty columns.

Ids are what make it reliable, exactly as in `roster_sheet`: the mark belongs to
a row, and the row names a player id, so a member who renamed between the
template and the upload still lands in the right seat.

Nothing here touches the database. It produces a plan; the endpoint applies it
once the person uploading has seen it.
"""
from __future__ import annotations

import hashlib
import io
import uuid
from dataclasses import dataclass, field
from datetime import date

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

TEAMS = ("A", "B")
SHEETS = {"A": "Team A", "B": "Team B"}
HELP_SHEET = "How to use"

# What the game allows per team. Registration cannot exceed these, so a sheet
# that does was misread rather than unusual.
MAX_STARTERS = 20
MAX_SUBSTITUTES = 10

STARTER, SUBSTITUTE = "starter", "substitute"
MERCENARY = "mercenary"

COLUMNS: list[tuple[str, str]] = [
    ("Player id", "id"),
    ("Name", "name"),
    ("BGB CP", "bgb_cp"),
    ("Starter (O/X)", STARTER),
    ("Substitute (O/X)", SUBSTITUTE),
    ("Mercenary (O/X)", MERCENARY),
]
MARKS = (STARTER, SUBSTITUTE, MERCENARY)
WIDTHS = {"Player id": 38, "Name": 24, "BGB CP": 16,
          "Starter (O/X)": 14, "Substitute (O/X)": 17, "Mercenary (O/X)": 16}

# Typed by hand in a hurry, so read generously — but only where the meaning is
# beyond doubt. Anything else is reported rather than guessed at.
YES = {"O", "0", "○", "◯", "●", "V", "Y", "YES", "✓", "✔", "TRUE"}
NO = {"", "X", "×", "✗", "-", "–", "N", "NO", "FALSE"}

HELP = [
    "How to record a BGB registration",
    "",
    "1. Each sheet is one team. Every current member is listed on both, because",
    "   the game lets you put anyone on either side.",
    "2. Once registration locks, read the in-game Participants popup and mark the",
    "   Starter or Substitute column with O. Leave everyone else blank, or X.",
    "3. Upload the file on the BGB tab. The site shows the roster it read and",
    "   asks you to confirm before recording anything.",
    "",
    f"A team takes at most {MAX_STARTERS} starters and {MAX_SUBSTITUTES} substitutes.",
    "Nobody can be on both teams, and nobody can be both starter and substitute.",
    "",
    "The Player id column is the site's, not yours — leave it alone. A member who",
    "is missing from these sheets has to be added on the Members tab first, since",
    "a registration is recorded against a player the site already knows.",
    "",
    "Mercenaries from another alliance are the exception. Add a row at the bottom,",
    "leave Player id empty, type their name and BGB CP, mark O under Mercenary, and",
    "mark Starter or Substitute as usual. They count towards the team's limits and",
    "take a seat on the card like anyone else. They are recorded against this",
    "battle only — they never join the Members tab, because the member import reads",
    "an absent row as somebody who left, and they were never here to leave.",
    "",
    "BGB CP is what the site holds today. Correcting a number here updates the",
    "member's BGB CP as well, so the lineup cards are drafted on the real figures.",
    "A mercenary's CP is only ever used for this battle.",
]


@dataclass
class SheetRow:
    """One row as it came back, already checked."""

    team: str
    line: int
    id: uuid.UUID | None               # None only for a mercenary, who is nobody's
    name: str
    bgb_cp: int | None = None
    role: str | None = None            # starter | substitute | None (not registered)
    mercenary: bool = False


@dataclass
class Seat:
    """Somebody registered for a battle: a member, or a mercenary hired for it."""

    player_id: str | None              # None for a mercenary
    name: str
    team: str
    role: str
    bgb_cp: int | None = None
    mercenary: bool = False


@dataclass
class CpChange:
    player_id: str
    name: str
    before: int | None
    after: int


@dataclass
class Plan:
    seats: list[Seat] = field(default_factory=list)
    cp_changes: list[CpChange] = field(default_factory=list)
    problems: list[str] = field(default_factory=list)

    def of(self, team: str, role: str) -> list[Seat]:
        return [s for s in self.seats if s.team == team and s.role == role]


def fingerprint(players: list) -> str:
    """A short digest of what the template was built from, to notice it moving."""
    parts = sorted(f"{p.id}|{p.name}|{p.bgb_cp}|{p.active}" for p in players)
    return hashlib.sha256("\n".join(parts).encode()).hexdigest()[:32]


def build_template(players: list, as_of: date | None = None) -> bytes:
    """The workbook to hand out: one sheet per team, every member on both."""
    book = Workbook()
    book.remove(book.active)
    ordered = sorted(players, key=lambda p: (-(p.bgb_cp or 0), p.name))
    head = Font(bold=True, color="FFFFFF")
    fill = PatternFill("solid", fgColor="3F3F76")
    mark = PatternFill("solid", fgColor="FFF2CC")

    for team in TEAMS:
        sheet = book.create_sheet(SHEETS[team])
        for column, (heading, _) in enumerate(COLUMNS, 1):
            cell = sheet.cell(row=1, column=column, value=heading)
            cell.font, cell.fill = head, fill
            cell.alignment = Alignment(horizontal="center")
            sheet.column_dimensions[get_column_letter(column)].width = WIDTHS[heading]
        for line, player in enumerate(ordered, 2):
            for column, (_, attribute) in enumerate(COLUMNS, 1):
                if attribute in MARKS:
                    # The columns to fill in, tinted so they are obvious.
                    cell = sheet.cell(row=line, column=column)
                    cell.fill = mark
                    cell.alignment = Alignment(horizontal="center")
                    continue
                value = str(player.id) if attribute == "id" else getattr(player, attribute)
                cell = sheet.cell(row=line, column=column, value=value)
                if attribute == "id":
                    # Not protection, just a hint: this column is the site's, not yours.
                    cell.font = Font(color="808080")
        # A mercenary has no row of their own until one is typed, so the sheet
        # says where to type it rather than leaving the space unexplained.
        note = sheet.cell(row=len(ordered) + 3, column=1,
                          value="Mercenaries from another alliance: add rows here. "
                                "Leave Player id empty, fill in Name and BGB CP, and mark "
                                "O under Mercenary as well as Starter or Substitute.")
        note.font = Font(color="808080", italic=True)
        sheet.freeze_panes = "A2"
        sheet.auto_filter.ref = (
            f"A1:{get_column_letter(len(COLUMNS))}{max(1, len(ordered) + 1)}"
        )

    help_sheet = book.create_sheet(HELP_SHEET)
    help_sheet.column_dimensions["A"].width = 84
    lines = list(HELP)
    if as_of:
        lines += ["", f"The CP in this file is what the site held on {as_of}."]
    for line, text in enumerate(lines, 1):
        cell = help_sheet.cell(row=line, column=1, value=text)
        if line == 1:
            cell.font = Font(bold=True, size=13)

    out = io.BytesIO()
    book.save(out)
    return out.getvalue()


def _mark(value, heading: str, team: str, line: int, problems: list[str]) -> bool | None:
    text = str(value if value is not None else "").strip().upper()
    if text in YES:
        return True
    if text in NO:
        return False
    problems.append(f"{SHEETS[team]} row {line}: “{value}” is not an O or an X, "
                    f"in {heading}.")
    return None


def _number(value, team: str, line: int, problems: list[str]) -> int | None:
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    text = str(value).replace(",", "").replace(" ", "").strip()
    try:
        number = int(float(text))
    except ValueError:
        problems.append(f"{SHEETS[team]} row {line}: “{value}” is not a number, in BGB CP.")
        return None
    if not 0 <= number <= 10**12:
        problems.append(f"{SHEETS[team]} row {line}: a BGB CP of {number} is out of range.")
        return None
    return number


def read_workbook(data: bytes) -> tuple[list[SheetRow], list[str]]:
    """The marked rows of an uploaded file, and everything wrong with it."""
    problems: list[str] = []
    try:
        book = load_workbook(io.BytesIO(data), data_only=True, read_only=True)
    except Exception:  # noqa: BLE001 - openpyxl raises several unrelated types
        return [], ["That file could not be opened as a spreadsheet. Save it as .xlsx."]

    missing = [SHEETS[t] for t in TEAMS if SHEETS[t] not in book.sheetnames]
    if missing:
        return [], [f"The sheet “{missing[0]}” is missing. Download the template again."]

    out: list[SheetRow] = []
    for team in TEAMS:
        sheet = book[SHEETS[team]]
        rows = list(sheet.iter_rows(values_only=True))
        if not rows:
            problems.append(f"{SHEETS[team]} is empty.")
            continue
        headings = {str(v).strip().casefold(): i for i, v in enumerate(rows[0]) if v is not None}
        where = {}
        for heading, attribute in COLUMNS:
            if heading.casefold() not in headings:
                problems.append(f"{SHEETS[team]}: the column “{heading}” is missing. "
                                "Download the template again.")
            else:
                where[attribute] = headings[heading.casefold()]
        if len(where) < len(COLUMNS):
            continue

        seen: dict[uuid.UUID, int] = {}
        hired: dict[str, int] = {}
        for line, values in enumerate(rows[1:], 2):
            def cell(attribute: str, values=values, where=where):
                index = where[attribute]
                return values[index] if index < len(values) else None

            if not any(v not in (None, "") for v in values):
                continue
            raw_id = str(cell("id") or "").strip()
            name = str(cell("name") or "").strip()
            starter = _mark(cell(STARTER), "Starter", team, line, problems)
            substitute = _mark(cell(SUBSTITUTE), "Substitute", team, line, problems)
            mercenary = _mark(cell(MERCENARY), "Mercenary", team, line, problems)
            try:
                player_id = uuid.UUID(raw_id) if raw_id else None
            except ValueError:
                player_id = None
            # Nothing marked and no id to match anyone by: not a registration at
            # all. The note at the foot of the sheet reads like this, and so does
            # anything jotted in the margin.
            if player_id is None and not (starter or substitute or mercenary):
                continue
            if starter and substitute:
                problems.append(f"{SHEETS[team]} row {line}: “{name}” is marked as both a "
                                "starter and a substitute.")
                continue
            role = STARTER if starter else SUBSTITUTE if substitute else None
            bgb_cp = _number(cell("bgb_cp"), team, line, problems)

            if mercenary:
                # Hired for this battle from another alliance. They have no member
                # record, so everything the card needs has to be on the row.
                if raw_id:
                    problems.append(f"{SHEETS[team]} row {line}: “{name}” has a player id, so "
                                    "they are a member. Clear the Mercenary column, or clear "
                                    "the id if this is somebody else.")
                    continue
                if not name:
                    problems.append(f"{SHEETS[team]} row {line}: a mercenary needs a name.")
                    continue
                if bgb_cp is None:
                    problems.append(f"{SHEETS[team]} row {line}: “{name}” needs a BGB CP. "
                                    "It is what decides which seat they take.")
                    continue
                if role is None:
                    problems.append(f"{SHEETS[team]} row {line}: “{name}” is marked as a "
                                    "mercenary but as neither a starter nor a substitute.")
                    continue
                if name in hired:
                    problems.append(f"{SHEETS[team]} row {line}: “{name}” is also hired on "
                                    f"row {hired[name]}.")
                    continue
                hired[name] = line
                out.append(SheetRow(team=team, line=line, id=None, name=name, role=role,
                                    bgb_cp=bgb_cp, mercenary=True))
                continue

            if not raw_id:
                problems.append(
                    f"{SHEETS[team]} row {line}: no player id"
                    + (f" for “{name}”" if name else "")
                    + ". Add them on the Members tab first and download the template again, "
                      "or mark O under Mercenary if they are from another alliance.")
                continue
            if player_id is None:
                problems.append(f"{SHEETS[team]} row {line}: “{raw_id}” is not a player id.")
                continue
            if player_id in seen:
                problems.append(f"{SHEETS[team]} row {line}: the same player is also on "
                                f"row {seen[player_id]}.")
                continue
            seen[player_id] = line
            out.append(SheetRow(
                team=team, line=line, id=player_id, name=name, role=role, bgb_cp=bgb_cp,
            ))
    return out, problems


def plan_roster(rows: list[SheetRow], players: list) -> Plan:
    """What the upload would record. Reads nothing, writes nothing."""
    plan = Plan()
    if not rows:
        # Same guard as the member import: a file that failed to parse must not
        # be able to record an empty roster over a real one.
        plan.problems.append("No rows could be read from that sheet, so nothing was worked out.")
        return plan

    by_id = {str(p.id): p for p in players}
    marked = [r for r in rows if r.role]
    if not marked:
        plan.problems.append("Nobody is marked as a starter or a substitute, so there is "
                             "no roster to record.")
        return plan

    current = {p.name for p in players if p.active}
    cp_seen: dict[str, CpChange] = {}
    for row in rows:
        if row.mercenary:
            # Nobody's member, so there is no record to check them against and
            # nothing of theirs to update -- except that they must not be one of
            # ours under a hand-typed name, which would put them on twice.
            if row.name in current:
                plan.problems.append(f"{SHEETS[row.team]} row {row.line}: “{row.name}” is "
                                     "already a member. Mark their own row instead.")
                continue
            plan.seats.append(Seat(player_id=None, name=row.name, team=row.team,
                                   role=row.role, bgb_cp=row.bgb_cp, mercenary=True))
            continue
        player = by_id.get(str(row.id))
        if player is None:
            if row.role:
                plan.problems.append(f"{SHEETS[row.team]} row {row.line}: no member has the "
                                     f"id {row.id}.")
            continue
        # A corrected CP updates the member as well, so the cards are drafted on
        # the real figure -- but only ever once, however many sheets carry it.
        if row.bgb_cp is not None and row.bgb_cp != player.bgb_cp:
            cp_seen.setdefault(str(player.id), CpChange(
                player_id=str(player.id), name=player.name,
                before=player.bgb_cp, after=row.bgb_cp))
        if not row.role:
            continue
        if not player.active:
            plan.problems.append(f"{SHEETS[row.team]} row {row.line}: “{player.name}” has left "
                                 "the alliance. Bring them back on the Members tab first.")
            continue
        plan.seats.append(Seat(
            player_id=str(player.id), name=player.name, team=row.team, role=row.role,
            bgb_cp=row.bgb_cp if row.bgb_cp is not None else player.bgb_cp))
    plan.cp_changes = list(cp_seen.values())

    both: dict[str, str] = {}
    for seat in plan.seats:
        # A mercenary has no id, so they are told apart by name -- which is all
        # we know them by, and why two of them may not share one.
        who = seat.player_id or f"hired:{seat.name}"
        if who in both and both[who] != seat.team:
            plan.problems.append(f"“{seat.name}” is registered on both teams. Nobody plays "
                                 "for both sides.")
        both[who] = seat.team

    for team in TEAMS:
        for role, cap, word in ((STARTER, MAX_STARTERS, "starters"),
                                (SUBSTITUTE, MAX_SUBSTITUTES, "substitutes")):
            count = len(plan.of(team, role))
            if count > cap:
                plan.problems.append(f"{SHEETS[team]} has {count} {word} marked, and the game "
                                     f"allows {cap}.")
    return plan
