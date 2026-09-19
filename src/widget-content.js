// -----------------------------------------------------------------------------
// Pure mapping: Pass[] (from pass-predictor.js) -> the widget content envelope
// sent back on `external-integration.widget.get` (wrapped in `{ content }` by
// raw-messages.js, per the core's expectation).
//
// Component field names below are verified against the actual (unmerged, PR
// #3109 branch) server-side normalizer,
// server/lib/external-integration/externalIntegration.normalizeWidgetContent.js:
// `text` components carry `text` (not `value`), `status` components carry
// `items` (not `rows`), each `{label, value, icon, color}`.
//
// Only one FOCAL component is allowed per widget (chart/card-list/image,
// WIDGET_CONTENT_BUDGET.focal = 1, the second is silently dropped) — so the
// ISS illustration (an `image` component) and the upcoming-passes list can't
// both be a card-list/image pair. The illustration wins the focal slot, and
// the passes move into the (single) `status` component instead, one row per
// pass followed by the two summary rows (<= 10 rows total, well within the
// cap). Component budget: 4 components (text, 2 tiles, image, status) plus
// the tiles pair count as one slot each — max 8, 1 focal, tiles <= 6, text <=
// 2, status <= 1: all comfortably respected.
//
// Losing `card-list` also loses its dedicated `date` field, the only one the
// core reformats in the viewer's own locale/time zone — `status` items are
// plain label/value text the core does not reformat. Without a time zone for
// the house (Gladys house records carry latitude/longitude only), pass times
// are shown as UTC, explicitly labeled, rather than guessed as local time.
//
// Every label/value a human reads is a `{ en, fr }` multi-language object
// (section 4: "every text field accepts a plain string or a multi-language
// object"), never a plain English string: the core picks the viewer's
// language (`getLocalizedText`), so the integration does not need to know
// which language it is being viewed in. Plain strings are used only for
// language-neutral tokens: unit symbols, compass points and the UTC-labeled
// pass times.
// -----------------------------------------------------------------------------

export const ISS_IMAGE_KEY = 'iss-illustration';

const MAX_LIST_ITEMS = 5;
const DEFAULT_TTL_SECONDS = 60;

// No time zone is available for the house (see module comment above), so
// "visible tonight" is approximated as "a pass starts within the next 24h"
// rather than the true local calendar evening.
const VISIBLE_SOON_WINDOW_MS = 24 * 60 * 60 * 1000;

const TEXT = {
  caption: { en: 'Upcoming ISS passes', fr: 'Prochains passages ISS' },
  nextPass: { en: 'Next pass', fr: 'Prochain passage' },
  maxElevation: { en: 'Max elevation', fr: 'Élévation max' },
  visibleSoon: { en: 'Visible soon', fr: 'Visible bientôt' },
  orbitalData: { en: 'Orbital data', fr: 'Données orbitales' },
  yes: { en: 'Yes', fr: 'Oui' },
  no: { en: 'No', fr: 'Non' },
  fresh: { en: 'Fresh', fr: 'À jour' },
  stale: { en: 'Stale', fr: 'Périmé' },
  issAlt: { en: 'The International Space Station orbiting Earth', fr: 'La Station Spatiale Internationale en orbite' },
};

function imageComponent() {
  return { type: 'image', key: ISS_IMAGE_KEY, alt: TEXT.issAlt, fit: 'cover' };
}

function pad(n) {
  return String(n).padStart(2, '0');
}

// UTC only: see the module comment on why a local time cannot be shown.
function formatPassWhenUtc(date) {
  return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

function passToStatusItem(pass) {
  return {
    label: formatPassWhenUtc(pass.startTime),
    value: `${pass.direction} · ${Math.round(pass.maxElevationDeg)}° · ${Math.round(pass.durationSeconds / 60)}min`,
  };
}

function emptyContent(ttlSeconds) {
  return {
    version: 1,
    ttl_seconds: ttlSeconds,
    components: [
      imageComponent(),
      {
        type: 'status',
        items: [{ label: TEXT.visibleSoon, value: TEXT.no, color: 'neutral' }],
      },
    ],
  };
}

/**
 * Build the widget content envelope for the current list of predicted passes.
 * @param {import('./pass-predictor.js').Pass[]} passes - Chronologically ordered visible passes.
 * @param {object} [options]
 * @param {Date} [options.now] - Reference instant (injectable for tests).
 * @param {number} [options.ttlSeconds] - Envelope TTL, defaults to 60s.
 * @param {boolean} [options.tleStale] - When known, shown as an "orbital data" status row.
 * @returns {object} The widget content envelope.
 * @example
 * buildWidgetContent(passes, { now: new Date(), tleStale: false });
 */
export function buildWidgetContent(passes, options = {}) {
  const ttlSeconds = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;

  if (passes.length === 0) {
    return emptyContent(ttlSeconds);
  }

  const now = options.now ?? new Date();
  const next = passes[0];
  const minutesUntilNext = Math.max(0, Math.round((next.startTime.getTime() - now.getTime()) / 60000));
  const visibleSoon = passes.some((pass) => pass.startTime.getTime() - now.getTime() <= VISIBLE_SOON_WINDOW_MS);

  const statusItems = passes.slice(0, MAX_LIST_ITEMS).map(passToStatusItem);
  statusItems.push({
    label: TEXT.visibleSoon,
    value: visibleSoon ? TEXT.yes : TEXT.no,
    color: visibleSoon ? 'success' : 'neutral',
  });
  if (options.tleStale !== undefined) {
    statusItems.push({
      label: TEXT.orbitalData,
      value: options.tleStale ? TEXT.stale : TEXT.fresh,
      color: options.tleStale ? 'warning' : 'neutral',
    });
  }

  return {
    version: 1,
    ttl_seconds: ttlSeconds,
    components: [
      { type: 'text', variant: 'caption', text: TEXT.caption },
      { type: 'value', label: TEXT.nextPass, value: minutesUntilNext, unit: 'min', color: 'primary' },
      { type: 'value', label: TEXT.maxElevation, value: Math.round(next.maxElevationDeg), unit: '°', color: 'primary' },
      imageComponent(),
      { type: 'status', items: statusItems },
    ],
  };
}
