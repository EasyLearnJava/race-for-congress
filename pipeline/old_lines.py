"""2024 presidential results on the congressional lines used in 2024, to measure the 2026 redistricting effect.

The Downballot publishes the 2024 presidential vote for every House district twice: on the lines used in the
2024 election (119th Congress, this module) and on the lines used in 2026 (downballot.py). Nine states redrew
for 2026 (states.REDRAWN_2026; Missouri must keep its 2024 map). Both sheets count the same voters, so comparing
the two sets of lines shows how many seats each new map moved at a fixed vote. In the other 41 states the two
sheets are identical, district for district.
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from pathlib import Path

import numpy as np
import pandas as pd

from common import CLEAN, RAW, fetch, record_source
from states import REDRAWN_2026, SEATS_BY_POSTAL

# "2020 & 2024 presidential election results for congressional districts used in the 2024 elections",
# linked under "Historical Data" on The Downballot's results page.
SHEET = "1ng1i_Dm_RMDnEvauH44pgE6JCUsapcuu8F2pCfeLWFo"
VOTE_TOTALS_GID = "1491069057"
SHEET_URL = f"https://docs.google.com/spreadsheets/d/{SHEET}/edit?gid={VOTE_TOTALS_GID}"
PAGE = "https://the-db.co/presbycd"  # the link The Downballot asks users to cite

NATIONAL_MARGIN_2024 = -1.65  # D minus R, sum of all 435 districts on either set of lines (meta.json)
SWING_LEAN = 5.0  # a seat within this many points of the national margin counts as a swing seat
TOLERANCE_PCT = 0.5  # statewide sums on the old and new lines must agree this closely (same voters)
ENVIRONMENTS = tuple(sorted({*range(-10, 11), NATIONAL_MARGIN_2024}))  # national margins for the seat curve

PARTIES = ["D", "R", "I", "L", "G", "O"]
VOTES = ["harris_24", "trump_24", "total_24", "biden_20", "trump_20", "total_20"]
# No `lean` column on purpose: the model's lean is always measured on the 2026 lines (see CLAUDE.md).
# district_changes() gives old_lean for comparison only.
COLUMNS = [
    "race_id", "state", "district", "member", "held_by",
    "harris_24", "trump_24", "total_24", "pres24_margin",
    "biden_20", "trump_20", "total_20", "pres20_margin", "source_note",
]
NOTE = "The Downballot, 2024 congressional lines ('Vote totals' tab)"


def _votes(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series.astype("string").str.replace(",", "", regex=False), errors="coerce").astype("Int64")


def _margin(dem: pd.Series, rep: pd.Series, total: pd.Series) -> pd.Series:
    """Democratic minus Republican share of the vote, in points (same rounding as build_races.margin)."""
    return ((dem - rep) / total.where(total > 0) * 100).astype("float64").round(2)


def _party(text: str) -> str:
    code = text.strip().strip("()").strip().upper()
    return code if code in PARTIES or not code else "O"


def national_margin(frame: pd.DataFrame) -> float:
    """National 2024 margin implied by a set of districts (only meaningful for all 435)."""
    totals = frame[["harris_24", "trump_24", "total_24"]].sum()
    return round(float((totals["harris_24"] - totals["trump_24"]) / totals["total_24"] * 100), 2)


def _find(labels: list[str], label: str, start: int = 0, end: int | None = None) -> int:
    for i in range(start, len(labels) if end is None else end):
        if labels[i] == label:
            return i
    raise ValueError(f"No {label!r} column in The Downballot sheet header: {labels}")


def _column_positions(raw: pd.DataFrame) -> dict[str, int]:
    """Read the two header rows ('District, Incumbent, Party, 2024 ... 2020' over 'Harris, Trump, Total ...').

    Looking columns up by name means a column The Downballot adds or moves fails loudly instead of shifting data.
    """
    first = raw[0].fillna("").str.strip()
    rows = first.index[first == "District"]
    if len(rows) == 0:
        raise ValueError("No 'District' header row in The Downballot sheet (did the download return a web page?)")
    r = raw.index.get_loc(rows[0])
    top = raw.iloc[r].fillna("").astype(str).str.strip().tolist()
    sub = raw.iloc[r + 1].fillna("").astype(str).str.strip().tolist()
    years = [i for i, label in enumerate(top) if label.isdigit()]
    positions = {"race_id": 0, "member": _find(top, "Incumbent"), "party": _find(top, "Party")}
    for year, fields in (
        ("2024", {"harris_24": "Harris", "trump_24": "Trump", "total_24": "Total"}),
        ("2020", {"biden_20": "Biden", "trump_20": "Trump", "total_20": "Total"}),
    ):
        start = _find(top, year)
        end = min((y for y in years if y > start), default=len(sub))
        for column, label in fields.items():
            positions[column] = _find(sub, label, start, end)
    return positions


def load_old_lines(refresh: bool = False, *, states: Iterable[str] | None = REDRAWN_2026) -> pd.DataFrame:
    """2024 (and 2020) presidential vote in every district on the 2024 lines, for the states that redrew for 2026.

    held_by is the party The Downballot lists for the seat: the party that won it in 2024 (special elections since
    have all been holds, and vacant seats keep the last holder's party). Pass states=None for all 435 districts.
    """
    path = fetch(
        f"https://docs.google.com/spreadsheets/d/{SHEET}/export",
        RAW / "downballot" / "presidential_by_district_2024_lines.csv",
        refresh=refresh,
        params={"format": "csv", "gid": VOTE_TOTALS_GID},
    )
    record_source(
        "downballot_presidential_2024_lines",
        name="The Downballot: 2020 & 2024 presidential results for congressional districts used in the 2024 elections",
        url=PAGE,
        sheet=SHEET_URL,
        license="Free to use with credit to The Downballot",
    )

    raw = pd.read_csv(path, header=None, dtype="string")
    positions = _column_positions(raw)
    df = pd.DataFrame({name: raw[col] for name, col in positions.items()})
    df["race_id"] = df["race_id"].str.strip()
    df = df[df["race_id"].str.fullmatch(r"[A-Z]{2}-(\d{2}|AL)", na=False)].copy()

    df["state"] = df["race_id"].str[:2]
    unknown = set(df["state"]) - set(SEATS_BY_POSTAL)
    if unknown:
        raise ValueError(f"Unexpected states in The Downballot's 2024-lines sheet: {sorted(unknown)}")
    df["district"] = df["race_id"].str[3:].replace("AL", "0").astype(int)
    df["member"] = df["member"].fillna("").str.strip()
    df["held_by"] = df["party"].fillna("").map(_party)
    for col in VOTES:
        df[col] = _votes(df[col])
    df["pres24_margin"] = _margin(df["harris_24"], df["trump_24"], df["total_24"])
    df["pres20_margin"] = _margin(df["biden_20"], df["trump_20"], df["total_20"])

    last_holder = df["member"].str.extract(r"^VACANT\s*\((?P<last>[^)]*)\)", flags=re.IGNORECASE)["last"]
    df["source_note"] = NOTE
    vacant = last_holder.notna()
    df.loc[vacant, "source_note"] = NOTE + "; seat vacant when the sheet was last updated, last held by " + last_holder[vacant]

    if states is not None:
        wanted = set(states)
        if wanted - set(SEATS_BY_POSTAL):
            raise ValueError(f"Unknown states: {sorted(wanted - set(SEATS_BY_POSTAL))}")
        df = df[df["state"].isin(wanted)]
    return df[COLUMNS].sort_values(["state", "district"]).reset_index(drop=True)


# ---------- Comparing the old and new lines ----------

def _redrawn(old: pd.DataFrame) -> list[str]:
    return sorted(REDRAWN_2026 & set(old["state"]))


def _district_margins(frame: pd.DataFrame) -> pd.Series:
    """Unrounded 2024 margin, so a seat shown as 0.00 is still counted for the side that carried it."""
    harris, trump, total = (frame[c].to_numpy(dtype="float64", na_value=np.nan) for c in ("harris_24", "trump_24", "total_24"))
    return pd.Series((harris - trump) / total * 100, index=frame.index)


def _seat_flags(frame: pd.DataFrame, national: float) -> pd.DataFrame:
    margin = _district_margins(frame)
    lean = margin - national
    return pd.DataFrame(
        {
            "state": frame["state"],
            "D": margin > 0,
            "R": margin < 0,
            "even_D": lean > 0,
            "even_R": lean < 0,
            "swing": lean.abs() < SWING_LEAN,
        }
    )


def summarize_redistricting(
    old: pd.DataFrame, new_house: pd.DataFrame, national: float = NATIONAL_MARGIN_2024
) -> pd.DataFrame:
    """One row per redrawn state: seats each party's presidential candidate carried on the old and new lines.

    *_lean_* counts use the 2024 result as it was (Trump won the national vote by 1.65 points). *_even_* counts
    use lean (margin minus the national margin), i.e. which side each seat favours when the national vote is tied:
    the usual neutral yardstick for a map, and less tied to 2024's Republican-leaning year. Both hold the vote fixed,
    so the change between old and new lines is the effect of the lines alone. net_change_vs_held_for_D compares the
    new lines with the seats Democrats actually won in 2024 instead (it also absorbs 2024 crossover winners).
    """
    states = _redrawn(old)
    old = old[old["state"].isin(states)]
    new = new_house[new_house["state"].isin(states)]
    o = _seat_flags(old, national).groupby("state").sum().reindex(states, fill_value=0)
    n = _seat_flags(new, national).groupby("state").sum().reindex(states, fill_value=0)
    held = old.groupby("state")["held_by"].value_counts().unstack(fill_value=0)
    held = held.reindex(index=states, columns=["D", "R"], fill_value=0)
    votes = new.groupby("state")[["harris_24", "trump_24", "total_24"]].sum().reindex(states)

    out = pd.DataFrame(index=pd.Index(states, name="state"))
    out["seats"] = [SEATS_BY_POSTAL[s] for s in states]
    out["statewide_margin_24"] = _margin(votes["harris_24"], votes["trump_24"], votes["total_24"])
    out["held_D_2024"] = held["D"]
    out["held_R_2024"] = held["R"]
    out["old_lean_D_seats"] = o["D"]
    out["old_lean_R_seats"] = o["R"]
    out["new_lean_D_seats"] = n["D"]
    out["new_lean_R_seats"] = n["R"]
    out["net_change_for_D"] = n["D"] - o["D"]
    out["net_change_vs_held_for_D"] = n["D"] - held["D"]
    out["old_even_D_seats"] = o["even_D"]
    out["old_even_R_seats"] = o["even_R"]
    out["new_even_D_seats"] = n["even_D"]
    out["new_even_R_seats"] = n["even_R"]
    out["net_change_for_D_even"] = n["even_D"] - o["even_D"]
    out["old_swing_seats"] = o["swing"]
    out["new_swing_seats"] = n["swing"]
    return out.reset_index()


def _flip(before: pd.Series, after: pd.Series) -> np.ndarray:
    return np.select([(before < 0) & (after > 0), (before > 0) & (after < 0)], ["to_D", "to_R"], "")


def district_changes(
    old: pd.DataFrame, new_house: pd.DataFrame, national: float = NATIONAL_MARGIN_2024
) -> pd.DataFrame:
    """One row per 2026 district in the redrawn states, next to the same-numbered district on the 2024 lines.

    The same number is the seat The Downballot carries the member and held_by over from (every named member in
    these states keeps their number), but a new map can move it to quite different ground. margin_shift is new
    minus old (positive = more Democratic); flip / flip_even say whether the side that carried it changed;
    crossover_old / crossover_new mark seats whose holding party lost the 2024 presidential vote there.
    """
    states = _redrawn(old)
    o = old[old["state"].isin(states)]
    n = new_house[new_house["state"].isin(states)]
    o = o.assign(m=_district_margins(o))[["race_id", "member", "held_by", "m"]]
    n = n.assign(m=_district_margins(n))[["race_id", "state", "district", "m"]]
    j = n.merge(o, on="race_id", how="left", suffixes=("_new", "_old"), validate="one_to_one")
    out = pd.DataFrame(
        {
            "race_id": j["race_id"],
            "state": j["state"],
            "district": j["district"],
            "old_member": j["member"],
            "held_by": j["held_by"],
            "old_pres24_margin": j["m_old"].round(2),
            "new_pres24_margin": j["m_new"].round(2),
            "margin_shift": (j["m_new"] - j["m_old"]).round(2),
            "old_lean": (j["m_old"] - national).round(2),
            "new_lean": (j["m_new"] - national).round(2),
            "flip": _flip(j["m_old"], j["m_new"]),
            "flip_even": _flip(j["m_old"] - national, j["m_new"] - national),
            "crossover_old": _crossover(j["held_by"], j["m_old"]),
            "crossover_new": _crossover(j["held_by"], j["m_new"]),
        }
    )
    return out.sort_values(["state", "district"]).reset_index(drop=True)


def _crossover(held_by: pd.Series, margin: pd.Series) -> np.ndarray:
    held = held_by.fillna("").to_numpy(dtype=object)
    return ((held == "D") & (margin < 0).to_numpy()) | ((held == "R") & (margin > 0).to_numpy())


def seats_by_environment(
    old: pd.DataFrame,
    new_house: pd.DataFrame,
    environments: Iterable[float] = ENVIRONMENTS,
    national: float = NATIONAL_MARGIN_2024,
) -> pd.DataFrame:
    """Seats Democrats carry on each map if the national margin (D minus R) were each environment.

    Uniform swing: every district moves with the national vote. The simplest standard model, enough to show
    where each map's seats sit (the default list includes the 2024 result, -1.65, and an even year, 0).
    """
    states = _redrawn(old)
    o = old[old["state"].isin(states)]
    n = new_house[new_house["state"].isin(states)]
    lean_o = _district_margins(o) - national
    lean_n = _district_margins(n) - national
    rows = []
    for env in environments:
        d_old = (lean_o + env > 0).groupby(o["state"]).sum()
        d_new = (lean_n + env > 0).groupby(n["state"]).sum()
        for s in states:
            rows.append(
                {
                    "state": s,
                    "environment": float(env),
                    "seats": SEATS_BY_POSTAL[s],
                    "old_D_seats": int(d_old.get(s, 0)),
                    "new_D_seats": int(d_new.get(s, 0)),
                }
            )
    out = pd.DataFrame(rows)
    out["net_change_for_D"] = out["new_D_seats"] - out["old_D_seats"]
    return out


# ---------- Checks ----------

def compare_statewide(old: pd.DataFrame, new_house: pd.DataFrame) -> pd.DataFrame:
    """Statewide 2024 vote of each redrawn state on the old and new lines: the same voters, so the sums should match."""
    states = _redrawn(old)
    cols = ["harris_24", "trump_24", "total_24"]
    o = old[old["state"].isin(states)]
    n = new_house[new_house["state"].isin(states)]
    o_sum = o.groupby("state")[cols].sum().reindex(states)
    n_sum = n.groupby("state")[cols].sum().reindex(states)

    out = pd.DataFrame(index=pd.Index(states, name="state"))
    out["seats"] = [SEATS_BY_POSTAL[s] for s in states]
    out["old_districts"] = o.groupby("state").size().reindex(states, fill_value=0)
    out["new_districts"] = n.groupby("state").size().reindex(states, fill_value=0)
    for col in cols:
        name = col.removesuffix("_24")
        out[f"{name}_old"] = o_sum[col].astype("Int64")
        out[f"{name}_new"] = n_sum[col].astype("Int64")
        out[f"{name}_diff"] = out[f"{name}_old"] - out[f"{name}_new"]
        out[f"{name}_diff_pct"] = (out[f"{name}_diff"] / out[f"{name}_new"] * 100).astype("float64").round(5)
    two_old = out["harris_old"] + out["trump_old"]
    two_new = out["harris_new"] + out["trump_new"]
    out["harris_trump_diff_pct"] = ((two_old - two_new) / two_new * 100).astype("float64").round(5)
    pct = out[["harris_diff_pct", "trump_diff_pct", "total_diff_pct", "harris_trump_diff_pct"]].abs()
    out["ok"] = (
        (out["old_districts"] == out["seats"])
        & (out["new_districts"] == out["seats"])
        & pct.le(TOLERANCE_PCT).all(axis=1)
    )
    return out.reset_index()


def check_old_lines(old: pd.DataFrame, new_house: pd.DataFrame, tolerance_pct: float = TOLERANCE_PCT) -> list[str]:
    """Every problem found in the old-lines data (empty list if it passes)."""
    problems = []
    missing = sorted(REDRAWN_2026 - set(old["state"]))
    if missing:
        problems.append(f"2024-lines data is missing redrawn states: {', '.join(missing)}")
    dupes = old.loc[old["race_id"].duplicated(), "race_id"]
    if len(dupes):
        problems.append(f"duplicate 2024-lines districts: {', '.join(dupes)}")
    votes = old[["harris_24", "trump_24", "total_24"]]
    if votes.isna().any().any():
        problems.append(f"2024-lines districts without vote totals: {', '.join(old.loc[votes.isna().any(axis=1), 'race_id'])}")
    bad = old[(votes.fillna(0) <= 0).any(axis=1) | (old["harris_24"] + old["trump_24"] > old["total_24"]).fillna(False)]
    if len(bad):
        problems.append(f"2024-lines districts with impossible vote totals: {', '.join(bad['race_id'])}")
    if not old["held_by"].isin(PARTIES).all():
        problems.append(f"2024-lines districts without a party: {', '.join(old.loc[~old['held_by'].isin(PARTIES), 'race_id'])}")
    for row in compare_statewide(old, new_house).itertuples():
        if row.old_districts != row.seats:
            problems.append(f"{row.state}: {row.old_districts} districts on the 2024 lines, expected {row.seats}")
        if row.new_districts != row.seats:
            problems.append(f"{row.state}: {row.new_districts} districts on the 2026 lines, expected {row.seats}")
        worst = max(abs(row.harris_diff_pct), abs(row.trump_diff_pct), abs(row.total_diff_pct), abs(row.harris_trump_diff_pct))
        if not worst <= tolerance_pct:
            problems.append(f"{row.state}: statewide 2024 vote differs by {worst:.3f}% between the 2024 and 2026 lines")
    return problems


def build_redistricting(
    refresh: bool = False, *, new_house: pd.DataFrame | None = None, out_dir: Path = CLEAN
) -> pd.DataFrame:
    """Write the 2024-lines districts and the redistricting tables next to races_house_2026.csv."""
    old = load_old_lines(refresh)
    if new_house is None:
        new_house = pd.read_csv(CLEAN / "races_house_2026.csv")
    national = national_margin(new_house) if len(new_house) == 435 else NATIONAL_MARGIN_2024
    summary = summarize_redistricting(old, new_house, national)
    out_dir.mkdir(parents=True, exist_ok=True)
    old.to_csv(out_dir / "house_2024_lines.csv", index=False)
    summary.to_csv(out_dir / "redistricting_2026.csv", index=False)
    district_changes(old, new_house, national).to_csv(out_dir / "redistricting_districts_2026.csv", index=False)
    seats_by_environment(old, new_house, national=national).to_csv(out_dir / "redistricting_curve_2026.csv", index=False)
    return summary


if __name__ == "__main__":
    pd.set_option("display.width", 250)
    pd.set_option("display.max_columns", 40)
    old = load_old_lines()
    house = pd.read_csv(CLEAN / "races_house_2026.csv")
    print(f"2024-lines districts: {len(old)} in {old['state'].nunique()} states; held_by {old['held_by'].value_counts().to_dict()}")
    print(compare_statewide(old, house).to_string(index=False))
    problems = check_old_lines(old, house)
    print("checks:", "ok" if not problems else problems)
    summary = summarize_redistricting(old, house)
    print(summary.to_string(index=False))
    print(summary.drop(columns=["state", "statewide_margin_24"]).sum().to_string())
