"""Optional datasets layered on the race tables: the polling average, the Senate's seats not up,
the 2024 lines (for the redistricting effect) and campaign money. Each source is independent:
if one fails, the others still build and meta.json records what is missing."""

from __future__ import annotations

import json
import traceback

import pandas as pd

from common import CLEAN, load_sources

MONEY_COLUMNS = [
    "race_id", "chamber", "party", "candidate", "fec_candidate_id", "fec_name", "receipts", "disbursements",
    "cash_on_hand", "individual_contributions", "candidate_self_funding", "debts", "coverage_end", "match_method",
]


def _step(name: str, warnings: list[str], fn):
    try:
        return fn()
    except Exception as exc:  # one optional source must not break the others
        warnings.append(f"{name}: {exc.__class__.__name__}: {exc}")
        print(f"  {name} FAILED: {exc}")
        traceback.print_exc(limit=2)
        return None


def build_extras(refresh: bool = False) -> dict:
    import context
    import fec
    import old_lines

    house = pd.read_csv(CLEAN / "races_house_2026.csv")
    senate = pd.read_csv(CLEAN / "races_senate_2026.csv")
    meta = json.loads((CLEAN / "meta.json").read_text("utf-8"))
    warnings: list[str] = []

    def generic_ballot():
        df = context.load_generic_ballot(refresh)
        df.to_csv(CLEAN / "generic_ballot_2026.csv", index=False)
        env = context.current_environment(df)
        if env.get("margin") is None:
            raise ValueError("no usable generic-ballot averages")
        meta["environment"] = {k: env[k] for k in ("margin", "as_of", "n_sources", "sources", "oldest", "min_margin", "max_margin", "by_source") if k in env}
        print(f"  environment {env['margin']:+.2f} from {env['n_sources']} averages as of {env['as_of']}")

    def composition():
        comp = context.load_senate_composition(refresh, senate_races=senate, strict=True)
        meta["senate_composition"] = {k: comp[k] for k in ("not_up", "current", "vice_president_party", "notes") if k in comp}
        print(f"  Senate not up: {comp['not_up']}, VP party {comp.get('vice_president_party')}")

    def redistricting():
        summary = old_lines.build_redistricting(refresh, new_house=house)
        print(f"  redistricting summary for {len(summary)} states")

    def money():
        df = fec.load_candidate_money(house, senate, refresh)
        df[[c for c in MONEY_COLUMNS if c in df.columns]].to_csv(CLEAN / "money_2026.csv", index=False)
        unmatched = df.attrs.get("unmatched")
        meta["money"] = {
            "matched_nominees": int(len(df)),
            "unmatched_nominees": int(len(unmatched)) if unmatched is not None else None,
            "latest_coverage": str(pd.to_datetime(df["coverage_end"], errors="coerce").max().date()) if len(df) else None,
        }
        by_race, by_spender = fec.load_outside_spending(house, senate, refresh)
        by_race.to_csv(CLEAN / "outside_spending_2026.csv", index=False)
        by_spender.to_csv(CLEAN / "outside_spenders_2026.csv", index=False)
        meta["money"]["outside_races"] = int(len(by_race))
        print(f"  money: {len(df)} nominees matched, outside spending in {len(by_race)} races")

    _step("generic ballot", warnings, generic_ballot)
    _step("senate composition", warnings, composition)
    _step("redistricting (2024 lines)", warnings, redistricting)
    _step("campaign money", warnings, money)

    meta["sources"] = load_sources()
    meta["warnings"] = warnings
    (CLEAN / "meta.json").write_text(json.dumps(meta, indent=2, default=str), "utf-8")
    return meta
