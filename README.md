# 218 · Race for Congress

**Nonpartisan, drill-down analytics for the 2026 US midterms.** Every House and Senate race, the ratings of 10 published forecasters, redistricting, campaign money, a live scenario model, and an AI analyst that answers questions from the same data.

**Live:** https://race-for-congress.vercel.app · **Data:** [/data](https://race-for-congress.vercel.app/data) · **Method:** [/methodology](https://race-for-congress.vercel.app/methodology)

## What you can do
| View | What it answers |
|---|---|
| **Overview** | Who is favored for each chamber, and why. Headline numbers, the seat bar, an equal-area district map, auto-generated insights, the chance of every seat count, control curves, and the road to 218 |
| **House explorer** | Filter all 435 seats by state, rating, open seat or new lines. Charts cross-filter each other (brush a scatter, click a bar), the map highlights the selection, and the table exports to CSV |
| **District and Senate race pages** | Everything about one race: candidates, all 10 ratings with dates, the "flip point", what it takes to win, money, outside spending, similar seats |
| **States** | Delegation now vs. projected, the state's district map, its Senate race |
| **Senate** | Control math (holdovers and the vice president's tie-break), every race, seat distribution |
| **Forecasters** | Implied seat counts per forecaster, house effects, an agreement matrix, the most contested races |
| **Money** | Candidate fundraising and outside spending from FEC filings, and money vs. the model |
| **Redistricting** | Nine states drew new maps. How far did they move the race? |
| **Simulator** | Tune the model (national vote, weight on ratings, incumbency, uncertainty) and see both chambers respond |
| **Ask 218** | Plain-English questions answered by Claude, using tools that query this site's own data and model |

**Drill-down everywhere:**
- Nation → state → district, and every mark links to the races behind it.
- **One scenario everywhere:** the national-vote slider and model settings live in the URL, so every view and every shared link agrees.
- **Every chart exports:** a Table view (the accessible twin) and a CSV download on each chart.

## How it works
```
public sources ──> Python pipeline ──> data/clean/*.csv ──> scripts/build-data.mjs ──> static Next.js pages
(The Downballot,      (pandas, pandera     (source of truth,      (typed JSON for the app,      (prerendered on Vercel;
 Wikipedia, FEC,       validation)          committed)             CSV/JSON downloads)           the model runs in the browser)
 MIT Election Lab)
```
- **The model:**
  - Expected margin = a blend of fundamentals (district lean + national vote + incumbency) and the median published rating.
  - Uncertainty is a shared national error plus race-level error.
  - Seat probabilities are computed exactly (a Poisson-binomial distribution integrated over the national error), not sampled, so the same inputs always give the same answer. See `src/lib/model/engine.ts` and its tests.
- **The AI analyst** (`/ask`) uses Claude with four tools (search races, get a race, chamber outlook, forecaster summary) that run against the same data and engine. It is switched on by an `ANTHROPIC_API_KEY` environment variable and off without one.

## Run it locally
```bash
npm install
npm run dev            # http://localhost:3000

# Rebuild the data from public sources (Python 3.12+)
python -m venv .venv
.venv/Scripts/python -m pip install -r pipeline/requirements.txt -c pipeline/constraints.txt
.venv/Scripts/python pipeline/run.py --refresh

npm test               # model unit tests
```

## Project docs
- [`docs/ANALYTICS.md`](docs/ANALYTICS.md): product principles, building blocks, URL contracts.
- [`docs/page-specs.md`](docs/page-specs.md): what every page shows.
- [`data/README.md`](data/README.md): every dataset, column by column.
- [`PLAN.md`](PLAN.md): the original plan. [`CLAUDE.md`](CLAUDE.md): rules for AI coding agents.

## Credits and sources
- Presidential results by congressional district, and the district hexmap (CC BY 4.0): **The Downballot**.
- Candidates, incumbents and published ratings: **Wikipedia** (CC BY-SA 4.0), compiled from Cook Political Report, Inside Elections, Sabato's Crystal Ball, The Economist, Split Ticket, Decision Desk HQ, Fifty Plus One, Fox News, Silver Bulletin and RealClearPolitics.
- Campaign finance: **Federal Election Commission**.
- House history: **MIT Election Data + Science Lab** (CC0).

## Nonpartisan by design
Not affiliated with any party, campaign or candidate. The model is a simulation of what happens under a chosen national environment, not a prediction of who will win. To register or find your polling place, visit [vote.gov](https://vote.gov).
