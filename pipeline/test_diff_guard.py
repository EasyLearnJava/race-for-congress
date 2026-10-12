"""Tests for the nightly publish gate. Run: .venv/Scripts/python -m unittest discover -s pipeline -p "test_*.py" """

from __future__ import annotations

import json
import unittest

from diff_guard import NO_CHANGE, REVIEW, ROUTINE, assess

SOURCES = ["Cook Political Report", "Sabato's Crystal Ball", "Inside Elections"]


def races_csv(rows: list[dict]) -> str:
    cols = ["race_id", "incumbent", "dem_candidate", "rep_candidate", "other_candidates"]
    return "\n".join([",".join(cols), *(",".join(r.get(c, "") for c in cols) for r in rows)]) + "\n"


def ratings_csv(scores: dict[tuple[str, str], int]) -> str:
    label = {3: "Safe D", 2: "Likely D", 1: "Lean D", 0: "Tossup", -1: "Lean R", -2: "Likely R", -3: "Safe R"}
    lines = ["chamber,race_id,source,rating,score,as_of"]
    lines += [f"house,{race},{src},{label[s]},{s}.0,2026-10-09" for (race, src), s in scores.items()]
    return "\n".join(lines) + "\n"


def money_csv(receipts: list[float]) -> str:
    return "\n".join(["race_id,party,receipts", *(f"XX-{i:02d},D,{r}" for i, r in enumerate(receipts))]) + "\n"


def snapshot(**overrides) -> dict[str, str]:
    house = [{"race_id": f"PA-{i:02d}", "incumbent": f"Member {i}", "dem_candidate": f"Dem {i}", "rep_candidate": f"Rep {i}"} for i in range(1, 11)]
    senate = [{"race_id": "OR-SEN", "dem_candidate": "Jeff Merkley", "rep_candidate": "David Brock Smith", "other_candidates": "Brett Smith (Pacific Green)"}]
    scores = {(f"PA-{i:02d}", s): 0 for i in range(1, 11) for s in SOURCES}
    snap = {
        "races_house_2026.csv": races_csv(house),
        "races_senate_2026.csv": races_csv(senate),
        "ratings_2026.csv": ratings_csv(scores),
        "money_2026.csv": money_csv([1e6] * 20),
        "meta.json": json.dumps({"generated": "2026-10-11", "environment": {"margin": 8.4}, "senate_composition": {"not_up": {"D": 32}}}),
    }
    snap.update(overrides)
    return snap


class AssessTest(unittest.TestCase):
    def test_meta_dates_alone_are_no_change(self):
        new = snapshot(**{"meta.json": json.dumps({"generated": "2026-10-12", "environment": {"margin": 8.4}, "senate_composition": {"not_up": {"D": 32}}})})
        self.assertEqual(assess(snapshot(), new).status, NO_CHANGE)

    def test_line_endings_alone_are_no_change(self):
        old = snapshot()
        new = {k: v.replace("\n", "\r\n") if k.endswith(".csv") else v for k, v in old.items()}
        self.assertEqual(assess(old, new).status, NO_CHANGE)

    def test_money_and_small_rating_moves_are_routine(self):
        scores = {(f"PA-{i:02d}", s): 0 for i in range(1, 11) for s in SOURCES}
        scores[("PA-01", "Cook Political Report")] = 1
        new = snapshot(**{"ratings_2026.csv": ratings_csv(scores), "money_2026.csv": money_csv([1.1e6] * 20)})
        report = assess(snapshot(), new)
        self.assertEqual(report.status, ROUTINE, report.review)

    def test_minor_party_candidate_change_is_routine(self):
        senate = [{"race_id": "OR-SEN", "dem_candidate": "Jeff Merkley", "rep_candidate": "David Brock Smith", "other_candidates": "Chris Henry (Progressive)"}]
        self.assertEqual(assess(snapshot(), snapshot(**{"races_senate_2026.csv": races_csv(senate)})).status, ROUTINE)

    def test_senate_nominee_change_needs_review(self):
        senate = [{"race_id": "OR-SEN", "dem_candidate": "Someone Else", "rep_candidate": "David Brock Smith", "other_candidates": "Brett Smith (Pacific Green)"}]
        report = assess(snapshot(), snapshot(**{"races_senate_2026.csv": races_csv(senate)}))
        self.assertEqual(report.status, REVIEW)
        self.assertIn("OR-SEN", " ".join(report.review))

    def test_many_house_nominee_changes_need_review(self):
        house = [{"race_id": f"PA-{i:02d}", "incumbent": f"Member {i}", "dem_candidate": "Vandal" if i <= 4 else f"Dem {i}", "rep_candidate": f"Rep {i}"} for i in range(1, 11)]
        self.assertEqual(assess(snapshot(), snapshot(**{"races_house_2026.csv": races_csv(house)})).status, REVIEW)

    def test_three_step_rating_move_needs_review_for_either_party(self):
        for score in (3, -3):
            scores = {(f"PA-{i:02d}", s): 0 for i in range(1, 11) for s in SOURCES}
            scores[("PA-02", "Inside Elections")] = score
            report = assess(snapshot(), snapshot(**{"ratings_2026.csv": ratings_csv(scores)}))
            self.assertEqual(report.status, REVIEW)

    def test_missing_forecaster_rows_need_review(self):
        scores = {(f"PA-{i:02d}", s): 0 for i in range(1, 11) for s in SOURCES if not (s == "Sabato's Crystal Ball" and i > 5)}
        report = assess(snapshot(), snapshot(**{"ratings_2026.csv": ratings_csv(scores)}))
        self.assertEqual(report.status, REVIEW)
        self.assertIn("Sabato", " ".join(report.review))

    def test_polling_jump_needs_review(self):
        meta = json.dumps({"environment": {"margin": 12.0}, "senate_composition": {"not_up": {"D": 32}}})
        new = snapshot(**{"meta.json": meta, "money_2026.csv": money_csv([1.2e6] * 20)})
        self.assertEqual(assess(snapshot(), new).status, REVIEW)

    def test_money_table_shrinking_needs_review(self):
        self.assertEqual(assess(snapshot(), snapshot(**{"money_2026.csv": money_csv([1e6] * 5)})).status, REVIEW)


if __name__ == "__main__":
    unittest.main()
