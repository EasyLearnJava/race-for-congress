# Data

Everything in `clean/` is produced by the scripts in `../pipeline/` and is the source of truth for the app. Downloads are cached in `raw/` (not committed). Never edit files in `clean/` by hand. Fix the pipeline and re-run it instead.

## Run the pipeline

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r pipeline/requirements.txt
.venv/Scripts/python pipeline/run.py            # reuse earlier downloads
.venv/Scripts/python pipeline/run.py --refresh  # download everything again (ratings change often)
```

`run.py` builds every file below and then runs `validate.py`. It exits with an error if any check fails.

**One manual step:** `house_history.csv` needs the MIT Election Lab file, which asks each downloader to fill in a short form. Download `1976-2024-house.tab` from https://doi.org/10.7910/DVN/IG0UN2 into `data/raw/medsl/` and run the pipeline again. Until then, that one file is skipped.

## Conventions
- **Margins** are Democratic minus Republican share of the total vote, in percentage points: `+5.0` is D+5, `-5.0` is R+5.
- **Race ids:** `PA-07` for House districts, `AK-AL` for at-large seats, `TX-SEN` for Senate races.
- **Party codes:** `D` Democratic, `R` Republican, `I` independent, `L` Libertarian, `G` Green, `O` other.

## `races_house_2026.csv`: one row per House seat (435)

| Column | Meaning |
|---|---|
| `race_id`, `state`, `state_name`, `district` | District identity; `district` is 0 for at-large seats |
| `new_lines` | The state votes on a new map in 2026 (AL, CA, FL, LA, NC, OH, TN, TX, UT) |
| `harris_24`, `trump_24`, `total_24` | 2024 presidential votes inside the district's **2026** boundaries; total includes third parties |
| `pres24_margin` | 2024 presidential margin in the district |
| `lean` | `pres24_margin` minus the national margin (R+1.65, the sum of all districts; see `meta.json`). The model's baseline |
| `biden_20`, `trump_20`, `total_20`, `pres20_margin` | 2020 equivalents; blank where not yet calculated for new lines |
| `held_by`, `held_by_member` | Party and member that notionally hold the seat today (The Downballot's assignment). Used to count gains and losses |
| `incumbent`, `incumbent_party`, `first_elected`, `incumbent_status` | Sitting member for this seat per Wikipedia; blank for brand-new seats |
| `incumbent_running`, `open_seat` | Whether the incumbent is on this seat's ballot; `open_seat` is the opposite |
| `other_incumbents`, `redistricted_from` | Other members drawn into the seat, and the incumbent's previous district |
| `dem_candidate`, `rep_candidate` | General-election candidates; several are joined with ` / ` (top-two and top-four states) |
| `other_candidates` | Everyone else on the ballot, as `Name (Party); …` |
| `special_case` | Blank for a normal D vs. R race; otherwise `same_party_D`, `same_party_R`, `no_democrat`, `no_republican`, `independent_vs_R` or `candidates_unknown` |
| `ranked_choice` | Alaska and Maine use ranked-choice voting |
| `rating_consensus`, `rating_score`, `rating_count` | Median of all published ratings on a −3 (Safe R) to +3 (Safe D) scale. `rating_count` 0 means no forecaster lists the seat as competitive, so it counts as safe for the party it leans to |
| `rating_cook`, `rating_ie`, `rating_sabato` | Latest Cook Political Report, Inside Elections and Sabato's Crystal Ball ratings |

## `races_senate_2026.csv`: one row per Senate race (35)
The same columns as the House file where they apply, plus `special` (true for the Florida and Ohio special elections). Presidential votes are statewide totals.

## `ratings_2026.csv`: every published rating
`chamber`, `race_id`, `source` (10 forecasters), `rating` (e.g. `Lean D`, `Tossup`, `Tilt R`), `score` (−3 to +3) and `as_of` (date the forecaster published it).

## `hexmap_2026.json`: equal-area district map
`viewBox`, then `districts` (`id`, `state`, SVG path `d`, label point `cx`/`cy`) and `states` (outlines). **Licensed CC BY 4.0: credit "Congressional District Hexmap by Daniel Donner for The Downballot" with a link to https://the-db.co/maps wherever the map is shown.**

## `house_history.csv`: House results 2002–2024 (after the manual download)
`year`, `race_id` (using the lines in force that year), `dem_votes`, `rep_votes`, `other_votes`, `total_votes`, `margin` (blank if uncontested), `contested`, `winner_party`, `winner`.

## `meta.json`
Build date, national 2024 presidential totals, row counts, and every source with its URL, license, Wikipedia revision id and download date.

## Sources and credit
| Data | Source | License / terms |
|---|---|---|
| Presidential results by 2026 district | [The Downballot](https://the-db.co/presbycd) | Free to use; credit The Downballot |
| Hex map | [The Downballot](https://the-db.co/maps) | CC BY 4.0 |
| Candidates, incumbents, published ratings | Wikipedia ([House](https://en.wikipedia.org/wiki/2026_United_States_House_of_Representatives_elections), [ratings](https://en.wikipedia.org/wiki/2026_United_States_House_of_Representatives_election_ratings), [Senate](https://en.wikipedia.org/wiki/2026_United_States_Senate_elections)), compiled from the forecasters named in `ratings_2026.csv` | CC BY-SA 4.0; credit each forecaster by name |
| House history | [MIT Election Data + Science Lab](https://doi.org/10.7910/DVN/IG0UN2) | CC0 1.0 |
