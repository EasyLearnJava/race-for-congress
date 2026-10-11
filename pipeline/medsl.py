"""House election results by district since 2002, from the MIT Election Data + Science Lab."""

from __future__ import annotations

import numpy as np
import pandas as pd

from common import CLEAN, RAW, ROOT, record_source

DATASET_PAGE = "https://doi.org/10.7910/DVN/IG0UN2"
FIRST_YEAR = 2002  # first election on post-2000-census lines; enough history for the app


def _flag(series: pd.Series) -> pd.Series:
    return series.astype("string").str.upper().eq("TRUE").fillna(False).astype(bool)


def build_house_history(refresh: bool = False) -> pd.DataFrame | None:
    # Dataverse asks each downloader to fill in a short form, so this file is downloaded by hand.
    folder = RAW / "medsl"
    path = next((p for p in (folder / "1976-2024-house.tab", folder / "1976-2024-house.csv") if p.exists()), None)
    if path is None:
        print(f"  skipped: download 1976-2024-house.tab from {DATASET_PAGE}")
        print(f"           into {folder.relative_to(ROOT)}/ and run the pipeline again")
        return None
    record_source(
        "medsl_house",
        name="MIT Election Data and Science Lab, U.S. House 1976–2024",
        url=DATASET_PAGE,
        license="CC0 1.0",
    )

    df = pd.read_csv(path, sep="\t" if path.suffix == ".tab" else ",", low_memory=False)
    df = df[df["stage"].astype("string").str.upper().eq("GEN") & ~_flag(df["special"]) & (df["year"] >= FIRST_YEAR)].copy()
    df["party"] = df["party"].fillna("").astype("string").str.upper()
    df["candidate"] = df["candidate"].fillna("").astype("string")
    df["candidatevotes"] = pd.to_numeric(df["candidatevotes"], errors="coerce").fillna(0)
    race = ["year", "state_po", "district"]

    # Prefer total rows over per-voting-method rows, and runoffs over first rounds.
    df["is_total"] = df["mode"].fillna("TOTAL").astype("string").str.upper().eq("TOTAL")
    df = df[df["is_total"] | ~df.groupby(race)["is_total"].transform("any")]
    df["runoff"] = _flag(df["runoff"])
    df = df[df["runoff"] | ~df.groupby(race)["runoff"].transform("any")]

    # Fusion voting (e.g. New York) lists a candidate once per party line: add the lines up.
    df["is_dem"] = df["party"].str.contains("DEMOCRAT", regex=False)
    df["is_rep"] = df["party"].str.contains("REPUBLICAN", regex=False)
    df["dem_line"] = df["candidatevotes"].where(df["is_dem"], 0)
    df["rep_line"] = df["candidatevotes"].where(df["is_rep"], 0)
    cand = df.groupby(race + ["candidate"], as_index=False).agg(
        votes=("candidatevotes", "sum"),
        is_dem=("is_dem", "any"),
        is_rep=("is_rep", "any"),
        dem_line=("dem_line", "sum"),
        rep_line=("rep_line", "sum"),
    )
    both = cand["is_dem"] & cand["is_rep"]
    cand["side"] = np.select(
        [cand["is_rep"] & ~cand["is_dem"], cand["is_dem"] & ~cand["is_rep"], both & (cand["rep_line"] >= cand["dem_line"]), both],
        ["R", "D", "R", "D"],
        "O",
    )

    votes = cand.pivot_table(index=race, columns="side", values="votes", aggfunc="sum", fill_value=0)
    votes = votes.reindex(columns=["D", "R", "O"], fill_value=0)
    counts = cand.groupby(race)["side"].value_counts().unstack(fill_value=0).reindex(columns=["D", "R"], fill_value=0)
    winners = cand.sort_values("votes", ascending=False).drop_duplicates(race).set_index(race)

    out = pd.DataFrame(
        {
            "dem_votes": votes["D"].astype("int64"),
            "rep_votes": votes["R"].astype("int64"),
            "other_votes": votes["O"].astype("int64"),
            "dem_candidates": counts["D"].reindex(votes.index, fill_value=0),
            "rep_candidates": counts["R"].reindex(votes.index, fill_value=0),
        }
    )
    out["total_votes"] = out[["dem_votes", "rep_votes", "other_votes"]].sum(axis=1)
    out["winner_party"] = winners["side"].reindex(out.index)
    out["winner"] = winners["candidate"].reindex(out.index).str.title()
    out = out.reset_index().rename(columns={"state_po": "state"})
    out["district"] = out["district"].astype(int)
    out["race_id"] = out["state"] + "-" + out["district"].map(lambda d: "AL" if d == 0 else f"{d:02d}")

    contested = (out["dem_candidates"] > 0) & (out["rep_candidates"] > 0) & (out["total_votes"] > 0)
    margin = (out["dem_votes"] - out["rep_votes"]) / out["total_votes"].where(out["total_votes"] > 0) * 100
    out["margin"] = margin.where(contested).round(2)
    out["contested"] = contested

    columns = ["year", "race_id", "state", "district", "dem_votes", "rep_votes", "other_votes", "total_votes",
               "margin", "contested", "winner_party", "winner"]
    out = out[columns].sort_values(["year", "state", "district"]).reset_index(drop=True)
    CLEAN.mkdir(parents=True, exist_ok=True)
    out.to_csv(CLEAN / "house_history.csv", index=False)
    return out
