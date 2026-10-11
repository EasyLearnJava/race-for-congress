# Data

CSV files in `clean/` are the source of truth for the app. They are produced by the scripts in `../pipeline/` from downloads in `raw/`. Raw files are not committed; the pipeline re-downloads them.

## Planned datasets (`clean/`)

| File | What it holds | Source |
|---|---|---|
| `races_house_2026.csv` | One row per House district on the 2026 lines: lean, incumbent, nominees, special cases, expert rating | Dave's Redistricting App / The Downballot, state election offices, Ballotpedia |
| `races_senate_2026.csv` | The 35 Senate races (33 regular + OH and FL specials) | same |
| `house_history.csv` | House results by district, 1976–2024 | MIT Election Data + Science Lab |
| `fec_candidates.csv` | Candidate fundraising totals with as-of dates | OpenFEC API |
| `outside_spending.csv` | Outside spending for and against each party, by race | OpenFEC Schedule E |
| `hex_layout.csv` | Hex-map position for each district | published House hex layout, adapted |
| `poll_closings.csv` | Poll-closing times by state (ET) | official state sources |

Every dataset gets a data-dictionary entry here when it lands: columns, units, source URL, and download date.
