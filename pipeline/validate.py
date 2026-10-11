"""Check the clean datasets before the app uses them. Exits non-zero if anything is wrong."""

from __future__ import annotations

import json
import sys
import unicodedata
from datetime import date

import pandas as pd
import pandera.pandas as pa

from common import CLEAN
from states import REDRAWN_2026, SEATS_BY_POSTAL
from wikipedia import RATING_SOURCES

RATING_LABELS = ["Safe D", "Likely D", "Lean D", "Tossup", "Lean R", "Likely R", "Safe R"]
SPECIAL_CASES = ["same_party_D", "same_party_R", "no_democrat", "no_republican", "independent_vs_R", "candidates_unknown"]
PARTIES = ["D", "R", "I", "L", "G", "O"]

votes = pa.Column(int, pa.Check.gt(0), coerce=True)
share = pa.Column(float, pa.Check.in_range(-100, 100), coerce=True)
optional_text = pa.Column(str, nullable=True, coerce=True)

house_schema = pa.DataFrameSchema(
    {
        "race_id": pa.Column(str, pa.Check.str_matches(r"^[A-Z]{2}-(\d{2}|AL)$"), unique=True),
        "state": pa.Column(str, pa.Check.isin(list(SEATS_BY_POSTAL))),
        "district": pa.Column(int, pa.Check.in_range(0, 52), coerce=True),
        "new_lines": pa.Column(bool, coerce=True),
        "harris_24": votes, "trump_24": votes, "total_24": votes,
        "pres24_margin": share, "lean": share,
        "pres20_margin": pa.Column(float, pa.Check.in_range(-100, 100), nullable=True, coerce=True),
        "held_by": pa.Column(str, pa.Check.isin(PARTIES)),
        "incumbent": optional_text,
        "incumbent_party": pa.Column(str, pa.Check.isin(PARTIES), nullable=True, coerce=True),
        "incumbent_running": pa.Column(bool, coerce=True),
        "open_seat": pa.Column(bool, coerce=True),
        "dem_candidate": optional_text, "rep_candidate": optional_text,
        "special_case": pa.Column(str, pa.Check.isin(SPECIAL_CASES), nullable=True, coerce=True),
        "rating_consensus": pa.Column(str, pa.Check.isin(RATING_LABELS)),
        "rating_score": pa.Column(float, pa.Check.in_range(-3, 3), coerce=True),
        "rating_count": pa.Column(int, pa.Check.ge(0), coerce=True),
    },
    checks=[
        pa.Check(lambda df: len(df) == 435, error="House must have 435 races"),
        pa.Check(lambda df: df["state"].value_counts().to_dict() == SEATS_BY_POSTAL, error="Seats per state must match the 2020 apportionment"),
        pa.Check(lambda df: (df["harris_24"] + df["trump_24"] <= df["total_24"]).all(), error="Two-party votes exceed total"),
        pa.Check(lambda df: (df["new_lines"] == df["state"].isin(REDRAWN_2026)).all(), error="new_lines must match the redrawn states"),
        pa.Check(lambda df: (df["open_seat"] != df["incumbent_running"]).all(), error="open_seat must be the opposite of incumbent_running"),
    ],
)

senate_schema = pa.DataFrameSchema(
    {
        "race_id": pa.Column(str, pa.Check.str_matches(r"^[A-Z]{2}-SEN$"), unique=True),
        "state": pa.Column(str, pa.Check.isin(list(SEATS_BY_POSTAL)), unique=True),
        "special": pa.Column(bool, coerce=True),
        "harris_24": votes, "trump_24": votes, "total_24": votes,
        "pres24_margin": share, "lean": share,
        "incumbent": optional_text,
        "incumbent_party": pa.Column(str, pa.Check.isin(PARTIES), nullable=True, coerce=True),
        "special_case": pa.Column(str, pa.Check.isin(SPECIAL_CASES), nullable=True, coerce=True),
        "rating_consensus": pa.Column(str, pa.Check.isin(RATING_LABELS)),
        "rating_count": pa.Column(int, pa.Check.ge(0), coerce=True),
    },
    checks=[
        pa.Check(lambda df: len(df) == 35, error="Senate must have 35 races (33 regular + 2 specials)"),
        pa.Check(lambda df: set(df.loc[df["special"], "state"]) == {"FL", "OH"}, error="Specials must be Florida and Ohio"),
    ],
)

ratings_schema = pa.DataFrameSchema(
    {
        "chamber": pa.Column(str, pa.Check.isin(["house", "senate"])),
        "race_id": pa.Column(str),
        "source": pa.Column(str, pa.Check.isin(list(RATING_SOURCES.values()))),
        "rating": pa.Column(str, pa.Check.str_matches(r"^(Tossup|(Safe|Likely|Lean|Tilt) [DRI])$")),
        "score": pa.Column(float, pa.Check.in_range(-3, 3), coerce=True),
        "as_of": pa.Column(str, pa.Check(lambda s: pd.to_datetime(s, errors="coerce").between("2025-01-01", str(date.today())).all())),
    },
    unique=["chamber", "race_id", "source"],
)

history_schema = pa.DataFrameSchema(
    {
        "year": pa.Column(int, pa.Check.isin(list(range(2002, 2025, 2))), coerce=True),
        "race_id": pa.Column(str, pa.Check.str_matches(r"^[A-Z]{2}-(\d{2}|AL)$")),
        "dem_votes": pa.Column(int, pa.Check.ge(0), coerce=True),
        "rep_votes": pa.Column(int, pa.Check.ge(0), coerce=True),
        "total_votes": pa.Column(int, pa.Check.ge(0), coerce=True),
        "margin": pa.Column(float, pa.Check.in_range(-100, 100), nullable=True, coerce=True),
    },
    unique=["year", "race_id"],
)


def main() -> int:
    failures = 0
    warnings: list[str] = []

    def check(name: str, schema: pa.DataFrameSchema, df: pd.DataFrame) -> None:
        nonlocal failures
        try:
            schema.validate(df, lazy=True)
            print(f"  ok    {name} ({len(df)} rows)")
        except pa.errors.SchemaErrors as err:
            failures += 1
            print(f"  FAIL  {name}")
            print(err.failure_cases[["column", "check", "failure_case", "index"]].head(20).to_string())

    house = pd.read_csv(CLEAN / "races_house_2026.csv")
    senate = pd.read_csv(CLEAN / "races_senate_2026.csv")
    ratings = pd.read_csv(CLEAN / "ratings_2026.csv")
    history_file = CLEAN / "house_history.csv"
    history = pd.read_csv(history_file) if history_file.exists() else None
    hexmap = json.loads((CLEAN / "hexmap_2026.json").read_text("utf-8"))
    meta = json.loads((CLEAN / "meta.json").read_text("utf-8"))

    print("Schemas")
    check("races_house_2026.csv", house_schema, house)
    check("races_senate_2026.csv", senate_schema, senate)
    check("ratings_2026.csv", ratings_schema, ratings)
    if history is None:
        warnings.append("house_history.csv not built yet (needs the manual MIT Election Lab download)")
    else:
        check("house_history.csv", history_schema, history)

    print("Cross-checks")
    known = {"house": set(house["race_id"]), "senate": set(senate["race_id"])}
    orphans = ratings[~ratings.apply(lambda r: r["race_id"] in known[r["chamber"]], axis=1)]
    hex_ids = {d["id"] for d in hexmap["districts"]}
    margin = meta["national_2024"]["margin"]
    cross = [
        ("every rating belongs to a race", orphans.empty),
        ("hexmap has the same 435 districts", hex_ids == known["house"]),
        ("hexmap has 50 states", len(hexmap["states"]) == 50),
        (f"national 2024 margin is about R+1.5 (got {margin:+.2f})", -2.5 < margin < -0.5),
    ]
    if history is not None:
        cross.append(("each history year covers 400+ districts", history.groupby("year").size().min() >= 400))
    for label, ok in cross:
        failures += not ok
        print(f"  {'ok  ' if ok else 'FAIL'}  {label}")

    def plain(text: object) -> str:
        return unicodedata.normalize("NFKD", str(text)).encode("ascii", "ignore").decode().lower()

    def first_and_last(name: object) -> list[str]:
        parts = [p for p in plain(name).split() if p.strip(".,") not in {"jr", "sr", "ii", "iii", "iv"}]
        return [parts[0], parts[-1]] if parts else []

    both = pd.concat([house, senate], ignore_index=True)
    names = both[["dem_candidate", "rep_candidate", "other_candidates"]].fillna("").agg(" ".join, axis=1).map(plain)
    listed = [
        bool(first_and_last(inc)) and all(token in text for token in first_and_last(inc))
        for inc, text in zip(both["incumbent"].fillna(""), names)
    ]
    disagree = both[both["incumbent"].notna() & (pd.Series(listed) != both["incumbent_running"])]
    if len(disagree):
        warnings.append(
            "incumbent running status disagrees with the candidate list (check by hand): "
            + ", ".join(f"{r.race_id} ({r.incumbent}: {r.incumbent_status})" for r in disagree.itertuples())
        )

    close_unrated = house[(house["rating_count"] == 0) & (house["pres24_margin"].abs() < 5)]
    if len(close_unrated):
        warnings.append(f"{len(close_unrated)} close House seats have no published rating: {', '.join(close_unrated['race_id'])}")
    unknown = pd.concat([house, senate])
    unknown = unknown[unknown["special_case"] == "candidates_unknown"]
    if len(unknown):
        warnings.append(f"{len(unknown)} races have no candidate list: {', '.join(unknown['race_id'])}")
    unrated_senate = senate[senate["rating_count"] == 0]
    if len(unrated_senate):
        warnings.append(f"Senate races without ratings: {', '.join(unrated_senate['race_id'])}")

    if warnings:
        print("Warnings")
        for w in warnings:
            print(f"  note  {w}")
    print("PASSED" if not failures else f"FAILED ({failures})")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
