// -----------------------------------------------------------------------------
// `next_pass` scene action: pure mapping from the cached passes to the
// declared outputs (`found`, `start_time`, `minutes_until`, `max_elevation_deg`,
// `duration_seconds`, `direction`).
//
// When no upcoming pass is cached, only `found: false` is returned: the other
// keys are omitted rather than sent as null, since the manifest declares them
// as scalars (string/number), not nullable.
// -----------------------------------------------------------------------------

/**
 * Build the outputs for the `next_pass` scene action.
 * @param {import('./pass-predictor.js').Pass[]} passes - Chronologically ordered, possibly stale, cached passes.
 * @param {Date} [now] - Reference instant (injectable for tests).
 * @returns {{found: boolean, start_time?: string, minutes_until?: number, max_elevation_deg?: number, duration_seconds?: number, direction?: string}} The action outputs.
 * @example
 * buildNextPassOutput(passes, new Date());
 */
export function buildNextPassOutput(passes, now = new Date()) {
  const next = passes.find((pass) => pass.startTime.getTime() > now.getTime());
  if (!next) {
    return { found: false };
  }

  return {
    found: true,
    start_time: next.startTime.toISOString(),
    minutes_until: Math.max(0, Math.round((next.startTime.getTime() - now.getTime()) / 60000)),
    max_elevation_deg: Math.round(next.maxElevationDeg),
    duration_seconds: next.durationSeconds,
    direction: next.direction,
  };
}
