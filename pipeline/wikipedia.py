"""Candidates, incumbent status and published race ratings for 2026, from Wikipedia."""

from __future__ import annotations

import re
from datetime import datetime

import pandas as pd

from common import cell_text, record_source, table_grid, tables_by_heading, wikipedia_page
from states import POSTAL_BY_NAME, race_id

HOUSE_PAGE = "2026_United_States_House_of_Representatives_elections"
HOUSE_RATINGS_PAGE = "2026_United_States_House_of_Representatives_election_ratings"
SENATE_PAGE = "2026_United_States_Senate_elections"

RATING_SOURCES = {
    "Cook": "Cook Political Report",
    "IE": "Inside Elections",
    "Sabato": "Sabato's Crystal Ball",
    "Econ": "The Economist",
    "ST": "Split Ticket",
    "DDHQ": "Decision Desk HQ",
    "FPO": "Fifty Plus One",
    "Fox": "Fox News",
    "Silver": "Silver Bulletin",
    "RCP": "RealClearPolitics",
}

# Rating scale: positive leans Democratic, negative leans Republican.
RATING_STRENGTH = {"safe": 3, "solid": 3, "likely": 2, "lean": 1, "tilt": 0.5}

DISTRICT_RE = re.compile(r"^(?P<state>[A-Za-z .]+?) (?P<num>\d+|at-large)$")
HEADER_SOURCE_RE = re.compile(
    r"^(?P<source>[A-Za-z]+)\.?\s+(?P<date>(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.? \d{1,2}, \d{4})$"
)
CANDIDATE_RE = re.compile(r"^(?P<name>.+?)\s*\((?P<party>[^()]*)\)\s*$")


def party_code(text: str) -> str:
    t = text.lower()
    if "republican" in t:
        return "R"
    if "democrat" in t or "dfl" in t:
        return "D"
    if "libertarian" in t:
        return "L"
    if "green" in t:
        return "G"
    if any(word in t for word in ("independent", "nonpartisan", "no party", "undeclared", "unaffiliated")):
        return "I"
    if not t or t in {"none", "vacant"}:
        return ""
    return "O"


def incumbent_running(status: str) -> bool:
    status = status.lower()
    # "running for governor" or "running in the 5th district" means leaving this seat.
    leaving = r"retir|lost|resign|died|defeated|withdr|ineligible|to run for|(running|seeking) (?!(for )?re-?election)\w"
    if re.search(leaving, status):
        return False
    # "Interim appointee nominated", "Incumbent renominated", "Incumbent re-elected" (unopposed), ...
    return bool(re.search(r"nominated|advanced to general|running|re-?elect", status))


def parse_rating(text: str) -> tuple[str, float] | None:
    """'Likely R (flip)' -> ('Likely R', -2.0); 'Tossup' -> ('Tossup', 0.0)."""
    text = re.sub(r"\(flip\)", "", text, flags=re.I).strip()
    if not text or text.lower() in {"nan", "—", "-", "n/a"}:
        return None
    if re.fullmatch(r"toss-?up", text, flags=re.I):
        return "Tossup", 0.0
    m = re.fullmatch(r"(?P<strength>safe|solid|likely|lean|tilt)\s+(?P<party>[DRI])", text, flags=re.I)
    if not m:
        return None
    strength = RATING_STRENGTH[m["strength"].lower()]
    party = m["party"].upper()
    label = f"{'Safe' if strength == 3 else m['strength'].title()} {party}"
    return label, strength if party == "D" else -strength if party == "R" else 0.0


def _header_labels(grid: list[list], rows: int = 2) -> list[str]:
    labels = []
    for col in range(len(grid[rows - 1])):
        parts = [cell_text(grid[r][col]) for r in range(rows) if col < len(grid[r])]
        labels.append(" / ".join(dict.fromkeys(p for p in parts if p)))
    return labels


def _find_col(labels: list[str], *needles: str) -> int:
    for needle in needles:
        for i, label in enumerate(labels):
            if needle.lower() in label.lower():
                return i
    raise KeyError(f"No column matching {needles} in {labels}")


def _candidates(cell) -> list[dict]:
    people = []
    items = cell.xpath(".//li") or [cell]
    for item in items:
        text = cell_text(item)
        m = CANDIDATE_RE.match(text)
        if m:
            people.append({"name": m["name"].strip(), "party": party_code(m["party"]), "party_label": m["party"].strip()})
    return people


def _ratings_table(table, race_key) -> pd.DataFrame:
    grid = table_grid(table)
    labels = _header_labels(grid)
    rows = []
    for row in grid[2:]:
        key = race_key(cell_text(row[0]))
        if not key:
            continue
        for col, label in enumerate(labels):
            m = HEADER_SOURCE_RE.match(label.split(" / ")[-1])
            if not m or m["source"] not in RATING_SOURCES or col >= len(row):
                continue
            parsed = parse_rating(cell_text(row[col]))
            if parsed is None:
                continue
            as_of = datetime.strptime(m["date"].replace("Sept", "Sep").replace(".", ""), "%b %d, %Y").date()
            rows.append(
                {
                    "race_id": key,
                    "source": RATING_SOURCES[m["source"]],
                    "rating": parsed[0],
                    "score": parsed[1],
                    "as_of": as_of.isoformat(),
                }
            )
    return pd.DataFrame(rows)


def _house_key(label: str) -> str | None:
    m = DISTRICT_RE.match(label)
    if not m or m["state"] not in POSTAL_BY_NAME:
        return None
    postal = POSTAL_BY_NAME[m["state"]]
    return race_id(postal, 0 if m["num"] == "at-large" else int(m["num"]))


def _senate_key(label: str) -> str | None:
    for name, postal in POSTAL_BY_NAME.items():
        if label == name or label.startswith(name + " "):
            return f"{postal}-SEN"
    return None


def load_house_races(refresh: bool = False) -> pd.DataFrame:
    """One row per district: incumbent(s), their status, and general-election candidates."""
    doc, revid = wikipedia_page(HOUSE_PAGE, refresh=refresh)
    record_source("wikipedia_house", name="Wikipedia: 2026 United States House of Representatives elections",
                  url=f"https://en.wikipedia.org/wiki/{HOUSE_PAGE}", revision=revid, license="CC BY-SA 4.0")

    rows = []
    for heading, tables in tables_by_heading(doc).items():
        if heading not in POSTAL_BY_NAME:
            continue
        table = next(
            (t for t in tables if "Candidates" in cell_text(t) and "Incumbent" in cell_text(t)), None
        )
        if table is None:
            raise ValueError(f"No district table under {heading}")
        grid = table_grid(table)
        labels = _header_labels(grid)
        c_loc = _find_col(labels, "Location", "District")
        c_member = _find_col(labels, "Member", "Representative")
        c_party = _find_col(labels, "Party")
        c_elected = _find_col(labels, "First elected")
        c_status = _find_col(labels, "Status")
        c_cands = _find_col(labels, "Candidates")
        for row in grid[2:]:
            if len(row) <= c_cands:
                continue
            key = _house_key(cell_text(row[c_loc]))
            if not key:
                continue
            member_cell = row[c_member]
            name_span = member_cell.xpath(".//span[@class='fn']")
            moved = re.search(r"Redistricted from the (?:(\d+)\w* district|at-large district)", cell_text(member_cell))
            previous = ""
            if moved:
                previous = race_id(key[:2], int(moved.group(1))) if moved.group(1) else f"{key[:2]}-AL"
            rows.append(
                {
                    "race_id": key,
                    "member": cell_text(name_span[0]) if name_span else cell_text(member_cell),
                    "member_party": party_code(cell_text(row[c_party])),
                    "first_elected": cell_text(row[c_elected]),
                    "status": cell_text(row[c_status]),
                    "redistricted_from": previous,
                    "candidates": _candidates(row[c_cands]),
                }
            )

    df = pd.DataFrame(rows)
    out = []
    for key, group in df.groupby("race_id", sort=True):
        members = group[~group["member"].str.contains(r"^(?:None|Vacant)", case=False, regex=True)]
        running = members[members["status"].map(incumbent_running)]
        # When redistricting put two members in one seat, list the one running here first.
        lead = running.iloc[0] if len(running) else (members.iloc[0] if len(members) else None)
        out.append(
            {
                "race_id": key,
                "incumbent": "" if lead is None else lead["member"],
                "incumbent_party": "" if lead is None else lead["member_party"],
                "first_elected": "" if lead is None else lead["first_elected"],
                "incumbent_status": "" if lead is None else lead["status"],
                "incumbent_running": bool(len(running)),
                "other_incumbents": "; ".join(m for m in members["member"] if lead is None or m != lead["member"]),
                "redistricted_from": "" if lead is None else lead["redistricted_from"],
                "candidates": group.iloc[0]["candidates"],
            }
        )
    return pd.DataFrame(out)


def load_house_ratings(refresh: bool = False) -> pd.DataFrame:
    doc, revid = wikipedia_page(HOUSE_RATINGS_PAGE, refresh=refresh)
    record_source("wikipedia_house_ratings", name="Wikipedia: 2026 United States House of Representatives election ratings",
                  url=f"https://en.wikipedia.org/wiki/{HOUSE_RATINGS_PAGE}", revision=revid, license="CC BY-SA 4.0")
    tables = doc.xpath("//table[contains(@class,'wikitable')]")
    table = max(tables, key=lambda t: len(t.xpath(".//tr")))
    return _ratings_table(table, _house_key)


def load_senate_races(refresh: bool = False) -> pd.DataFrame:
    doc, revid = wikipedia_page(SENATE_PAGE, refresh=refresh)
    record_source("wikipedia_senate", name="Wikipedia: 2026 United States Senate elections",
                  url=f"https://en.wikipedia.org/wiki/{SENATE_PAGE}", revision=revid, license="CC BY-SA 4.0")
    sections = tables_by_heading(doc, level=3)
    rows = []
    for heading, special in (("Elections leading to the next Congress", False),
                             ("Special elections during the preceding Congress", True)):
        for table in sections.get(heading, []):
            grid = table_grid(table)
            labels = _header_labels(grid)
            try:
                c_state = _find_col(labels, "State")
                c_member = _find_col(labels, "Senator")
                c_party = _find_col(labels, "Party")
                c_status = _find_col(labels, "Results", "Status")
                c_cands = _find_col(labels, "Candidates")
            except KeyError:
                continue
            for row in grid[2:]:
                if len(row) <= c_cands:
                    continue
                key = _senate_key(cell_text(row[c_state]))
                if not key:
                    continue
                status = cell_text(row[c_status])
                rows.append(
                    {
                        "race_id": key,
                        "special": special,
                        "incumbent": cell_text(row[c_member]),
                        "incumbent_party": party_code(cell_text(row[c_party])),
                        "incumbent_status": status,
                        "incumbent_running": incumbent_running(status),
                        "candidates": _candidates(row[c_cands]),
                    }
                )
    return pd.DataFrame(rows).drop_duplicates("race_id", keep="first")


def load_senate_ratings(refresh: bool = False) -> pd.DataFrame:
    doc, _ = wikipedia_page(SENATE_PAGE, refresh=refresh)
    tables = tables_by_heading(doc).get("Predictions", [])
    if not tables:
        raise ValueError("No Predictions table on the Senate page")
    return _ratings_table(tables[0], _senate_key)
