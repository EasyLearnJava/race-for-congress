# Analytics site spec

The site is an election-analytics product: every view answers a question, every chart drills down, every number can be exported. Read this before building or changing a page.

## Product principles
1. **Drill down everywhere:** Nation → State → District / Senate race. Every mark that represents races links to the races behind it: a seat-bar segment links to the filtered explorer, a hex to its district, a state tile to its state page, a table row to its race page.
2. **One scenario, everywhere:**
   - The national environment and model settings live in the URL (`env`, `w`, `inc`, `sn`, `sr`) and are edited in the sticky Scenario bar.
   - Every analytic view recomputes from them.
   - Every internal link keeps them: use `href()` from `useScenario()`.
3. **Filters live in the URL too:** `useQueryParam` from `src/lib/url-state.ts`, so `/house?rating=Tossup&state=PA` is a shareable drill-down.
4. **Every chart is exportable and accessible:**
   - Wrap it in `ChartFrame` with a `table` (the table view) and a `csvName`.
   - Tables use `DataTable`, which has a CSV download built in.
5. **Sources and freshness:** every chart has a `source` line (who, and as of when).
6. **Neutral copy:**
   - Use "simulation" and "model", never "prediction" as fact.
   - Democrats are always on the left in blue, Republicans on the right in red.
   - Use the same wording for both parties.
7. **Fast and static:**
   - Every page is prerendered (`generateStaticParams` for race and state pages).
   - Server Components read data from `@/lib/data`, then pass only the slices a page needs to Client Components.
   - Never import `@/lib/data` in a Client Component.

## Building blocks (already in the repo)
| Need | Use |
|---|---|
| Data (server only) | `@/lib/data`: `house`, `senate`, `ratings`, `money`, `outside`, `spenders`, `genericBallot`, `oldLines`, `history`, `hexmap`, `meta`, `getHouseRace`, `getSenateRace`, `houseInState`, `senateInState`, `ratingsFor`, `moneyFor`, `outsideFor`, `spendersFor`, `historyFor`, `hexmapForState`, `baselineEnvironment()`, `senateComposition()` |
| Types | `@/lib/data/types` (`HouseRace`, `SenateRace`, `Rating`, `MoneyRow`, `OutsideRow`, `SpenderRow`, `HexMap`, ...) |
| States | `@/lib/data/states`: `STATES` (postal, name, seats, tile), `STATE_BY_POSTAL`, `REDRAWN_2026`, `HOUSE_MAJORITY` |
| Model (pure) | `@/lib/model/engine`: `houseOutlook`, `senateOutlook`, `projectRaces`, `expectedMargin`, `winProbability`, `envForSeats`, `finishLine`, `tippingPoint`, `seatDistribution`, `probAtLeast`, `quantile`, `DEFAULT_PARAMS` |
| Model (client hooks) | `@/lib/model/use-outlook`: `useHouseOutlook(races)`, `useSenateOutlook(races, composition)`, `useProjections(races)`, `useModelParams()` |
| Scenario | `@/components/scenario/scenario`: `useScenario()` → `{ params, baselineEnv, set, reset, href }` |
| URL state | `@/lib/url-state`: `useQueryParam(key, fallback, parse, serialize)`, `parseNumber`, `parseList`, `serializeList`, `setSearchParams` |
| Formatting | `@/lib/format`: `fmtMargin` (D+3.2), `fmtProb` (73%), `fmtPct`, `fmtNum`, `fmtCompact`, `fmtMoney`, `fmtDate`, `partyName`, `districtName`, `signed` |
| Ratings | `@/lib/ratings`: `RATING_ORDER`, `RATING_COLOR`, `RATING_TEXT`, `partyColor`, `ratingFromScore`, `ratingFromProb`, `isCompetitive` |
| UI | `@/components/ui/primitives`: `Card`, `SectionTitle`, `PageHeader` (with breadcrumbs), `Stat`, `RatingChip`, `PartyTag`, `Badge`, `Empty`; `@/components/ui/data-table`: `DataTable` |
| Charts | `@/components/charts/*`: `ChartFrame` + `LegendItem`, `SeatBar`, `HexMap`, plus the chart kit (`bar-chart`, `histogram`, `scatter-plot`, `heatmap`, `dot-strip`, `line-chart`, `tile-map`, `sparkline`). Read each file's exported props before use |
| Model sections | `@/components/model/*`: `SeatDistributionChart`, `SensitivityChart` (see below) |

## Model vocabulary (use these words in the UI)
- **National environment / national vote:** the Democratic-minus-Republican margin of the national vote. The default is the polling average.
- **Lean:** a district's 2024 presidential margin minus the national margin.
- **Expected margin:** the model's blend of fundamentals (lean + national vote + incumbency) and the published ratings.
- **Chance of winning:** the probability over the model's uncertainty (national and race-level error).
- **Finish line:** the national vote at which Democrats are expected to win exactly 218 seats.
- **Tipping-point seat:** the 218th most Democratic seat.
- **Flip point** (one race): the national vote at which that race's expected margin crosses zero, which is `env - margin`.
- **Notional holder:** `heldBy`, the party that holds the seat's predecessor district. Gains and losses are counted against it.

## Pages and drill paths
| Route | Question it answers | Drills to |
|---|---|---|
| `/` Overview | Who is favored for each chamber, and why? | explorer filtered by rating, districts, states, Senate, simulator |
| `/house` Race explorer | Which seats matter, and how do they compare? Cross-filter charts plus a table | `/house/[id]` |
| `/house/[id]` District | Everything about one race | state page, similar districts |
| `/states`, `/states/[st]` | How does each state's delegation look now vs. projected? | districts, Senate race |
| `/senate`, `/senate/[st]` | Senate control and every race | race pages |
| `/forecasters` | Where do the 10 forecasters agree, disagree and lean? | races |
| `/money` | Where is campaign and outside money going? | races |
| `/redistricting` | How much did the new maps move the race? | states, districts |
| `/simulator` | What happens under any scenario? | races |
| `/data`, `/methodology` | Downloads and how it works | |

## URL contracts (drill-down links depend on these)
- **Race pages:** `/house/pa-07`, `/senate/tx`. State pages: `/states/tx`. Always lowercase. Build them with `src/lib/routes.ts` (`houseHref`, `senateHref`, `stateHref`, `raceHref`, `explorerHref`).
- **`/house` explorer filters:** all optional, combinable. Unknown values are ignored.
  - `q`: free-text search (district id, state, incumbent or candidate names)
  - `state`: comma-separated postal codes (`PA,NY`)
  - `rating`: comma-separated consensus ratings, URL-encoded (`Tossup,Lean%20D`)
  - `held`: `D` or `R` (notional holder)
  - `open=1`: no incumbent running
  - `new=1`: new 2026 lines
  - `competitive=1`: consensus rating not Safe
  - `ids`: comma-separated race ids (`PA-07,NY-17`). Used by insights, brushing and "compare"
  - `sort`: column key, plus `dir` = `asc` / `desc`
- **`/forecasters`:** `chamber` = `house` (default) or `senate`.
- **Scenario params** (`env`, `w`, `inc`, `sn`, `sr`) ride along on every link via `href()` from `useScenario()`.

## Model sections (shared, in `src/components/model/`)
- **`SeatDistributionChart`** `{ title, subtitle?, dist: SeatDistribution, majority, seatLabel, source?, onSelect?(seats), csvName }`: the chance of every seat count, with a majority line. `onSelect` usually does `set({ env: envForSeats(races, params, k) })`. For the Senate, pass `senateOutlook.demSeats` and majority 51.
- **`SensitivityChart`** `{ title, subtitle?, curves: CurveSpec[], source? }`: chance of control vs national vote, R+15..D+15.
  - `CurveSpec = { key, label, color, races, threshold, count? }`.
  - The threshold is the wins needed among `races`: 218 for the House, `51 - holdoverDem` for the Senate.
  - Clicking sets the national vote.
- **Reference implementation** of a full dashboard page: `src/app/page.tsx` with `src/app/_components/overview.tsx` and `overview-model-sections.tsx`.
