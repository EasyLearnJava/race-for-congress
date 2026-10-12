# Analytics and privacy

A person's call, or the side they lean, is a political opinion. We record **counts only**: no
event or property can carry which party someone picked, and nothing identifies a person. This is
the contract for anyone adding tracking.

## Tools
| Tool | What it records | Turned on by |
|---|---|---|
| PostHog (`posthog-js`, pinned) | the product events below, plus page views by path | `NEXT_PUBLIC_POSTHOG_KEY` (and optional `NEXT_PUBLIC_POSTHOG_HOST`, default `https://us.i.posthog.com`). Without a key, all tracking is a no-op. |
| Vercel Web Analytics | page views by path, cookieless | Deploying on Vercel, with Web Analytics enabled for the project |
| Vercel Speed Insights | Core Web Vitals by route | Deploying on Vercel, with Speed Insights enabled for the project |

Code: `src/lib/analytics.ts` (events, `track`, URL scrubbing), `src/instrumentation-client.ts`
(starts PostHog, notes where navigations come from), `src/components/site/pageview-tracker.tsx`,
`src/components/site/vercel-analytics.tsx`. Tests: `src/lib/analytics.test.ts`.

## Events
| Event | Properties | Fired when |
|---|---|---|
| `$pageview` | path only | a page's path changes (filters, scenario and picks in the query string are not page views) |
| `vote_slider_changed` | `how` (drag, keys, preset, chart, other), `band` (symmetric 5-point band, e.g. "D+5 to D+10"), `surface` | the national vote settles after a change (0.8 s) |
| `model_settings_changed` | `setting` (expertWeight, incumbency, sigmaNational, sigmaRace, reset), `surface` | a model setting settles, or the scenario is reset |
| `race_opened` | `race` (e.g. PA-07), `chamber`, `from` (search, overview, explorer, state, race, call, ..., direct) | a race page opens |
| `maps_toggled` | `control` (basis, compare), `to` | a redistricting toggle changes |
| `call_progress` | `called` (1, 10, 20, 30 or the full deck), `deck`, `finished` | Make your call reaches a milestone |
| `share_clicked` | `surface` (call, scenario, simulator), `method` (native, copy, image, story) | a share action is used |
| `shared_visit` | `surface` (call) | someone opens a shared call link |
| `ai_question` | `source` (suggestion, typed) | a question is sent to Ask 218 (the text is never sent) |

`sim_run` from PLAN.md does not exist: the simulator computes exactly and has no run button, so
setting changes are counted as `model_settings_changed`.

## Privacy settings
- **No picks anywhere.** `/call` URLs hold picks (`?d=az01&r=pa07`), so every URL sent to PostHog
  or Vercel is cut to its path (`before_send` / `beforeSend`). Page titles are dropped too: a
  shared call's title contains its seat counts.
- **No identity:** `persistence: "memory"` (no cookies, no local storage, no banner needed),
  `person_profiles: "never"`, never `identify()`.
- **No autocapture:** autocapture, rage clicks, dead clicks and heatmaps are off. They record the
  text of clicked elements, which here would be "Democrat" or "Republican".
- **No recordings or remote code:** session recording, surveys, product tours, web experiments,
  feature flags and external script loading are off.
- **Bots are excluded** by PostHog's built-in user-agent and `navigator.webdriver` checks.

## Adding an event
1. Add it to `Events` in `src/lib/analytics.ts` with literal-union property types. Never add a
   property that could hold a pick, a party preference, free text or a URL with a query string.
2. Call `track(...)` (or `trackSettled(...)` for continuous inputs).
3. Add it to the table above.

## Setup checklist (owner)
- Vercel project → Environment Variables: `NEXT_PUBLIC_POSTHOG_KEY` (Production and Preview).
- Vercel project → Analytics: enable Web Analytics and Speed Insights.
- PostHog project settings: turn on **Discard client IP data**.

## Known limits
- With memory persistence, PostHog cannot recognise a returning visitor. Use Vercel's cookieless
  visitor counts for "returned on election night".
- Picks are in the URL by design (sharing). Vercel's request logs can include query strings for
  their short retention period. That is server logging, not analytics, and is not exported.
- Testing locally with Playwright: PostHog ignores automated browsers. Override
  `navigator.webdriver` and `navigator.userAgentData` in an init script to see events.
