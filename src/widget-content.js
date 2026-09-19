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
// Component budget respected here (per WIDGET_CONTENT_BUDGET in the same
// branch's server/lib/external-integration/constants.js): max 8 components, 1
// focal (the card-list), tiles <= 6 (2 used), text <= 2 with <= 1 body (1
// caption used), status <= 1 (1 used), no buttons in this MVP.
//
// Dates are sent as ISO strings in a dedicated `date` field, never pre-
// formatted into a title: the integration does not know the viewer's time
// zone (Gladys house records carry latitude/longitude, not a time zone), so
// only the core/front-end can render a date correctly for whoever is looking
// at the dashboard.
// -----------------------------------------------------------------------------

const MAX_LIST_ITEMS = 5;
const DEFAULT_TTL_SECONDS = 60;

// No time zone is available for the house (see module comment above), so
// "visible tonight" is approximated as "a pass starts within the next 24h"
// rather than the true local calendar evening.
const VISIBLE_SOON_WINDOW_MS = 24 * 60 * 60 * 1000;

function passToListItem(pass) {
  return {
    title: `${pass.direction} · ${Math.round(pass.maxElevationDeg)}°`,
    subtitle: `${Math.round(pass.durationSeconds / 60)} min`,
    date: pass.startTime.toISOString(),
  };
}

function emptyContent(ttlSeconds) {
  return {
    version: 1,
    ttl_seconds: ttlSeconds,
    components: [
      {
        type: 'status',
        items: [{ label: 'Visible soon', value: 'No', color: 'neutral' }],
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

  const statusItems = [
    { label: 'Visible soon', value: visibleSoon ? 'Yes' : 'No', color: visibleSoon ? 'success' : 'neutral' },
  ];
  if (options.tleStale !== undefined) {
    statusItems.push({
      label: 'Orbital data',
      value: options.tleStale ? 'Stale' : 'Fresh',
      color: options.tleStale ? 'warning' : 'neutral',
    });
  }

  return {
    version: 1,
    ttl_seconds: ttlSeconds,
    components: [
      { type: 'text', variant: 'caption', text: 'Upcoming ISS passes' },
      { type: 'value', label: 'Next pass', value: minutesUntilNext, unit: 'min', color: 'primary' },
      { type: 'value', label: 'Max elevation', value: Math.round(next.maxElevationDeg), unit: '°', color: 'primary' },
      { type: 'card-list', display: 'list', items: passes.slice(0, MAX_LIST_ITEMS).map(passToListItem) },
      { type: 'status', items: statusItems },
    ],
  };
}
