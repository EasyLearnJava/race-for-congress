@AGENTS.md

# 218 · Race for Congress

A nonpartisan, interactive simulator for the 2026 US midterms: move the national vote, watch control of Congress change. The full plan (features, data, model, design, launch) is in `PLAN.md`. Read the relevant section before starting a feature.

## Commands
- `npm run dev`: local dev server at http://localhost:3000
- `npm run build`: production build (must pass before committing)
- `npm run lint`: ESLint (must pass before committing)
- `.venv/Scripts/python pipeline/run.py [--refresh]`: rebuild and validate `data/clean/` (see `data/README.md`)

## Stack
- Next.js 16 App Router under `src/`, TypeScript strict, Tailwind CSS v4.
- **Cache Components is on** (`cacheComponents: true`). Never call `Date.now()`, `new Date()` or `Math.random()` while rendering prerendered code. Use a client-only snapshot (see `src/components/election-countdown.tsx`) or `io()` as described in the Next docs.
- Planned additions, installed when a feature needs them:
  - Zustand + `nuqs` for state kept in the URL
  - d3-scale + hand-built SVG, Observable Plot, Motion
  - Comlink Web Worker for the simulation
  - the official Anthropic SDK

## Layout
- `src/app/`: routes. `src/components/`: UI. `src/lib/model/`: model math (pure functions + Vitest tests). `src/lib/insights/`: rule-based insight cards.
- `pipeline/`: Python (pandas + pandera) that turns `data/raw/` (not committed) into `data/clean/*.csv`.
- `data/clean/*.csv` is the source of truth. Never hand-edit generated JSON.

## Rules
**Data**
- Lean = 2024 presidential margin on the **2026 district lines** minus the national margin. Never use the last House result as the baseline.
- Nine states have new maps for 2026: AL, CA, FL, LA, NC, OH, TN, TX, UT.
- Every number shown in the UI carries its source and as-of date.
- Credit sources wherever their data is shown:
  - the hex map: "Congressional District Hexmap by Daniel Donner for The Downballot", CC BY 4.0, linked to https://the-db.co/maps
  - presidential results: The Downballot
  - ratings: each forecaster by name.
- Column meanings and conventions are in `data/README.md`. Margins are Democratic minus Republican, in points.

**Model**
- `src/lib/model` stays pure and deterministic (seeded RNG) with unit tests.
- UI code never re-implements the model math.

**Design**
- Mobile first: everything works at 360px wide, and with a keyboard.
- Never rely on color alone. Respect `prefers-reduced-motion`. Support light and dark.
- Use the color tokens in `src/app/globals.css` (`dem`, `dem-lean`, `tossup`, `rep-lean`, `rep`, `paper`, `card`, `ink`, `muted`, `line`). Never hard-code party colors.
- Democrats always on the left in blue, Republicans on the right in red.
- Fonts: Newsreader (`font-serif`) for headlines, Inter (`font-sans`) for the interface; `tabular-nums` for changing numbers.

**Neutrality**
- Same templates and wording for both parties, and no loaded adjectives.
- Label results "simulation, not a forecast".
- Never tell users who to vote for. Voting logistics link to https://vote.gov.
- Never store which party an individual picked. Analytics record counts only: track only through `track()` in `src/lib/analytics.ts`, following `docs/TRACKING.md`.

**AI (Claude API)**
- Model: `claude-opus-5-5`, called through the official Anthropic SDK.
- Race summaries: generated in advance with the Message Batches API, JSON via `output_config.format`. Validate every number against the input row.
- Chat:
  - strict tools with `tool_choice: auto`; forced `tool_choice` returns a 400 on this model
  - effort `low`, cache the system prompt and tools
  - handle `stop_reason: "refusal"`.
- Secrets only in `.env.local` and Vercel environment variables. Never commit keys.

## Definition of done
- Lint and build pass.
- Checked at 360px and 1280px, in light and dark mode.
- Keyboard reachable, no console errors.
- Tests added for any model change.

## Ticket format
```
Goal: …
Inputs: …
Done when: …
Out of scope: …
```
