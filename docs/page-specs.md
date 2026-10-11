# Page specs (for builders)

Shared rules for every page:
- Follow `docs/ANALYTICS.md`, especially principles, building blocks and URL contracts.
- **File layout:** `page.tsx` is a Server Component. It reads `@/lib/data` and passes slices to Client Components in the route's `_components/` folder.
- **Header:** start with `PageHeader`, with breadcrumbs that lead back up the drill path.
- **Charts:**
  - Every chart sits in `ChartFrame` with `table`, `csvName` and `source` (e.g. "Source: The Downballot; model at D+2.0").
  - Use the kit in `src/components/charts/` and read each component's props in its file.
- **Tables:** `DataTable`, with `rowHref` for drill-down.
- **Links:** every internal link uses `href()` from `useScenario()`, so the scenario carries through.
- **Mobile:** works at 360px. Grids collapse to one column and tables scroll horizontally inside their card.
- **Empty states:** when an optional dataset is empty (money, old lines, history), show an `Empty` card explaining what is missing. Never crash or show zeros as if they were real.
- **Wording:** neutral. Model numbers are "in this scenario" and probabilities use `fmtProb`.

## /house: Race explorer (`src/app/house/page.tsx`, `src/app/house/_components/*`)
**Filter bar.** One row, all URL-synced per the URL contract:
- search box (`q`), state multi-select (`state`), rating chips (`rating`), held-by toggle (`held`)
- toggles: open seats (`open`), new lines (`new`), competitive (`competitive`)
- an active-filter summary with "Clear all"
- `ids` (from insights and brushing) shows as a removable "N selected seats" chip

**KPI row**, for the filtered set:
- seats in view, expected Democratic wins, coin flips (0.4 < p < 0.6), open seats
- the sum of expected D wins minus seats held by D: "net change in view"

**Cross-filter charts.** All read the filtered set; all are wrapped in ChartFrame.
- **ScatterPlot:**
  - x = district lean, y = model expected margin, points colored by consensus rating, with refLines at x=0 and y=0.
  - Brushing a rectangle sets `ids` (brush selects).
  - Clicking a point opens the district.
- **Histogram:** distribution of model expected margins, bins of 2 points from -30 to +30. Clipped margins go into the end bins. Brushing an x-range filters to those seats.
- **BarChart:** counts by consensus rating, colored by rating; clicking a row toggles that rating filter.
- **HexMap:**
  - Highlight = the filtered set, so others are dimmed; fill by model category.
  - Districts link to their pages.
  - It sits beside the charts on desktop and below them on mobile.

**Table** (`DataTable`) of the filtered rows, `rowHref` to the district, default sort by closeness (|p-0.5|):
- Seat (id + state name)
- Held by (party dot)
- Incumbent (with "not running" when open)
- Candidates (D vs R, truncated)
- Lean
- 2024 pres
- Expected margin (with MarginBar)
- Chance D (ProbBar + %)
- Consensus (RatingChip)
- Cook / IE / Sabato (small text)
- New lines (badge)

Then explain the special cases in a footnote.

## /house/[id] and /senate/[st]: Race pages
Files: `src/app/house/[id]/page.tsx`, `src/app/senate/[st]/page.tsx`, shared components in `src/components/race/*`.
- **Static generation:** `generateStaticParams` returns every race, lowercase (`pa-07`, `tx`). Unknown ids call `notFound()`. `generateMetadata` gives a title like "PA-07: Mackenzie vs Brooks".
- **Breadcrumbs:** Overview / State name (`/states/xx`) / race. Senate pages: Overview / Senate / state.
- **Header:**
  - district name (`districtName()`), chips for consensus rating, "New 2026 lines", "Open seat", "Ranked-choice"
  - the incumbent line, or "Open seat: X is not running"
- **KPI row** (client, follows the scenario):
  - chance Democrat (or independent) wins
  - expected margin
  - flip point (`env - margin`), with the sentence "Flips if the national vote is better for Democrats than X"
  - 2024 presidential margin, with the 2020 margin when present
  - district lean
- **Candidates card:** D, R and others, each with a party dot. Mark the incumbent.
- **Forecasters card:**
  - DotStrip: one row per forecaster, its score plotted on -3..+3, ticks labeled Safe R … Safe D, light rating bands, and a consensus marker
  - a table with each rating's date
  - a sentence like "7 of 10 forecasters rate it Lean D"
  - for unrated races, say none of the 10 lists it as competitive
- **"What it takes" chart:**
  - LineChart of the chance the Democrat wins vs national environment, -15..+15
  - refLines at the current env and the flip point
  - `onXClick` sets the scenario env (use `useScenario().set`)
- **Money card:** when `moneyFor` / `outsideFor` / `spendersFor` have data:
  - a BarChart of receipts and cash on hand per candidate (party colors)
  - outside spending pro-D vs pro-R
  - a top-spenders table
  - otherwise an `Empty` card
- **Context:**
  - the state hex map (`hexmapForState`) with this district `selected` and `districtLabels`, fill by model category; other districts link to their pages
  - "Similar seats": the 6 races with the closest lean among rated seats, as links with their consensus chip
  - Senate pages show a "House races in this state" table instead
- **History table:** when `historyFor` has rows. Caption: lines changed over time.

## /states and /states/[st]
Files: `src/app/states/page.tsx`, `src/app/states/[st]/page.tsx`, `src/app/states/_components/*`.
- **Index page:**
  - StateTileMap colored by expected net seat change for Democrats (diverging, using rating colors: ≥+2 Likely D color, +1 Lean D, 0 toss gray, -1 Lean R, ≤-2 Likely R) with a label of the net change. Click opens the state.
  - A DataTable of states:
    - seats, held D / R, expected D seats in this scenario, net change
    - competitive seats (not Safe), toss-ups
    - Senate race (rating chip or "no race"), new map (badge)
- **State page:**
  - Static generation with `generateStaticParams` for all 50 states.
  - **KPIs:** seats, held now (D-R), expected after (D-R), competitive seats, Senate race (link).
  - **State hex map:** `hexmapForState`, `districtLabels`, fill by model category, links to districts.
  - **District table:** same columns as the explorer table.
  - **Histogram** of the state's expected margins.
  - **Redistricting note** when the state redrew: link to `/redistricting`. Show old vs new delegation when `oldLines` has the state.
  - **Senate card:** chance, candidates, link to `/senate/xx`.

## /senate: Senate dashboard (`src/app/senate/page.tsx`, `_components/*`)
- **KPIs:** chance of Democratic control, chance of Republican control, expected seats (D caucus, R, independents), seats up (35: R defending N, D defending M from incumbents), seats not up per caucus.
- **Senate seat bar:** 100 seats = holdovers + races by model category, majority line 51 (explain the VP tie-break).
- **StateTileMap:** states with a race filled by model category, others neutral, link to the race page. Label each with the chance %.
- **Seat distribution:** a histogram of Democratic-caucus seats (`senateOutlook.demSeats.pmf`), markers at 50 and 51, columns ≥ 51 in D color, others R. Use the shared `SeatDistributionChart` if it fits.
- **Sensitivity:** chance of control vs national environment (shared `SensitivityChart`).
- **Race table:** state, incumbent (with status), D vs R (or independent) candidates, lean, expected margin, chance, consensus, Cook/IE/Sabato. Rows link to `/senate/xx`.
- **Footnotes:** independents and specials.

## /forecasters: Forecaster analytics (`src/app/forecasters/page.tsx`, `_components/*`)
**Chamber toggle** `chamber` = house | senate. Data: `ratings`, plus races for the consensus.

**KPIs:**
- forecasters (10), races rated
- unanimous races (all sources identical)
- most Democratic-leaning and most Republican-leaning forecaster (average score minus consensus)
- newest and oldest update

**Charts:**
- **Implied seats:**
  - BarChart rows = forecasters, stacked segments = counts by rating category in RATING_ORDER, colored by rating.
  - Unrated races count as Safe for the party their lean favors.
  - referenceValue at 218 (House) or the 51-seat equivalent: for the Senate, count only races up, and add holdovers in the subtitle math.
  - Row click goes to `/house?rating=…`; this is optional and must be harmless.
- **House effects:** BarChart of each forecaster's average score minus consensus (diverging: positive = more Democratic, D color; negative = R color), sorted.
- **Agreement matrix:**
  - Heatmap 10x10: share of races both forecasters rate where they give the identical rating, 0–100%.
  - A cell click shows a panel listing the races where those two differ, with both ratings and links.
- **Most contested races:**
  - DotStrip rows = the 15 races with the largest spread (max-min score) across forecasters.
  - Dots = each forecaster's score, colored by RATING_COLOR at that rating, tooltip = forecaster and rating; marker = consensus.
  - Row link to the race page.
- **Freshness table:** forecaster, races rated, last update date, days since update (compute days from the dataset's newest date, not the current date).

## /money: Campaign money (`src/app/money/page.tsx`, `_components/*`)
**With money data:**
- **KPIs:** total raised by Democratic nominees, by Republican nominees, outside spending helping each side (`proDem` / `proRep` sums), the race with the most total money.
- **Top races by candidate money:** BarChart, stacked D receipts / R receipts per race, top 20, links to the race.
- **Top races by outside spending:** stacked pro-D / pro-R, top 20.
- **Money vs. the model:**
  - ScatterPlot, x = cash-on-hand advantage (D minus R, in $M, symmetric domain), y = model expected margin, color by consensus rating.
  - Label the top 5 by |x|. Points link to races.
- **Top outside spenders:** aggregated from `spenders` by spender, with total, races, and share helping D vs R.

**Coverage:**
- note the coverage dates (the latest `coverageEnd`) and that totals cover matched nominees only
- show the match count vs nominees

**Without data:** an `Empty` card explaining the FEC pipeline step and linking to `/data`.

## /redistricting: The new maps (`src/app/redistricting/page.tsx`, `_components/*`)
Nine states drew new lines (`REDRAWN_2026`).
- **KPIs:**
  - states redrawn, seats in those states
  - notional flips: seats whose notional holder (`heldBy`) differs from the party the new lines lean to (sign of `pres24`)
  - net shift toward each party
- **Per-state BarChart:**
  - for each redrawn state, seats leaning D vs R on the new lines (stacked), next to the notional holders (D vs R)
  - when `oldLines` data exists, show old-lines lean vs new-lines lean instead (preferred), with net change per state
- **Finish line moved** (only with `oldLines` covering all 9 states):
  - Run the engine with fundamentals only (`expertWeight` 0) on (a) the current 435 seats and (b) the same seats but with the 9 states' districts replaced by their old-lines rows (lean = old pres24 − national margin, no incumbency, no ratings).
  - Report the finish line for each and the difference: "The new maps moved the finish line by X points toward …".
  - Explain the method in a footnote.
- **HexMap:**
  - all districts, with the 9 states' districts highlighted (others dimmed)
  - fill = notional flips (D color for R-held seats now leaning D, R color for the reverse) and rating colors otherwise
  - click opens the district
- **Table:** districts in redrawn states where the holder and the new lean disagree, plus the closest new seats (|lean| < 5), linking to districts.
- **Sources:** The Downballot.

## /simulator: Scenario lab (`src/app/simulator/page.tsx`, `_components/*`)
**Big, explained controls:** national vote, weight on ratings, incumbency, national error, race error. These are the same values as the scenario bar, read and written through `useScenario`. Add presets: polling average, even, 2018 wave (D+8.6), 2010 wave (R+6.8), "Fundamentals only" (w=0), "Forecasters only" (w=1).

**Results, House and Senate side by side:**
- chance of majority/control, expected seats, 80% range
- the seat distribution (shared `SeatDistributionChart`): clicking a bar sets env to `envForSeats(k)`, "explore the world where Democrats win k seats"
- sensitivity curves (shared `SensitivityChart`)

**"Seats that decide it":** a table of the 30 House races closest to 50%, with chance, expected margin, and the flip point of each.

**"Change from the polling average":** the expected seats at the current settings minus at the defaults, plus the list of seats whose favored party differs between the two.

**Share:** a link and a "copy link" button.
