"""Merge the sources into the race tables the app reads: House, Senate and published ratings."""

from __future__ import annotations

import json

import numpy as np
import pandas as pd

from common import CLEAN, load_sources, today
from downballot import load_presidential
from states import NAME_BY_POSTAL, RANKED_CHOICE, REDRAWN_2026
from wikipedia import load_house_races, load_house_ratings, load_senate_races, load_senate_ratings

CLASSIC_RATERS = {"Cook Political Report": "cook", "Inside Elections": "ie", "Sabato's Crystal Ball": "sabato"}


def margin(dem: pd.Series, rep: pd.Series, total: pd.Series) -> pd.Series:
    """Democratic minus Republican share of the vote, in percentage points."""
    return ((dem - rep) / total.where(total > 0) * 100).astype("float64").round(2)


def consensus_label(score: float) -> str:
    strength = abs(score)
    if strength < 0.5:
        return "Tossup"
    word = "Safe" if strength >= 2.5 else "Likely" if strength >= 1.5 else "Lean"
    return f"{word} {'D' if score > 0 else 'R'}"


def summarize_ratings(ratings: pd.DataFrame, races: pd.DataFrame, fallback_margin: pd.Series) -> pd.DataFrame:
    """Median of every published rating per race; unrated races count as safe for the party they lean to."""
    grouped = ratings.groupby("race_id")["score"]
    out = pd.DataFrame(index=races["race_id"])
    out["rating_score"] = grouped.median().reindex(out.index)
    out["rating_count"] = grouped.size().reindex(out.index).fillna(0).astype(int)
    unrated = out["rating_score"].isna()
    out.loc[unrated, "rating_score"] = np.sign(fallback_margin.to_numpy())[unrated.to_numpy()] * 3
    out["rating_consensus"] = out["rating_score"].map(consensus_label)
    for source, column in CLASSIC_RATERS.items():
        latest = ratings[ratings["source"] == source].set_index("race_id")["rating"]
        out[f"rating_{column}"] = latest.reindex(out.index).fillna("")
    return out.reset_index()


def split_candidates(candidates: object) -> dict:
    people = candidates if isinstance(candidates, list) else []
    dems = [p["name"] for p in people if p["party"] == "D"]
    reps = [p["name"] for p in people if p["party"] == "R"]
    indies = [p["name"] for p in people if p["party"] == "I"]
    others = [f"{p['name']} ({p['party_label']})" for p in people if p["party"] not in {"D", "R"}]
    if not people:
        case = "candidates_unknown"
    elif len(dems) >= 2 and not reps:
        case = "same_party_D"
    elif len(reps) >= 2 and not dems:
        case = "same_party_R"
    elif not dems and indies:
        case = "independent_vs_R" if reps else "no_republican"
    elif not dems:
        case = "no_democrat"
    elif not reps:
        case = "no_republican"
    else:
        case = ""
    return {
        "dem_candidate": " / ".join(dems),
        "rep_candidate": " / ".join(reps),
        "other_candidates": "; ".join(others),
        "special_case": case,
    }


def build_races(refresh: bool = False) -> dict:
    pres = load_presidential(refresh)
    national = pres[["harris_24", "trump_24", "total_24"]].sum()
    national_margin = round(float((national["harris_24"] - national["trump_24"]) / national["total_24"] * 100), 2)

    # ---------- House ----------
    # The Downballot assigns every 2026 seat the member whose old district it most resembles: that is
    # the party that notionally holds it, used to count gains and losses. The actual incumbent, if any,
    # and whether they are running, comes from Wikipedia.
    house = pres.rename(columns={"incumbent": "held_by_member", "incumbent_party": "held_by"})
    house["state_name"] = house["state"].map(NAME_BY_POSTAL)
    house["new_lines"] = house["state"].isin(REDRAWN_2026)
    house["ranked_choice"] = house["state"].isin(RANKED_CHOICE)
    house["pres24_margin"] = margin(house["harris_24"], house["trump_24"], house["total_24"])
    house["pres20_margin"] = margin(house["biden_20"], house["trump_20"], house["total_20"])
    house["lean"] = (house["pres24_margin"] - national_margin).round(2)

    wiki = load_house_races(refresh)
    house = house.merge(wiki, on="race_id", how="left")
    house["incumbent_running"] = house["incumbent_running"].fillna(False).astype(bool)
    house["open_seat"] = ~house["incumbent_running"]
    house = pd.concat([house, pd.DataFrame(house["candidates"].map(split_candidates).tolist(), index=house.index)], axis=1)

    house_ratings = load_house_ratings(refresh)
    house = house.merge(summarize_ratings(house_ratings, house, house["pres24_margin"]), on="race_id", how="left")

    house_columns = [
        "race_id", "state", "state_name", "district", "new_lines",
        "harris_24", "trump_24", "total_24", "pres24_margin", "lean",
        "biden_20", "trump_20", "total_20", "pres20_margin", "held_by", "held_by_member",
        "incumbent", "incumbent_party", "first_elected", "incumbent_running", "open_seat",
        "incumbent_status", "other_incumbents", "redistricted_from",
        "dem_candidate", "rep_candidate", "other_candidates", "special_case", "ranked_choice",
        "rating_consensus", "rating_score", "rating_count", "rating_cook", "rating_ie", "rating_sabato",
    ]
    house = house[house_columns].sort_values(["state", "district"]).reset_index(drop=True)

    # ---------- Senate ----------
    by_state = pres.groupby("state")[["harris_24", "trump_24", "total_24"]].sum()
    senate = load_senate_races(refresh)
    senate["state"] = senate["race_id"].str[:2]
    senate["state_name"] = senate["state"].map(NAME_BY_POSTAL)
    senate = senate.join(by_state, on="state")
    senate["pres24_margin"] = margin(senate["harris_24"], senate["trump_24"], senate["total_24"])
    senate["lean"] = (senate["pres24_margin"] - national_margin).round(2)
    senate["open_seat"] = ~senate["incumbent_running"]
    senate["ranked_choice"] = senate["state"].isin(RANKED_CHOICE)
    senate = pd.concat([senate, pd.DataFrame(senate["candidates"].map(split_candidates).tolist(), index=senate.index)], axis=1)

    senate_ratings = load_senate_ratings(refresh)
    senate = senate.merge(summarize_ratings(senate_ratings, senate, senate["pres24_margin"]), on="race_id", how="left")

    senate_columns = [
        "race_id", "state", "state_name", "special",
        "harris_24", "trump_24", "total_24", "pres24_margin", "lean",
        "incumbent", "incumbent_party", "incumbent_running", "open_seat", "incumbent_status",
        "dem_candidate", "rep_candidate", "other_candidates", "special_case", "ranked_choice",
        "rating_consensus", "rating_score", "rating_count", "rating_cook", "rating_ie", "rating_sabato",
    ]
    senate = senate[senate_columns].sort_values("state").reset_index(drop=True)

    # ---------- Ratings, long format ----------
    ratings = pd.concat(
        [house_ratings.assign(chamber="house"), senate_ratings.assign(chamber="senate")], ignore_index=True
    )[["chamber", "race_id", "source", "rating", "score", "as_of"]].sort_values(["chamber", "race_id", "source"])

    CLEAN.mkdir(parents=True, exist_ok=True)
    house.to_csv(CLEAN / "races_house_2026.csv", index=False)
    senate.to_csv(CLEAN / "races_senate_2026.csv", index=False)
    ratings.to_csv(CLEAN / "ratings_2026.csv", index=False)

    meta = {
        "generated": today(),
        "national_2024": {
            "harris": int(national["harris_24"]),
            "trump": int(national["trump_24"]),
            "total": int(national["total_24"]),
            "margin": national_margin,
            "note": "Sum of The Downballot's district results; margin is Democratic minus Republican share, in points.",
        },
        "counts": {
            "house_races": len(house),
            "senate_races": len(senate),
            "house_rated": int((house["rating_count"] > 0).sum()),
            "ratings": len(ratings),
        },
        "sources": load_sources(),
    }
    (CLEAN / "meta.json").write_text(json.dumps(meta, indent=2), "utf-8")
    return meta
