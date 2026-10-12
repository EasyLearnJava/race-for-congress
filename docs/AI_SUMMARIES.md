# AI race summaries

**Code computes every number; AI only writes sentences.** Each race gets a short, neutral summary
written in advance by `claude-opus-5-5` through the Message Batches API (half price,
asynchronous) from that race's fact sheet and nothing else. Nothing is published until it passes
every check, and every Lean and Toss-up summary is read by a person first.

## Run it
Needs an Anthropic API key: `ANTHROPIC_API_KEY` in your shell or in `.env.local` (never committed).

```bash
npm run summaries -- plan --limit 12   # free: what would be written and the estimated cost
npm run summaries -- run --limit 12    # pilot: the 12 closest races first, then read data/ai/review.md
npm run summaries -- run --wait        # everything new or changed; --wait polls until done
npm run summaries -- approve PA-07 NY-17   # or: approve --passed
npm run summaries -- reject PA-07
npm run summaries -- review            # rewrite data/ai/review.md
```

- `run` is resumable. It submits the writing batch, then on the next call (or with `--wait`) collects it and submits the grading batch, then records the results. Batch state lives in `data/ai/.state.json` (not committed).
- By default `run` writes only races whose facts changed since their summary was written. `--all` rewrites every race, `--ids PA-07,TX-SEN` forces those races, and `--retry` also retries rejected, refused and failed ones.
- Estimated cost for all 470 races: about $12 at batch prices (from `plan`; actual usage is printed after each batch). A rerun after a data refresh only pays for races whose facts changed.

## What the model sees
`scripts/summaries/facts.mjs` builds one fact sheet per race from the same generated data the site uses: candidates, who holds the seat, the 2024 presidential margin, every forecaster's rating, FEC money and outside spending, new lines, and special ballot rules. Numbers are pre-formatted exactly as a summary may quote them ("R+3.2", "$2.4 million").

## Checks (all must pass)
1. **Schema:** JSON via `output_config.format` (`summary`, `what_decides`).
2. **Numbers** (`scripts/summaries/checks.mjs`): every number in the text must appear in the fact sheet.
3. **Wording:** a banned list of loaded or predictive words and phrases (allowed only when the data itself contains the word, e.g. a "Progressive" party candidate); both major-party candidates named; plain text; length limits.
4. **AI grader** (second batch, effort low): grounded in the fact sheet? neutral?
5. **Party-swap test** (Lean and Toss-up races): the race is written again with the parties exchanged, the result is mapped back, and a grader checks both versions describe each side with the same tone.
6. **Refusals** (`stop_reason: "refusal"`) are recorded and skipped. The Batches API does not accept the `fallbacks` parameter.

Results go to `data/ai/race_summaries.json` (committed), with status:

| Status | Meaning | On the site |
|---|---|---|
| `published` | passed everything (Safe and Likely races publish automatically; close races after `approve`) | yes |
| `needs_review` | a Lean or Toss-up race that passed every check | no, until approved |
| `rejected` | failed a check; reasons in `problems` | no |
| `refused` / `error` | the model declined, or the request failed | no |

## On the site
`scripts/build-data.mjs` copies published summaries into `src/generated/summaries.json`. Race pages show them in a card labelled "AI summary from FEC and election data" with the date written and the data date. When a race's facts change later (the nightly refresh), the card says so and the page's live numbers take precedence. Regenerate with `run` and review again.

## Testing without spending
`npm test` covers the fact sheets, the party swap and the checks. The full two-batch flow was exercised end to end against a local fake of the Batches API (via `ANTHROPIC_BASE_URL`) with a refusal, a loaded word and a failed party swap.
