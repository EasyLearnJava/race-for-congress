"""Decide what the nightly refresh may publish on its own.

Compares data/clean against the last commit (or a given git ref) and sorts the changes:
  * nothing changed except meta.json dates  -> exit 0, nothing to commit
  * routine changes (money, a few ratings)  -> exit 10, commit straight to main
  * unusual changes                         -> exit 20, open a pull request for a person to check

Unusual means what vandalism or a broken parser looks like: a major-party nominee replaced,
a rating moving three or more steps at once, many ratings moving in one night, a forecaster's
rows disappearing, the polling average jumping, or the money tables shrinking.

Usage (from the repo root):
    .venv/Scripts/python pipeline/diff_guard.py [--base HEAD] [--summary out.md]
"""

from __future__ import annotations

import argparse
import io
import json
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
CLEAN = ROOT / "data" / "clean"

NO_CHANGE, ROUTINE, REVIEW = 0, 10, 20

# Thresholds for "unusual". Forecasters publish in batches, so a few dozen moves can be real.
MAX_RATING_CHANGES = 60
MAX_RATING_STEP = 3  # e.g. Likely D (2) to Lean R (-1)
MAX_HOUSE_NOMINEE_CHANGES = 3
MAX_ENV_SHIFT = 2.0  # points of national margin in one night
MIN_SHARE_KEPT = 0.9  # a table or forecaster keeping fewer rows than this looks like a parse break

NOMINEE_COLUMNS = ["dem_candidate", "rep_candidate"]
EXAMPLES = 12


@dataclass
class Report:
    changed_files: list[str] = field(default_factory=list)
    review: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    details: list[str] = field(default_factory=list)

    @property
    def status(self) -> int:
        if not self.changed_files:
            return NO_CHANGE
        return REVIEW if self.review else ROUTINE

    def markdown(self) -> str:
        verdict = {NO_CHANGE: "No data changed.", ROUTINE: "Routine changes: committed to main.", REVIEW: "Unusual changes: needs a person to check before publishing."}[self.status]
        lines = [f"### Nightly data refresh\n\n**{verdict}**\n"]
        if self.changed_files:
            lines.append("Changed: " + ", ".join(f"`{f}`" for f in self.changed_files) + "\n")
        if self.review:
            lines += ["**Why it needs review**\n", *[f"- {r}" for r in self.review], ""]
        if self.notes:
            lines += ["**Summary**\n", *[f"- {n}" for n in self.notes], ""]
        if self.details:
            lines += ["<details><summary>Details</summary>\n", *self.details, "\n</details>"]
        return "\n".join(lines) + "\n"


def _old_text(base: str, name: str) -> str | None:
    result = subprocess.run(["git", "show", f"{base}:data/clean/{name}"], cwd=ROOT, capture_output=True)
    return result.stdout.decode("utf-8") if result.returncode == 0 else None


def _norm(text: str | None) -> str | None:
    return None if text is None else text.replace("\r\n", "\n")


def _csv(text: str | None) -> pd.DataFrame:
    return pd.read_csv(io.StringIO(text), dtype=str, keep_default_na=False) if text else pd.DataFrame()


def _num(s: pd.Series) -> pd.Series:
    return pd.to_numeric(s, errors="coerce").fillna(0)


def compare_nominees(old: pd.DataFrame, new: pd.DataFrame, chamber: str, report: Report) -> int:
    if old.empty or new.empty:
        return 0
    merged = old.merge(new, on="race_id", suffixes=("_old", "_new"))
    changed = []
    for col in NOMINEE_COLUMNS + ["other_candidates", "incumbent"]:
        diff = merged[merged[f"{col}_old"] != merged[f"{col}_new"]]
        for _, row in diff.iterrows():
            changed.append((row["race_id"], col, row[f"{col}_old"], row[f"{col}_new"]))
    major = {race for race, col, *_ in changed if col in NOMINEE_COLUMNS or col == "incumbent"}
    if changed:
        report.notes.append(f"{chamber}: {len(changed)} candidate field(s) changed in {len({c[0] for c in changed})} race(s)")
        report.details += [f"- {race} `{col}`: {a or '(blank)'} → {b or '(blank)'}" for race, col, a, b in changed[:EXAMPLES]]
    limit = 0 if chamber == "Senate" else MAX_HOUSE_NOMINEE_CHANGES
    if len(major) > limit:
        report.review.append(f"{chamber}: a major-party nominee or incumbent changed in {len(major)} race(s): {', '.join(sorted(major)[:EXAMPLES])}")
    return len(changed)


def compare_ratings(old: pd.DataFrame, new: pd.DataFrame, report: Report) -> None:
    if old.empty or new.empty:
        return
    key = ["chamber", "race_id", "source"]
    for source, n_old in old.groupby("source").size().items():
        n_new = int((new["source"] == source).sum())
        if n_new < MIN_SHARE_KEPT * n_old:
            report.review.append(f"Ratings: {source} went from {n_old} to {n_new} rows (a table may have failed to parse)")
    merged = old.merge(new, on=key, suffixes=("_old", "_new"))
    moved = merged[merged["score_old"] != merged["score_new"]].copy()
    if moved.empty:
        return
    moved["step"] = (_num(moved["score_new"]) - _num(moved["score_old"])).abs()
    report.notes.append(f"Ratings: {len(moved)} moved")
    report.details += [
        f"- {r.race_id} · {r.source}: {r.rating_old} → {r.rating_new}" for r in moved.sort_values("step", ascending=False).head(EXAMPLES).itertuples()
    ]
    if len(moved) > MAX_RATING_CHANGES:
        report.review.append(f"Ratings: {len(moved)} moved in one night (limit {MAX_RATING_CHANGES})")
    big = moved[moved["step"] >= MAX_RATING_STEP]
    if not big.empty:
        report.review.append("Ratings: moved three or more steps at once: " + ", ".join(f"{r.race_id} ({r.source})" for r in big.head(EXAMPLES).itertuples()))


def compare_meta(old: dict, new: dict, report: Report) -> None:
    o, n = (old.get("environment") or {}).get("margin"), (new.get("environment") or {}).get("margin")
    if o is not None and n is not None and o != n:
        report.notes.append(f"Polling average: {o:+.2f} → {n:+.2f}")
        if abs(n - o) > MAX_ENV_SHIFT:
            report.review.append(f"Polling average moved {abs(n - o):.1f} points in one night")
    if old.get("senate_composition", {}).get("not_up") != new.get("senate_composition", {}).get("not_up"):
        report.review.append("Senate seats not up for election changed")
    for w in new.get("warnings") or []:
        report.notes.append(f"Pipeline warning: {w}")


def compare_money(old: pd.DataFrame, new: pd.DataFrame, name: str, total_col: str, report: Report) -> None:
    if old.empty or new.empty:
        return
    o, n = _num(old[total_col]).sum(), _num(new[total_col]).sum()
    report.notes.append(f"{name}: {len(old)} → {len(new)} rows, total ${o / 1e6:,.1f}M → ${n / 1e6:,.1f}M")
    if len(new) < MIN_SHARE_KEPT * len(old) or n < MIN_SHARE_KEPT * o:
        report.review.append(f"{name} shrank ({len(old)} → {len(new)} rows, ${o / 1e6:,.1f}M → ${n / 1e6:,.1f}M)")


def assess(old: dict[str, str | None], new: dict[str, str | None]) -> Report:
    """Compare two snapshots of data/clean, each a mapping of file name to its text."""
    report = Report()
    report.changed_files = sorted(f for f in new if f != "meta.json" and _norm(old.get(f)) != _norm(new.get(f)))
    if not report.changed_files:
        return report
    compare_nominees(_csv(old.get("races_house_2026.csv")), _csv(new.get("races_house_2026.csv")), "House", report)
    compare_nominees(_csv(old.get("races_senate_2026.csv")), _csv(new.get("races_senate_2026.csv")), "Senate", report)
    compare_ratings(_csv(old.get("ratings_2026.csv")), _csv(new.get("ratings_2026.csv")), report)
    compare_money(_csv(old.get("money_2026.csv")), _csv(new.get("money_2026.csv")), "Candidate money", "receipts", report)
    compare_money(_csv(old.get("outside_spending_2026.csv")), _csv(new.get("outside_spending_2026.csv")), "Outside spending", "total", report)
    compare_meta(json.loads(old.get("meta.json") or "{}"), json.loads(new.get("meta.json") or "{}"), report)
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base", default="HEAD", help="git ref to compare against (default HEAD)")
    parser.add_argument("--summary", type=Path, help="also write the markdown summary to this file")
    args = parser.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")  # the summary uses arrows; Windows consoles default to cp1252

    names = sorted(p.name for p in CLEAN.iterdir() if p.is_file())
    new = {n: (CLEAN / n).read_text("utf-8") for n in names}
    old = {n: _old_text(args.base, n) for n in names}
    report = assess(old, new)
    text = report.markdown()
    print(text)
    if args.summary:
        args.summary.write_text(text, "utf-8")
    return report.status


if __name__ == "__main__":
    sys.exit(main())
