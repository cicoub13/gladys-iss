# ISS Overhead — Gladys external integration

Predicts visible passes of the International Space Station over your house,
shows them on a [Gladys Assistant](https://gladysassistant.com) dashboard
widget, and can trigger a scene right before one starts — built as an
[external integration](https://gladysassistant.com) running in its own
container, on the JavaScript SDK
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
starting from the official
[integration template](https://github.com/GladysAssistant/integration-template-js).

> **Requires Gladys ≥ 5.1.0.** The three capabilities this integration is made
> of — dashboard widgets, scene triggers/actions declared by an external
> integration, and the `provider` manifest type — shipped in Gladys **5.1.0**
> (they are absent from 5.0.x, whose manifest schema rejects this manifest).
> `gladys_version` declares that floor, and the catalog filters on it.

## What it does

- Fetches the ISS's orbital parameters (TLE) from
  [Celestrak](https://celestrak.org/) — no API key needed.
- Computes visible passes over your house (`src/pass-predictor.js`): above the
  horizon, house in darkness, ISS still sunlit — using
  [`satellite.js`](https://github.com/shashwatak/satellite-js) for orbit
  propagation and [`suncalc`](https://github.com/mourner/suncalc) for the
  sun's position.
- Publishes an **ISS Passes** dashboard widget: next-pass countdown, max
  elevation, a photo of the station (the widget's one focal component), and
  the upcoming passes as a compact status list (UTC times, direction,
  elevation, duration — see the note below on why not a nicer `card-list`).
- Fires a **`pass_starting`** scene trigger shortly before each visible pass.
- Answers a **`next_pass`** scene action on demand.

Everything goes through the SDK's published API — `onWidgetGet`,
`onWidgetGetImage`, `onSceneAction`, `publishSceneEvent`, `getHouses` — added
in SDK **0.14.0** alongside the Gladys 5.1 capabilities. Nothing here
hand-rolls a WebSocket message or reaches into an SDK internal.

**Why a `status` list instead of a `card-list` for the passes.** The widget
content budget allows only **one focal component** (`chart` | `card-list` |
`image`) per widget — declaring both the ISS photo and a `card-list` would
silently drop one of them. The photo keeps the focal slot, and the passes move
into the (single) `status` component instead. The trade-off: `status` items are
plain text the core does not reformat, unlike `card-list`'s dedicated `date`
field (rendered in the viewer's own locale/time zone) — so pass times are shown
as UTC, explicitly labeled, rather than guessed as local time (the integration
has no time zone for the house, only latitude/longitude).

**The widget image.** `assets/iss-photo.jpg` is a photo of the station — the
same image as the catalog cover (`cover.jpg`) — at 800×534 and 130 KB: inside
the core's caps of 300 KB decoded and 4096×4096 px. The core validates and
_refuses_ an image, it never recompresses, so the file is
committed at its served size; `npm test` runs the SDK's `validateWidgetImage`
on the actual bytes. It is a static asset, so its `image_key` never needs to
change (section 6 of the widget spec: the key changes only when the bytes do).

## Project structure

```
.
├─ index.js                          # SDK bootstrap + capability handlers
├─ src/
│  ├─ pass-predictor.js              # pure: TLE + observer + window -> Pass[]
│  ├─ tle-source.js                  # Celestrak fetch + /data cache + refresh
│  ├─ widget-content.js              # pure: Pass[] -> widget content envelope
│  ├─ scene-events.js                # pass_starting scheduler
│  ├─ scene-actions.js               # next_pass action handler
│  └─ config.js                      # config defaults + coercion
├─ assets/
│  └─ iss-photo.jpg                  # the widget's focal image
├─ gladys-assistant-integration.json # manifest (provider type, widgets, scenes)
├─ Dockerfile                        # Node 22 Alpine, read-only rootfs ready
├─ .github/workflows/                # CI + multi-arch build + UI-driven release
├─ test/                             # unit tests (node --test)
├─ fixtures/                         # known TLE + reference data for tests
└─ cover.jpg                         # catalog cover, 800×534px, ≤150KB
```

## Develop locally

Requires a Gladys server on 5.1.0 or later.

```bash
npm install

GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token-from-dev-install>" \
GLADYS_INTEGRATION_SELECTOR="iss-overhead" \
LOG_LEVEL=debug \
npm start
```

Set `DEBUG=gladys-integration-sdk` to have the SDK validate every widget
content and image it sends and log what the core would drop or truncate.

## Quality checks

```bash
npm run format:check   # Prettier
npm run lint           # ESLint
npm test               # unit tests (node --test)
npm run coverage       # tests + coverage thresholds (needs Node >= 22.8)
```

Unit tests cover the pure logic (`pass-predictor.js`, `widget-content.js`,
`scene-events.js` scheduling) without any network or Gladys dependency, and
check the widget content and image against the SDK's own copy of the core's
normalizer (`validateWidgetContent` / `validateWidgetImage`). There is no
automated end-to-end test: validate the widget and scene trigger/action
manually against a local Gladys, including at least one real observed pass,
before trusting the elevation/darkness computation beyond the unit fixtures.

## Publish

1. Push this repo to GitHub, add the topic `gladys-assistant-integration`.
2. **Actions → Release → Run workflow** (`patch` / `minor` / `major`).

The Release workflow bumps `package.json` and the manifest (`version` and the
`docker_image` tag, kept in lockstep), tags, publishes a GitHub Release, and
builds the multi-arch image to `ghcr.io`. The decentralized indexer picks the
repo up from there — no review, no account to create.

## License

Apache-2.0
