# AGENTS.md — gladys-iss (ISS Overhead)

Project-specific notes. Generic rules live in `CLAUDE.md`, user-facing ones in `README.md`.

## Shape of the integration

- Manifest `type: "provider"`, `location: true`: **no devices, no features, no `external_id`s**.
  The stable identifiers are capability keys instead, and renaming any of them breaks users'
  dashboards/scenes:
  - widget `iss_passes` (`WIDGET_KEY`, `src/widget-content.js`), image key `iss-photo` (`ISS_IMAGE_KEY`);
  - scene trigger `pass_starting` (`SCENE_TRIGGER_KEY`, `src/scene-events.js`), filter field `direction`,
    variables `start_date`, `start_hour`, `max_elevation_deg`, `duration_seconds`, `direction`,
    `direction_name`;
  - scene action `next_pass` (`SCENE_ACTION_KEY`, `src/scene-actions.js`), outputs `found`, `start_date`,
    `start_hour`, `minutes_until`, `max_elevation_deg`, `duration_seconds`, `direction`, `direction_name`.
- `start_date`, `start_hour` and `direction_name` are written in the `language` config (`src/localize.js`),
  in the local time zone: scenes receive no language from Gladys.
- `direction` values are exactly the 8 compass points `N NE E SE S SW W NW` from
  `compassFromAzimuth` (direction the pass _rises_ from); the manifest options must match.

## Data flow (`index.js` wires everything, holds no logic)

1. `connected` → `InitRetry.start()` (`src/lifecycle.js`) runs `initialize()`: `getConfig()` →
   `normalizeConfig` → `getHouses()` (first house with lat/lon; `location: true` grants it, 403 otherwise)
   → `ensureTle()` → `recomputePasses()` → `setConnectionStatus(true)`.
2. Failed init retries with exponential backoff 30 s → 30 min cap, "equal jitter" (upper half of the
   delay); a newer `start()`/`stop()` bumps `generation` so a superseded attempt never schedules a retry.
   Each failure also sets `setConnectionStatus(false, {en, fr})`.
3. Module-level state in `index.js`: `config`, `house`, `passes` (in memory only). Widget/action handlers
   read the cached `passes`; they never compute on request.
4. `setInterval` every 6 h (armed at startup, independent of init success): `ensureTle()` + recompute.
5. `onConfigUpdated` → recompute + `gladys.requestWidgetRefresh(WIDGET_KEY)`.
6. House coordinates have no update event: only re-fetched on each (re)connection.
7. `connect()` rejection (token refused at first attempt) is logged, not fatal: the SDK keeps retrying.
   An unhandled rejection anywhere → log + `process.exit(1)` (`exitOnUnhandledRejection`).

## External source: Celestrak (`src/tle-source.js`)

- `GET https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE`, no auth. Reply is 3 lines
  (name + `1 …` + `2 …`); `parseTleText` picks lines starting with `1 ` / `2 `.
- 15 s `AbortSignal.timeout` covers headers **and** body (undici default would hang ~5 min).
- Non-2xx → throws. On refresh failure `ensureTle()` keeps the last known-good TLE; it only throws when
  there is none at all.
- "Stale" = `fetchedAt` older than 24 h (`STALE_AFTER_MS`), based on fetch time, not TLE epoch; only
  surfaced as the widget's "Orbital data" row.

## `/data`

- `/data/tle-cache.json` = `{ line1, line2, fetchedAt }` (ISO string). Written atomically
  (`.tmp` + `rename`, mode `0600`). A corrupt/truncated file is treated as no cache. Keep this format.

## Pass prediction (`src/pass-predictor.js`, pure)

- Visible = elevation ≥ `min_elevation_deg` AND Sun altitude ≤ −6° (civil twilight) AND ISS sunlit
  (cylindrical Earth shadow, no penumbra, Sun position from the Almanac low-precision formula — suncalc
  cannot tell whether a point in orbit is in shadow).
- 10 s sampling, no refinement: start/end/max are accurate to one step. Observer height is 0.
- `propagate()` failures (decayed/invalid TLE) are silently skipped samples.
- **suncalc ≥ 2**: namespace import (`import * as SunCalc`) and `altitude` is already in degrees
  (commit c359679 fixed a double conversion). satellite.js is v7.

## Config (`src/config.js`, keys must match `config_schema`)

- `min_elevation_deg`: number in [0, 90], else default 10.
- `lookahead_days`: manifest `select` sends strings `"3"|"5"|"7"`; anything else snaps to 5.
- `getConfig()` can return `null` — hence `raw ?? {}`, not a default parameter.

## Widget / scene specifics

- Widget times are formatted `DD/MM HH:MM UTC` on purpose (no house time zone available); "Visible soon"
  = a pass within 24 h, not "tonight". Why `status` instead of `card-list`: see README.
- Human text is always `{ en, fr }`; plain strings only for units, compass points, UTC times.
- Status rows: ≤ 5 passes + "Visible soon" + optional "Orbital data" (cap 10).
- `next_pass` with no future pass returns only `{ found: false }` (outputs are not nullable).
- `PassScheduler` fires 90 s before `startTime`, rebuilds all timers on every recompute, never fires late
  (pass already inside the lead window is skipped), not persisted across restarts.
- Image served from `assets/iss-photo.jpg` (read once, cached base64). The Dockerfile must `COPY` it
  (a test greps for it); the core refuses > 300 KB / > 4096 px, never recompresses.

## Tests

- No Gladys fake: modules are pure or take injected deps — `fetchImpl`/`fs`/`fetchTimeoutMs`
  (`TleSource`), `now`/`setTimer`/`clearTimer` (`PassScheduler`), `random`/`setTimer`/`clearTimer`
  (`InitRetry`), `exit`/`processRef` (`exitOnUnhandledRejection`). Each test file defines its own
  `fakeTimers`/`fakeFs`/`fakeFetch`/`makePass`. `index.js` itself is untested.
- `fixtures/tle-samples.js`: real TLE (epoch 2026-09-18) + `PARIS_OBSERVER`. Predictor tests **pin**
  windows (`2026-09-19` has passes, `2026-10-01` is a known gap) — never use `new Date()` there (ISS
  visibility has multi-day gaps; commit 31a785f). Refreshing the TLE means re-picking those windows.
- `test/manifest.test.js` cross-checks manifest vs code: version = `package.json` = `docker_image` tag,
  keys, config defaults, en+fr labels, compass options, `next_pass` outputs, cover ≤ 150 KB, image validity.
- `test/widget-content.test.js` runs the SDK's `validateWidgetContent` on every content shape.
- Extra script: `npm run coverage` (lines 95 / branches 90 / functions 85, needs Node ≥ 22.8).
