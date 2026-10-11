# 218 · Race for Congress

A nonpartisan, interactive simulator for the 2026 US midterm elections. Move the national vote and watch control of Congress change, district by district.

> **Status:** early development. Public launch planned for Oct 20, 2026. Election Day is Nov 3, 2026.

## What it will do
- **Swing the country:** drag one slider for the national vote and watch all 435 House seats respond.
- **Make your call:** pick the winners in the closest races and share your map.
- **Run 10,000 elections:** see the range of outcomes when polls miss.
- **Redistricting effect:** compare the 2024 and 2026 maps. Nine states drew new lines this year.
- **Follow the money:** fundraising and outside spending for every race, from FEC filings.
- **Election night companion:** poll-closing countdown and paths to 218.

## Tech
Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · Python data pipeline (pandas) · deployed on Vercel.

## Run locally
```bash
npm install
npm run dev
```
Then open http://localhost:3000.

## Project docs
- [`PLAN.md`](PLAN.md): product, data, model, design, analytics and launch plan.
- [`CLAUDE.md`](CLAUDE.md) and [`AGENTS.md`](AGENTS.md): guidance for AI coding agents.
- [`data/README.md`](data/README.md): datasets and where they come from.

## Nonpartisan by design
This project is not affiliated with any party, campaign or candidate. It is a simulation, not a forecast. Methods and data sources are published in the open. To register or find your polling place, visit [vote.gov](https://vote.gov).
