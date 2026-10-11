"""National context from Wikipedia: the generic ballot, the Senate's make-up, crossover House seats
and the mid-decade redistricting summary.

    load_generic_ballot()         one row per poll aggregator: D and R shares, margin, dates, link
    current_environment(df)       mean margin of each aggregator's latest value
    load_senate_composition()     seats not up in 2026 by caucus, current make-up, majority rules
    load_redistricting_changes()  per state: change in D-leaning, competitive and R-leaning seats
    load_crossover_seats()        House seats whose 2024 presidential and House winners differ

Every loader reads the article through common.wikipedia_page (cached in data/raw/wikipedia/) and
records its source. Margins are Democratic minus Republican, in points.

Print everything:  .venv/Scripts/python pipeline/context.py
"""

from __future__ import annotations

import calendar
import json
import re
import warnings
from datetime import date
from urllib.parse import unquote

import pandas as pd

from common import CLEAN, cell_text, record_source, table_grid, wikipedia_page
from states import POSTAL_BY_NAME, REDRAWN_2026, STATES, race_id
from wikipedia import DISTRICT_RE, HOUSE_PAGE, SENATE_PAGE, party_code

WIKI = "https://en.wikipedia.org/wiki/"
LICENSE = "CC BY-SA 4.0"
ROUNDING = 0.15  # the article prints shares and margins to 0.1 point
ARCHIVE_HOSTS = ("web.archive.org", "archive.org", "archive.ph", "archive.today", "archive.is", "webcitation.org")

MONTHS = {name.lower(): i for i, name in enumerate(calendar.month_name) if name}
MONTHS |= {name.lower(): i for i, name in enumerate(calendar.month_abbr) if name}
MONTHS["sept"] = 9

SEAT_RE = re.compile(r"^(?P<party>[DRI])(?P<num>\d{1,2})\b(?P<rest>.*)$")
VP_RE = re.compile(
    # 'Republican JD Vance won with 53.03% of the vote ..., to become Vice President of the United States.'
    r"\b(?P<party>Republican|Democratic|Democrat|Independent)\s+(?P<name>[A-Z][\w.'-]*(?:\s+[A-Z][\w.'-]*){0,2})"
    r"(?:[^.]|\.(?=\d))*?\b(?:become|elected|sworn in as)\s+(?:the\s+)?[Vv]ice [Pp]resident\b[^.]*\.?"
)
RULE_RE = re.compile(
    # 'Senate control requires 51 seats or 50 seats with control of the vice presidency.'
    r"requires\s+(?P<full>\d+)\s+seats\s+or\s+(?P<tie>\d+)\s+seats\s+with\s+control\s+of\s+the\s+vice[- ]presidency",
    re.IGNORECASE,
)


# ---------- helpers ----------

_pages: dict[str, tuple] = {}


def _page(title: str, refresh: bool) -> tuple:
    """(parsed article, revision id), parsed once per run and downloaded at most once per run when
    refreshing: three loaders here read the 1.4 MB House article."""
    if title not in _pages or (refresh and not _pages[title][2]):
        doc, revid = wikipedia_page(title, refresh=refresh)
        _pages[title] = (doc, revid, refresh)
    return _pages[title][:2]


def _heading(el) -> str:
    return re.sub(r"\[\s*edit\s*\]", "", " ".join(el.text_content().split())).strip()


def _sections(doc) -> dict[str, list[tuple[str, object]]]:
    """Wikitables grouped by h2 heading, each paired with the h3 heading it sits under ('' if none).

    common.tables_by_heading merges same-named subsections ('Democratic' appears under several
    h2s), so the crossover tables need their h2 kept."""
    out: dict[str, list] = {}
    h2, h3 = None, ""
    for el in doc.iter("h2", "h3", "table"):
        if el.tag == "h2":
            h2, h3 = _heading(el), ""
            out.setdefault(h2, [])
        elif el.tag == "h3":
            h3 = _heading(el)
        elif h2 and "wikitable" in (el.get("class") or ""):
            out[h2].append((h3, el))
    return out


def _labels(grid: list[list]) -> tuple[list[str], int]:
    """Column labels (header rows joined with ' / ') and the number of header rows (rows of <th> only)."""
    n = next((i for i, row in enumerate(grid) if any(c.tag == "td" for c in row)), len(grid))
    width = max((len(r) for r in grid[:n]), default=0)
    labels = []
    for col in range(width):
        parts = [cell_text(grid[r][col]) for r in range(n) if col < len(grid[r])]
        labels.append(" / ".join(dict.fromkeys(p for p in parts if p)))
    return labels, n


def _col(labels: list[str], *needles: str, exclude: tuple[str, ...] = (), required: bool = True) -> int | None:
    for needle in needles:
        for i, label in enumerate(labels):
            low = label.lower()
            if needle in low and not any(x in low for x in exclude):
                return i
    if required:
        raise KeyError(f"No column matching {needles} in {labels}")
    return None


def _footnotes(doc) -> dict[str, object]:
    return {li.get("id"): li for li in doc.xpath("//li[starts-with(@id,'cite_note')]")}


def _footnote_texts(cell, notes: dict) -> list[str]:
    out = []
    for a in cell.xpath(".//sup[contains(@class,'reference')]//a[starts-with(@href,'#')]"):
        note = notes.get(unquote(a.get("href")[1:]))
        if note is not None:
            out.append(" ".join(note.text_content().split()).lstrip("^ ").strip())
    return out


def _citation_url(cell, notes: dict) -> str:
    """First web link in the footnote(s) attached to a cell, preferring the original over an archive copy."""
    for a in cell.xpath(".//sup[contains(@class,'reference')]//a[starts-with(@href,'#')]"):
        note = notes.get(unquote(a.get("href")[1:]))
        if note is None:
            continue
        links = [x.get("href") for x in note.xpath(".//a[contains(@class,'external')]") if x.get("href")]
        live = [h for h in links if not any(host in h for host in ARCHIVE_HOSTS)]
        if live or links:
            return (live or links)[0]
    return ""


def _number(text: str) -> float | None:
    m = re.search(r"\d+(?:\.\d+)?", text.replace(",", ""))
    return float(m.group(0)) if m else None


def _count(text: str) -> int | None:
    """'45' -> 45; a dash means none -> 0; anything else ('TBD', '') -> None."""
    t = text.strip()
    if t in {"—", "–", "-"}:
        return 0
    return int(t.replace(",", "")) if re.fullmatch(r"\d[\d,]*", t) else None


def _signed_margin(text: str) -> float | None:
    """'Democrats +8.5%' or 'D+8.5' -> 8.5; 'Republicans +2%' or 'R+2' -> -2.0; 'Tie' or 'EVEN' -> 0.0."""
    t = text.strip()
    if re.fullmatch(r"(?i)tie|tied|even|0(?:\.0+)?%?", t):
        return 0.0
    m = re.search(r"\b(?P<party>(?i:democrat\w*|republican\w*|dem\.?|rep\.?|gop)|[DR])\s*\+\s*(?P<num>\d+(?:\.\d+)?)", t)
    if not m:
        return None
    num = float(m["num"])
    return num if m["party"][0].upper() == "D" else -num


def _end_date(text: str) -> date | None:
    """Last calendar date printed in a cell: 'September 16 – October 5, 2026' -> 2026-10-05.

    Also reads ranges inside one month ('October 1–5, 2026') and single dates ('Oct 9, 2026')."""
    parts = [p.strip() for p in re.split(r"[–—-]|\bto\b", text) if p.strip()]
    if not parts:
        return None
    m = re.fullmatch(r"(?:(?P<month>[A-Za-z]+)\.?\s+)?(?P<day>\d{1,2})(?:,?\s+(?P<year>\d{4}))?", parts[-1])
    if not m:
        return None
    month = m["month"]
    if month is None:  # 'October 1–5, 2026': the month is printed once, at the start of the range
        for part in reversed(parts[:-1]):
            word = re.match(r"[A-Za-z]+", part)
            if word and word.group(0).lower() in MONTHS:
                month = word.group(0)
                break
    years = re.findall(r"\b(?:19|20)\d{2}\b", text)
    year = m["year"] or (years[-1] if years else None)
    if not month or month.lower() not in MONTHS or not year:
        return None
    try:
        return date(int(year), MONTHS[month.lower()], int(m["day"]))
    except ValueError:
        return None


def _warn(problems: list[str], what: str) -> None:
    for problem in problems:
        warnings.warn(f"{what}: {problem}", stacklevel=3)


# ---------- generic ballot ----------

def load_generic_ballot(refresh: bool = False) -> pd.DataFrame:
    """Generic congressional ballot polling averages, one row per aggregator listed on Wikipedia.

    Reads the 'Generic congressional ballot aggregate polls' table of the 2026 House elections
    article (or the same table on the Senate article if the House one disappears). Columns are
    found by header text; the article prints Republicans before Democrats.

        source          aggregator, as printed ('Decision Desk HQ', 'Silver Bulletin', ...)
        dates           polling window, as printed ('January 9, 2025 – October 5, 2026')
        polls_end       last day of that window (ISO date)
        updated         date the average was last updated (ISO); the end of `dates` if not printed
        dem, rep        Democratic and Republican shares, in percent
        other           others/undecided, in percent (the article computes it as 100 - dem - rep)
        margin          dem - rep, in points (positive = Democratic lead)
        margin_printed  the table's own margin column, signed the same way (kept for cross-checks)
        url             the aggregator's page, from the row's footnote ('' if none)

    Wikipedia's own 'Average' row is not a row here: it is kept in df.attrs['page_average'], and
    the mean of the rows is checked against it, as are printed margins against dem - rep
    (mismatches beyond rounding raise a warning and are listed in df.attrs['problems']).
    """
    for page in (HOUSE_PAGE, SENATE_PAGE):
        doc, revid = _page(page, refresh)
        found = [
            (heading, table)
            for heading, tables in _sections(doc).items()
            if "generic" in heading.lower() and "ballot" in heading.lower()
            for _, table in tables
            if re.search(r"(?i)democrat", cell_text(table)) and re.search(r"(?i)republican", cell_text(table))
        ]
        if found:
            heading, table = found[0]
            break
    else:
        raise ValueError("No generic congressional ballot table on the House or Senate article")

    grid = table_grid(table)
    labels, n_head = _labels(grid)
    c_source = _col(labels, "source", "aggregat")
    c_dates = _col(labels, "administered", "dates", exclude=("updated",))
    c_updated = _col(labels, "updated", "as of", required=False)
    c_dem = _col(labels, "democrat")
    c_rep = _col(labels, "republican")
    c_other = _col(labels, "other", "undecided", required=False)
    c_margin = _col(labels, "margin", "lead", required=False)
    last_col = max(c for c in (c_source, c_dates, c_updated, c_dem, c_rep, c_other, c_margin) if c is not None)
    notes = _footnotes(doc)

    rows, page_average = [], None
    for row in grid[n_head:]:
        if len(row) <= last_col:
            continue
        dem, rep = _number(cell_text(row[c_dem])), _number(cell_text(row[c_rep]))
        if dem is None or rep is None:
            continue
        source = cell_text(row[c_source])
        dates = cell_text(row[c_dates])
        polls_end = _end_date(dates)
        updated = (_end_date(cell_text(row[c_updated])) if c_updated is not None else None) or polls_end
        record = {
            "source": source,
            "dates": dates,
            "polls_end": polls_end.isoformat() if polls_end else None,
            "updated": updated.isoformat() if updated else None,
            "dem": dem,
            "rep": rep,
            "other": _number(cell_text(row[c_other])) if c_other is not None else None,
            "margin": round(dem - rep, 2),
            "margin_printed": _signed_margin(cell_text(row[c_margin])) if c_margin is not None else None,
            "url": _citation_url(row[c_source], notes),
        }
        if source.lower().startswith("average"):
            page_average = record
        else:
            rows.append(record)
    if not rows:
        raise ValueError(f"The generic ballot table on {page} has no aggregator rows")

    columns = ["source", "dates", "polls_end", "updated", "dem", "rep", "other", "margin", "margin_printed", "url"]
    df = pd.DataFrame(rows, columns=columns)

    problems = []
    for r in df.itertuples():
        if pd.notna(r.margin_printed) and abs(r.margin - r.margin_printed) > ROUNDING:
            problems.append(f"{r.source}: dem - rep = {r.margin:+.2f} but the table prints {r.margin_printed:+.1f}")
        if pd.notna(r.other) and abs(r.dem + r.rep + r.other - 100) > 0.3:
            problems.append(f"{r.source}: dem + rep + other = {r.dem + r.rep + r.other:.1f}, not 100")
        if r.updated is None or pd.isna(r.updated):
            problems.append(f"{r.source}: no readable update date in {r.dates!r}")
    if page_average is not None and abs(df["margin"].mean() - page_average["margin"]) > ROUNDING:
        problems.append(
            f"mean of the rows {df['margin'].mean():+.2f} differs from the table's Average row {page_average['margin']:+.2f}"
        )
    _warn(problems, "generic ballot")
    df.attrs.update(page=page, revision=revid, page_average=page_average, problems=problems)

    record_source(
        "wikipedia_generic_ballot",
        name=f"Wikipedia: {page.replace('_', ' ')}, '{heading}' table",
        url=f"{WIKI}{page}#{heading.replace(' ', '_')}",
        revision=revid,
        license=LICENSE,
        credit="Polling averages by " + ", ".join(dict.fromkeys(df["source"])) + "; credit each aggregator by name",
    )
    return df


def current_environment(df: pd.DataFrame, max_age_days: int | None = 30) -> dict:
    """The national environment: the generic-ballot margin averaged across poll aggregators.

    Rule (one vote per aggregator, unweighted):
      1. For each `source`, keep its latest row: the greatest `updated`, then the greatest
         `polls_end`, then the row listed first. (Wikipedia's 'Average' row is never in df.)
      2. With max_age_days set (default 30), drop aggregators whose latest update is more than
         that many days older than the newest update in the table, or that have no readable date:
         a stale average should not move the current number. They are listed under 'excluded'.
         Pass None to keep every aggregator.
      3. margin = mean of the kept aggregators' margins (dem - rep, points), rounded to 2 decimals.
         dem and rep are the means of their shares; min_margin and max_margin show the spread.
      4. as_of = the newest `updated` date among the kept aggregators; oldest = the oldest one.

    Returns {margin, n_sources, sources, as_of, oldest, dem, rep, min_margin, max_margin,
    by_source, excluded, max_age_days}.
    """
    empty = {"margin": None, "n_sources": 0, "sources": [], "as_of": None, "excluded": [], "max_age_days": max_age_days}
    if df.empty:
        return empty
    d = df.assign(
        _order=range(len(df)),
        _updated=pd.to_datetime(df["updated"], errors="coerce"),
        _end=pd.to_datetime(df["polls_end"], errors="coerce") if "polls_end" in df else pd.NaT,
    )
    latest = d.sort_values(
        ["_updated", "_end", "_order"], ascending=[False, False, True], na_position="last"
    ).drop_duplicates("source", keep="first")

    excluded = []
    if max_age_days is not None:
        newest = latest["_updated"].max()
        stale = latest["_updated"].isna() | (newest - latest["_updated"] > pd.Timedelta(days=max_age_days))
        excluded = [
            {"source": r.source, "updated": r.updated if isinstance(r.updated, str) else None, "margin": float(r.margin)}
            for r in latest[stale].itertuples()
        ]
        latest = latest[~stale]
    latest = latest.sort_values("_order")
    if latest.empty:
        return empty | {"excluded": excluded}

    dated = latest["_updated"].dropna()
    return {
        "margin": round(float(latest["margin"].mean()), 2),
        "n_sources": int(len(latest)),
        "sources": latest["source"].tolist(),
        "as_of": dated.max().date().isoformat() if len(dated) else None,
        "oldest": dated.min().date().isoformat() if len(dated) else None,
        "dem": round(float(latest["dem"].mean()), 2),
        "rep": round(float(latest["rep"].mean()), 2),
        "min_margin": float(latest["margin"].min()),
        "max_margin": float(latest["margin"].max()),
        "by_source": {s: float(m) for s, m in zip(latest["source"], latest["margin"])},
        "excluded": excluded,
        "max_age_days": max_age_days,
    }


# ---------- Senate composition ----------

def _seats_summary(doc) -> dict[str, dict]:
    """Rows 'Before these elections', 'Not up' and 'Up' of the Senate 'Seats' summary table as
    {'Before'|'Not up'|'Up': {'D', 'R', 'I', 'other', 'total'}}. Party columns other than
    Democratic, Republican and Independent (e.g. a vacancy) are added up under 'other'."""
    for table in doc.xpath("//table[contains(@class,'wikitable')]"):
        grid = table_grid(table)
        firsts = [cell_text(r[0]) if r else "" for r in grid]
        if not ({"Not up", "Up"} <= set(firsts) and any(f.startswith("Before") for f in firsts)):
            continue
        header = next((r for r in grid if {"Democratic", "Republican"} <= {cell_text(c) for c in r}), None)
        if header is None:
            continue
        columns = {}
        for i, cell in enumerate(header):
            label = cell_text(cell).lower()
            if label == "total":
                columns[i] = "total"
            elif label in {"democratic", "republican", "independent"}:
                columns[i] = {"democratic": "D", "republican": "R", "independent": "I"}[label]
            elif label and label not in {"parties", "party"}:
                columns[i] = "other"
        out: dict[str, dict] = {}
        for row, first in zip(grid, firsts):
            key = "Before" if first.startswith("Before") else first if first in {"Not up", "Up"} else None
            if key is None or key in out:
                continue
            counts = {"D": 0, "R": 0, "I": 0, "other": 0, "total": 0}
            for i, code in columns.items():
                n = _count(cell_text(row[i])) if i < len(row) else None
                if n is None:
                    raise ValueError(f"Unreadable count in the Senate seats table: row {first!r}, column {cell_text(header[i])!r}")
                counts[code] += n
            out[key] = counts
        return out
    raise ValueError("No Senate seats summary table (rows 'Before these elections', 'Not up', 'Up')")


def _seat_map(doc, heading: str = "Before the elections") -> dict[str, dict]:
    """Seats in the 'Change in composition' seat map under `heading`, keyed 'D1', 'I2', 'R53', ...
    A seat that is up carries its state (from the cell's <abbr title> or link) and status."""
    h3 = None
    for el in doc.iter("h2", "h3", "table"):
        if el.tag in ("h2", "h3"):
            h3 = _heading(el) if el.tag == "h3" else None
            continue
        if h3 != heading or "wikitable" not in (el.get("class") or ""):
            continue
        seats: dict[str, dict] = {}
        for row in table_grid(el):
            for cell in row:
                m = SEAT_RE.match(cell_text(cell))
                if not m or m["party"] + m["num"] in seats:  # row-spanning cells repeat in the grid
                    continue
                # <abbr title="Rhode Island">R.I.</abbr>, or "Ohio (special)" for a special election
                abbr = cell.xpath(".//abbr/@title")
                link = cell.xpath(".//a[starts-with(@href,'#')]/@href")
                place = abbr[0] if abbr else unquote(link[0][1:]).replace("_", " ") if link else ""
                rest = m["rest"].strip()
                seats[m["party"] + m["num"]] = {
                    "party": m["party"],
                    "up": bool(rest),
                    "state": POSTAL_BY_NAME.get(re.sub(r"\s*\(.*\)$", "", place)),
                    "special": bool(re.search(r"\(sp(?:\.|ecial)\)", f"{place} {rest}")),
                    "label": rest,
                }
        if seats:
            return seats
    return {}


def _independent_caucus(doc) -> str | None:
    """'D' or 'R' from the seat-map key ('I# Independent, caucusing with Democrats'); None if unclear."""
    text = " ".join(doc.text_content().split())
    found = set(re.findall(r"I#\s*Independents?,?\s*caucusing with (?:the )?(Democrats|Republicans)", text))
    return {"Democrats": "D", "Republicans": "R"}[found.pop()] if len(found) == 1 else None


def _infobox(doc) -> dict:
    """Counts printed in the article's infobox: up, total, majority and, per party code,
    'Current seats', 'Seats up' and 'Seats needed'."""
    boxes = doc.xpath("//table[contains(@class,'infobox')]")
    if not boxes:
        return {}
    box = boxes[0]
    out: dict = {"parties": {}}
    text = cell_text(box)
    if m := re.search(r"(\d+) of the (\d+) seats", text):
        out["up"], out["total"] = int(m.group(1)), int(m.group(2))
    if m := re.search(r"(\d+) seats needed for a majority", text):
        out["majority"] = int(m.group(1))
    for inner in box.xpath(".//table"):
        parties: list[str] = []
        for tr in inner.xpath("./tr|./tbody/tr"):
            cells = [cell_text(c) for c in tr.xpath("./th|./td")]
            if len(cells) < 2:
                continue
            label, values = cells[0], cells[1:]
            if label == "Party":
                parties = [party_code(v) if v else "" for v in values]
            elif parties and label in {"Current seats", "Seats before", "Seats up", "Seats needed"}:
                for code, value in zip(parties, values):
                    if code:
                        out["parties"].setdefault(code, {})[label] = _count(value) if value else None
    return out


def _vice_president(doc) -> tuple[str | None, str | None, list[str]]:
    """(name, party code, evidence sentences) for the vice president, from page sentences such as
    'Republican JD Vance won ... but resigned ... to become Vice President of the United States.'
    The party is returned only when every matching sentence agrees."""
    hits: dict[str, tuple[str, str]] = {}
    for el in doc.xpath("//p|//li"):
        text = " ".join(el.text_content().split())
        for m in VP_RE.finditer(text):
            hits.setdefault(party_code(m["party"]), (m["name"], m.group(0)))
    if len(hits) != 1:
        return None, None, [sentence for _, sentence in hits.values()]
    party, (name, sentence) = next(iter(hits.items()))
    return name, party, [sentence]


def load_senate_composition(
    refresh: bool = False, senate_races: pd.DataFrame | None = None, strict: bool = True
) -> dict:
    """Seats not up in 2026 by caucus, the current Senate, and what each side needs for control.

    Sources, all on the 2026 Senate elections article:
      - counts: the 'Seats' summary table, rows 'Before these elections' (current), 'Not up', 'Up';
      - independents: the seat-map key ('I# Independent, caucusing with Democrats') decides whether
        they count as I_D; otherwise they go under 'other' with a note;
      - vice president: page sentences naming the VP with a party ('Republican JD Vance ...
        to become Vice President'); the tie-break rule from the page's note ('Senate control
        requires 51 seats or 50 seats with control of the vice presidency').
    Cross-checks (listed under 'checks'; with strict=True any failure raises ValueError):
      each table row adds up to its total; not_up + up == current; the total is 2 seats per state;
      the 'Before the elections' seat map and the infobox give the same counts; the races file
      (senate_races, else data/clean/races_senate_2026.csv) has the same number of seats up by
      incumbent caucus, the same states and special elections as the seat map, and not_up + its
      incumbents == current; the infobox's 'Seats needed' matches the Democratic threshold.

    Returns {not_up, current, up, up_by_caucus, up_states, specials, total, vice_president,
    vice_president_party, majority_threshold_for_D, majority_threshold_for_R, caucus_not_up,
    wins_needed, source, checks, notes}. Caucus keys: D, R, I_D (independents caucusing with
    Democrats), other. caucus_not_up counts I_D with D; wins_needed is how many of the `up` races
    each caucus must win to reach its threshold (the vice president's party breaks a 50-50 tie).
    Pass the in-memory races as senate_races when calling before the CSV is written.
    """
    doc, revid = _page(SENATE_PAGE, refresh)
    url = f"{WIKI}{SENATE_PAGE}"
    record_source(
        "wikipedia_senate_composition",
        name="Wikipedia: 2026 United States Senate elections (seat summary table, seat map, infobox)",
        url=f"{url}#Summary_results",
        revision=revid,
        license=LICENSE,
    )
    checks: list[dict] = []
    notes: list[str] = []

    def check(label: str, ok: bool) -> None:
        checks.append({"check": label, "ok": bool(ok)})

    keys = ("D", "R", "I_D", "other")
    seats = _seats_summary(doc)
    caucus = _independent_caucus(doc)

    def by_caucus(counts: dict) -> dict[str, int]:
        ind_d = counts["I"] if caucus == "D" else 0
        return {"D": counts["D"], "R": counts["R"], "I_D": ind_d, "other": counts["other"] + counts["I"] - ind_d}

    current, not_up, up_by = (by_caucus(seats[k]) for k in ("Before", "Not up", "Up"))
    total, up = seats["Before"]["total"], seats["Up"]["total"]
    notes.append(
        "Counts come from the 'Seats' summary table (rows 'Before these elections' = current, 'Not up', 'Up'): "
        + "; ".join(f"{k}: D {v['D']}, I {v['I']}, R {v['R']}, other {v['other']}, total {v['total']}" for k, v in seats.items())
        + "."
    )
    if caucus == "D":
        notes.append(f"The seat-map key reads 'I# Independent, caucusing with Democrats', so the {seats['Before']['I']} independents count as I_D.")
    else:
        notes.append(f"Could not confirm from the seat-map key that independents caucus with Democrats (found: {caucus}); they are counted as 'other'.")

    for k, v in seats.items():
        check(f"'{k}' row: parties add up to its total ({v['total']})", v["D"] + v["R"] + v["I"] + v["other"] == v["total"])
    check("not_up + up == current, for every caucus", all(not_up[k] + up_by[k] == current[k] for k in keys))
    check(f"current total is 2 seats x {len(STATES)} states", total == 2 * len(STATES))

    # Seat map ('Change in composition' > 'Before the elections'): seats that are up carry a state label.
    seat_map = _seat_map(doc)
    letter = {"D": "D", "R": "R", "I": "I_D" if caucus == "D" else "other"}
    map_up = {k: 0 for k in keys}
    map_not_up = {k: 0 for k in keys}
    up_states: dict[str, list[str]] = {k: [] for k in keys}
    for seat in seat_map.values():
        bucket = letter[seat["party"]]
        if seat["up"]:
            map_up[bucket] += 1
            up_states[bucket].append(seat["state"] or seat["label"])
        else:
            map_not_up[bucket] += 1
    up_states = {k: sorted(v) for k, v in up_states.items()}
    specials = sorted(s["state"] or s["label"] for s in seat_map.values() if s["up"] and s["special"])
    check(f"seat map has {len(seat_map)} seats == total", len(seat_map) == total)
    check("seat map: seats not up by caucus == 'Not up' row", map_not_up == not_up)
    check("seat map: seats up by caucus == 'Up' row", map_up == up_by)
    check("seat map: every seat up names a state", all(s["state"] for s in seat_map.values() if s["up"]))

    # Infobox
    box = _infobox(doc)
    parties = box.get("parties", {})
    if parties:
        check(
            "infobox 'Current seats' == 'Before these elections' row",
            all(parties.get(p, {}).get("Current seats") == seats["Before"][p] for p in ("D", "R", "I") if p in parties),
        )
        check(
            "infobox 'Seats up' == 'Up' row",
            all(parties.get(p, {}).get("Seats up") == seats["Up"][p] for p in ("D", "R", "I") if p in parties),
        )
    if "up" in box:
        check(f"infobox '{box['up']} of the {box['total']} seats' == Up / total", (box["up"], box["total"]) == (up, total))

    # Vice president and majority thresholds
    vp_name, vp_party, evidence = _vice_president(doc)
    rule = RULE_RE.search(" ".join(doc.text_content().split()))
    thresholds: dict[str, int | None] = {"D": None, "R": None}
    if vp_party in ("D", "R"):
        notes.append(f"Vice president: {vp_name} ({vp_party}), from the page: \"{evidence[0]}\"")
    else:
        notes.append(f"Could not confirm the vice president's party from the page (matching sentences: {evidence}).")
    full = int(rule["full"]) if rule else box.get("majority")
    tie = int(rule["tie"]) if rule else None
    if rule:
        notes.append(f"Majority rule from the page: \"{rule.group(0)}\".")
    if vp_party in ("D", "R"):
        other_party = "R" if vp_party == "D" else "D"
        thresholds[vp_party], thresholds[other_party] = tie, full
        if tie is None:
            notes.append("The page's tie-break rule was not found, so the vice president's party threshold is unknown.")
    needed_d = parties.get("D", {}).get("Seats needed")
    if needed_d is not None and thresholds["D"] is not None:
        check(
            f"infobox: Democrats need {needed_d} more seats -> D + I_D + {needed_d} == threshold {thresholds['D']}",
            current["D"] + current["I_D"] + needed_d == thresholds["D"],
        )

    # Races file: incumbents of the seats up, by caucus.
    races = senate_races
    races_path = CLEAN / "races_senate_2026.csv"
    if races is None and races_path.exists():
        races = pd.read_csv(races_path)
    if races is None:
        notes.append("races_senate_2026.csv not found: the cross-check against the race list was skipped.")
    else:
        csv_up = {k: 0 for k in keys}
        csv_states: dict[str, str] = {}
        for rid, party in zip(races["race_id"].astype(str), races["incumbent_party"].fillna("").astype(str)):
            bucket = party if party in ("D", "R") else letter["I"] if party == "I" else "other"
            csv_up[bucket] += 1
            csv_states[rid[:2]] = bucket
        map_states = {s["state"]: letter[s["party"]] for s in seat_map.values() if s["up"]}
        mismatched = sorted(
            (str(st) for st in set(csv_states) | set(map_states) if csv_states.get(st) != map_states.get(st)), key=str
        )
        check(f"races file: {len(races)} races == 'Up' total", len(races) == up)
        check("races file: incumbents by caucus == 'Up' row", csv_up == up_by)
        check("races file: states and incumbent caucus == seat map" + (f" (differ: {mismatched})" if mismatched else ""), not mismatched)
        check(
            "not_up + races-file incumbents == current, totalling 100",
            all(not_up[k] + csv_up[k] == current[k] for k in keys) and sum(not_up.values()) + sum(csv_up.values()) == total,
        )
        if "special" in races:
            csv_specials = sorted(races.loc[races["special"].astype(str).str.lower() == "true", "race_id"].str[:2])
            check(f"races file: special elections {csv_specials} == seat map's", csv_specials == specials)
        independents = [rid for rid, p in zip(races["race_id"], races["incumbent_party"].fillna("")) if p == "I"]
        notes.append(
            f"races file: {len(races)} seats up, incumbents D {csv_up['D']}, R {csv_up['R']}, independent {len(independents)}"
            + (f" ({', '.join(independents)}, counted as {letter['I']})" if independents else "; no independent senator is up in 2026")
            + "."
        )

    caucus_not_up = {"D": not_up["D"] + not_up["I_D"], "R": not_up["R"]}
    wins_needed = {p: (thresholds[p] - caucus_not_up[p]) if thresholds[p] is not None else None for p in ("D", "R")}
    if all(v is not None for v in wins_needed.values()):
        notes.append(
            f"Democratic caucus (D + I_D) holds {caucus_not_up['D']} seats not up and needs {wins_needed['D']} of the {up} races "
            f"for {thresholds['D']}; Republicans hold {caucus_not_up['R']} and need {wins_needed['R']} for {thresholds['R']}."
        )

    failed = [c["check"] for c in checks if not c["ok"]]
    if failed and strict:
        raise ValueError("Senate composition failed consistency checks: " + "; ".join(failed))
    _warn(failed, "Senate composition")

    return {
        "not_up": not_up,
        "current": current,
        "up": up,
        "up_by_caucus": up_by,
        "up_states": up_states,
        "specials": specials,
        "total": total,
        "vice_president": vp_name,
        "vice_president_party": vp_party,
        "majority_threshold_for_D": thresholds["D"],
        "majority_threshold_for_R": thresholds["R"],
        "caucus_not_up": caucus_not_up,
        "wins_needed": wins_needed,
        "source": {"url": url, "revision": revid, "license": LICENSE},
        "checks": checks,
        "notes": notes,
    }


# ---------- House: mid-decade redistricting ----------

def _arrow_count(cell) -> tuple[int, bool]:
    """A count marked with an increase/decrease arrow -> (signed count, whether the sign was shown)."""
    text = cell_text(cell)
    m = re.search(r"\d+", text)
    if not m:
        return 0, True
    n = int(m.group(0))
    marks = " ".join(cell.xpath(".//@title|.//img/@alt")).lower()
    if "decrease" in marks or re.match(r"^\s*[−-]", text):
        return -n, True
    return n, "increase" in marks or text.strip().startswith("+")


def load_redistricting_changes(refresh: bool = False) -> pd.DataFrame:
    """Mid-decade redistricting before 2026: one row per state in the article's summary table
    (both enacted maps and efforts that left the districts in place).

        state, state_name   postal code and name
        status              as printed ('New districts enacted', 'Districts left in place')
        new_map             True when the status says new districts were enacted
        d_leaning_change, competitive_change, r_leaning_change
                            signed change in the number of Democratic-leaning, highly competitive
                            and Republican-leaning seats (the article marks the direction with
                            increase/decrease arrows; blank = 0)
        notes               the article's summary for the state, citations removed

    The article's definition of a competitive seat is kept in df.attrs['definition'] and its
    'Net change' row in df.attrs['net_change']. Checked: the state rows add up to the net row,
    and the new_map states equal states.REDRAWN_2026 (mismatches warn, see df.attrs['problems']).
    """
    doc, revid = _page(HOUSE_PAGE, refresh)
    table = next(
        (
            t
            for t in doc.xpath("//table[contains(@class,'wikitable')]")
            if t.xpath(".//tr") and "change in partisanship" in cell_text(t.xpath(".//tr")[0]).lower()
        ),
        None,
    )
    if table is None:
        raise ValueError("No mid-decade redistricting table ('Change in partisanship') on the House article")
    grid = table_grid(table)
    labels, n_head = _labels(grid)
    c_state = _col(labels, "state")
    c_status = _col(labels, "status")
    c_notes = _col(labels, "notes", required=False)
    kinds: dict[int, str] = {}
    for col in range(len(labels)):
        cell = grid[n_head - 1][col]
        title = (" ".join(cell.xpath(".//abbr/@title")) or cell_text(cell)).lower()
        if "democratic" in title or title == "d":
            kinds[col] = "d_leaning_change"
        elif "competitive" in title or title == "c":
            kinds[col] = "competitive_change"
        elif "republican" in title or title == "r":
            kinds[col] = "r_leaning_change"
    if len(kinds) != 3:
        raise ValueError(f"Expected D / C / R change columns in the redistricting table, got {labels}")
    notes = _footnotes(doc)
    header = next((c for c in grid[0] if "change in partisanship" in cell_text(c).lower()), None)
    definition = " ".join(_footnote_texts(header, notes)) if header is not None else ""

    rows, net, problems = [], None, []
    for row in grid[n_head:]:
        if len(row) <= max(kinds):
            continue
        name = cell_text(row[c_state])
        changes = {}
        for col, kind in kinds.items():
            value, signed = _arrow_count(row[col])
            changes[kind] = value
            if not signed:
                problems.append(f"{name}: {kind} {value} has no increase/decrease mark; read as positive")
        if name.lower().startswith("net change"):
            net = {"label": name, **changes}
            continue
        postal = POSTAL_BY_NAME.get(name)
        if postal is None:
            problems.append(f"unknown state {name!r}")
            continue
        status = cell_text(row[c_status])
        rows.append(
            {
                "state": postal,
                "state_name": name,
                "status": status,
                "new_map": "enacted" in status.lower() and "struck" not in status.lower(),
                **changes,
                "notes": cell_text(row[c_notes]) if c_notes is not None else "",
            }
        )
    df = pd.DataFrame(rows)

    if net is not None:
        for kind in kinds.values():
            if int(df[kind].sum()) != net[kind]:
                problems.append(f"{kind}: states add up to {int(df[kind].sum()):+d}, the net row says {net[kind]:+d}")
    else:
        problems.append("no 'Net change' row to check the state rows against")
    enacted = set(df.loc[df["new_map"], "state"])
    if enacted != REDRAWN_2026:
        problems.append(
            f"new maps on the page {sorted(enacted)} differ from states.REDRAWN_2026 {sorted(REDRAWN_2026)}"
        )
    _warn(problems, "redistricting")
    df.attrs.update(definition=definition, net_change=net, problems=problems, revision=revid)

    record_source(
        "wikipedia_redistricting",
        name="Wikipedia: 2026 United States House of Representatives elections, mid-decade redistricting summary",
        url=f"{WIKI}{HOUSE_PAGE}#Mid-decade_redistricting_changes",
        revision=revid,
        license=LICENSE,
        definition=definition,
    )
    return df


# ---------- House: crossover seats ----------

def load_crossover_seats(refresh: bool = False) -> pd.DataFrame:
    """House seats that voted for one party for president in 2024 and the other for the House:
    Democrats in seats Trump won and Republicans in seats Harris won, including seats that only
    became crossovers under the 2026 lines (the article's 'Crossover seats' tables).

        race_id             2026 district id ('ME-02')
        member              incumbent as listed; member_status is the note after the name
                            ('retiring', 'running in the 23rd district', ...) or ''
        member_party        party code as printed today (e.g. Kevin Kiley is listed as Independent)
        first_elected       as printed
        party_2024          D or R: the party that won the seat in 2024 (the table's section)
        via_redistricting   True for seats that only became crossovers through mid-decade redistricting
        pres24_margin       the article's 2024 presidential margin for the district, D minus R points
        house24_margin      the incumbent's own 2024 House margin, on the lines then in force
                            (D minus R points; 100 means unopposed)

    The PVI columns (Cook Partisan Voter Index, Cook's own measure) are not copied: the app's
    `lean` covers the same ground from data it can credit.
    """
    doc, revid = _page(HOUSE_PAGE, refresh)
    tables = _sections(doc).get("Crossover seats", [])
    if not tables:
        raise ValueError("No 'Crossover seats' tables on the House article")
    rows, problems = [], []
    for h3, table in tables:
        party_2024 = party_code(h3)
        grid = table_grid(table)
        labels, n_head = _labels(grid)
        c_loc = _col(labels, "location", "district")
        c_member = _col(labels, "member")
        c_party = _col(labels, "party")
        c_first = _col(labels, "first elected", required=False)
        c_pres = _col(labels, "trump margin", "harris margin")
        c_house = _col(labels, "incumbent margin")
        via = _col(labels, "original", required=False) is not None
        for row in grid[n_head:]:
            if len(row) <= max(c_loc, c_member, c_party, c_pres, c_house):
                continue
            m = DISTRICT_RE.match(cell_text(row[c_loc]))
            if not m or m["state"] not in POSTAL_BY_NAME:
                continue
            member = cell_text(row[c_member])
            mm = re.fullmatch(r"(?P<name>.*?)\s*\((?P<status>.*)\)", member)
            record = {
                "race_id": race_id(POSTAL_BY_NAME[m["state"]], 0 if m["num"] == "at-large" else int(m["num"])),
                "member": mm["name"] if mm else member,
                "member_status": mm["status"] if mm else "",
                "member_party": party_code(cell_text(row[c_party])),
                "first_elected": cell_text(row[c_first]) if c_first is not None else "",
                "party_2024": party_2024,
                "via_redistricting": via,
                "pres24_margin": _signed_margin(cell_text(row[c_pres])),
                "house24_margin": _signed_margin(cell_text(row[c_house])),
            }
            pres = record["pres24_margin"]
            if pres is None or (party_2024 == "D" and pres >= 0) or (party_2024 == "R" and pres <= 0):
                problems.append(f"{record['race_id']}: presidential margin {pres} does not make it a {party_2024} crossover")
            rows.append(record)
    df = pd.DataFrame(rows)
    _warn(problems, "crossover seats")
    df.attrs.update(problems=problems, revision=revid)

    record_source(
        "wikipedia_crossover_seats",
        name="Wikipedia: 2026 United States House of Representatives elections, crossover seats",
        url=f"{WIKI}{HOUSE_PAGE}#Crossover_seats",
        revision=revid,
        license=LICENSE,
    )
    return df


# ---------- run directly ----------

def main() -> None:
    pd.set_option("display.width", 220)
    pd.set_option("display.max_columns", 20)

    gb = load_generic_ballot()
    print(f"== Generic ballot: {len(gb)} aggregators ({gb.attrs['page']}, revision {gb.attrs['revision']})")
    print(gb.drop(columns=["url"]).to_string(index=False))
    for r in gb.itertuples():
        print(f"   {r.source}: {r.url or '(no link)'}")
    if gb.attrs["page_average"]:
        avg = gb.attrs["page_average"]
        print(f"   table's own Average row: D {avg['dem']} R {avg['rep']} margin {avg['margin']:+.2f} updated {avg['updated']}")
    print(f"   problems: {gb.attrs['problems'] or 'none'}")
    print("== current_environment(df)")
    print(json.dumps(current_environment(gb), indent=2))

    print("== Senate composition")
    print(json.dumps(load_senate_composition(), indent=2, ensure_ascii=False))

    red = load_redistricting_changes()
    print(f"== Mid-decade redistricting: {len(red)} states, {int(red['new_map'].sum())} with new maps")
    print(red.drop(columns=["notes"]).to_string(index=False))
    print(f"   net row: {red.attrs['net_change']}")
    print(f"   definition: {red.attrs['definition']}")
    print(f"   problems: {red.attrs['problems'] or 'none'}")

    xo = load_crossover_seats()
    print(f"== Crossover seats: {len(xo)} ({(xo['party_2024'] == 'D').sum()} D-held won by Trump, "
          f"{(xo['party_2024'] == 'R').sum()} R-held won by Harris; {int(xo['via_redistricting'].sum())} via redistricting)")
    print(xo.to_string(index=False))
    house_path = CLEAN / "races_house_2026.csv"
    if house_path.exists():
        house = pd.read_csv(house_path).set_index("race_id")
        both = xo.join(house[["pres24_margin", "held_by"]], on="race_id", rsuffix="_ours")
        diff = (both["pres24_margin"] - both["pres24_margin_ours"]).abs()
        print(f"   vs races_house_2026.csv pres24_margin: {int((diff <= ROUNDING).sum())} of {len(both)} within {ROUNDING} pt; "
              f"max gap {diff.max():.2f} pt")
        print(both.loc[diff > ROUNDING, ["race_id", "pres24_margin", "pres24_margin_ours"]].to_string(index=False))
    print(f"   problems: {xo.attrs['problems'] or 'none'}")


if __name__ == "__main__":
    main()
