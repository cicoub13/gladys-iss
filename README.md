# ISS Overhead — Gladys external integration

Predicts visible passes of the International Space Station over your house,
shows them on a [Gladys Assistant](https://gladysassistant.com) dashboard
widget, and can trigger a scene right before one starts — built as an
[external integration](https://gladysassistant.com) running in its own
container, on the JavaScript SDK
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
starting from the official
[integration template](https://github.com/GladysAssistant/integration-template-js).

> **⚠️ Preview / pre-merge status.** This integration targets three Gladys
> capabilities — dashboard widgets, scene triggers/actions declared by an
> external integration, and the `provider` manifest type — that are **not yet
> merged** into `GladysAssistant/Gladys` `master` (open PRs
> [#3109](https://github.com/GladysAssistant/Gladys/pull/3109) and
> [#3110](https://github.com/GladysAssistant/Gladys/pull/3110); #3110's branch
> already contains #3109's commits). Until they merge and ship in a release:
>
> - the manifest (`type: "provider"`, `widgets`, `scene_triggers`,
>   `scene_actions`) is **rejected by any released Gladys**;
> - end-to-end testing requires running a Gladys server built from the PR
>   #3110 branch, in a separate worktree from your own `Gladys` checkout;
> - the four raw WebSocket message names this integration hand-rolls
>   (`external-integration.widget.get`, `.get-image`, `.action`,
>   `external-integration.scene-action.run`) come from reading those branches'
>   spec files directly and may still change before merge — see
>   `src/message-types.js`;
> - reaching them (and the `/house` REST endpoint) goes through
>   `gladys.ws`/`gladys.httpClient`, real instance properties of the installed
>   `@gladysassistant/integration-sdk` (checked directly in
>   `node_modules/@gladysassistant/integration-sdk/lib/gladys-integration.js`)
>   that are **not** part of its public `index.d.ts` — an unofficial escape
>   hatch, not a documented API. The generic ack envelope this integration
>   replies with (`external-integration.command-result`,
>   `{message_id, success, data|error}`) IS verified against the SDK's own
>   `lib/constants.js` and internal `_runCommand`, since it is the same ack
>   already used for `setValue`/`poll`/`getImage`/`action`.

## What it does

- Fetches the ISS's orbital parameters (TLE) from
  [Celestrak](https://celestrak.org/) — no API key needed.
- Computes visible passes over your house (`src/pass-predictor.js`): above the
  horizon, house in darkness, ISS still sunlit — using
  [`satellite.js`](https://github.com/shashwatak/satellite-js) for orbit
  propagation and [`suncalc`](https://github.com/mourner/suncalc) for the
  sun's position.
- Publishes an **ISS Passes** dashboard widget: next-pass countdown, max
  elevation, a static ISS illustration (the widget's one focal component),
  and the upcoming passes as a compact status list (UTC times, direction,
  elevation, duration — see the note below on why not a nicer `card-list`).
- Fires a **`pass_starting`** scene trigger shortly before each visible pass.
- Answers a **`next_pass`** scene action on demand.

**Why a `status` list instead of a `card-list` for the passes.** The widget
content budget allows only **one focal component** (`chart` | `card-list` |
`image`) per widget — declaring both the ISS illustration and a `card-list`
would silently drop one of them. The illustration keeps the focal slot, and
the passes move into the (single) `status` component instead. The trade-off:
`status` items are plain text the core does not reformat, unlike `card-list`'s
dedicated `date` field (rendered in the viewer's own locale/time zone) — so
pass times are shown as UTC, explicitly labeled, rather than guessed as local
time (the integration has no time zone for the house, only latitude/longitude).

**Why a PNG, not an SVG.** The widget `image` component only accepts
PNG/JPEG/WebP bytes (checked by magic number) — `assets/iss-illustration.svg`
is the editable vector source, rasterized once to `assets/iss-illustration.png`
(the file actually served, `rsvg-convert -w 800 -h 450 assets/iss-illustration.svg
-o assets/iss-illustration.png`) — a static asset, so its `image_key` never
needs to change (section 6 of the widget spec: the key changes only when the
bytes do).

## Project structure

```
.
├─ index.js                          # SDK bootstrap + raw-message wiring
├─ src/
│  ├─ pass-predictor.js              # pure: TLE + observer + window -> Pass[]
│  ├─ tle-source.js                  # Celestrak fetch + /data cache + refresh
│  ├─ widget-content.js              # pure: Pass[] -> widget content envelope
│  ├─ scene-events.js                # pass_starting scheduler
│  ├─ scene-actions.js               # next_pass action handler
│  ├─ raw-messages.js                # the WS messages not yet wrapped by the SDK
│  ├─ message-types.js               # their type strings, isolated + sourced
│  └─ config.js                      # config defaults + coercion
├─ assets/
│  ├─ iss-illustration.svg           # editable vector source
│  └─ iss-illustration.png           # rasterized, the one actually served
├─ gladys-assistant-integration.json # manifest (provider type, widgets, scenes)
├─ Dockerfile                        # Node 22 Alpine, read-only rootfs ready
├─ .github/workflows/                # CI + multi-arch build + UI-driven release
├─ test/                             # unit tests (node --test)
├─ fixtures/                         # known TLE + reference data for tests
└─ cover.jpg                         # catalog cover, 800×534px, ≤150KB
```

## Develop locally

Requires a local Gladys server built from the PR #3110 branch (see the
preview-status note above) — a released Gladys will reject this manifest.

```bash
npm install

GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token-from-dev-install>" \
GLADYS_INTEGRATION_SELECTOR="iss-overhead" \
LOG_LEVEL=debug \
npm start
```

## Quality checks

```bash
npm run format:check   # Prettier
npm run lint           # ESLint
npm test               # unit tests (node --test)
npm run coverage       # tests + coverage thresholds (needs Node >= 22.8)
```

Unit tests cover the pure logic (`pass-predictor.js`, `widget-content.js`,
`scene-events.js` scheduling) without any network or Gladys dependency. There
is no automated end-to-end test: validate the widget and scene trigger/action
manually against a local Gladys built from PR #3110, including at least one
real observed pass, before trusting the elevation/darkness computation beyond
the unit fixtures.

## Publish

Not yet — publishing only makes sense once the target capabilities are merged
and released. When that happens:

1. Bump `gladys_version` in the manifest to the release that ships them.
2. Push this repo to GitHub, add the topic `gladys-assistant-integration`.
3. **Actions → Release → Run workflow** (`patch` / `minor` / `major`).

## License

Apache-2.0
