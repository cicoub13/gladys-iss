// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user in Gladys from the `config_schema` of the manifest.
// This module only provides defaults and coerces the types (a form may hand
// back strings).
// -----------------------------------------------------------------------------

import { LANGUAGES } from './localize.js';

export const DEFAULT_CONFIG = {
  min_elevation_deg: 10,
  lookahead_days: 5,
  lead_time_minutes: 5,
  language: 'fr',
};

// The only lookahead windows the manifest `select` offers — a stale/corrupted
// stored value must snap to this set rather than flow through unchecked.
const LOOKAHEAD_DAYS_OPTIONS = [3, 5, 7];

const MAX_LEAD_TIME_MINUTES = 60;

/**
 * Merge the user configuration with the defaults and coerce the types.
 * @param {Record<string, unknown>} [raw] - Configuration returned by the SDK.
 * @returns {{min_elevation_deg: number, lookahead_days: number, lead_time_minutes: number, language: 'en'|'fr'}} The normalized configuration.
 * @example
 * normalizeConfig({ min_elevation_deg: '15', lookahead_days: '5' });
 */
export function normalizeConfig(raw) {
  // `= {}` would not cover an explicit null, which getConfig() can return.
  const source = raw ?? {};

  const requestedElevation = Number(source.min_elevation_deg);
  const min_elevation_deg =
    Number.isFinite(requestedElevation) && requestedElevation >= 0 && requestedElevation <= 90
      ? requestedElevation
      : DEFAULT_CONFIG.min_elevation_deg;

  const requestedLookahead = Number(source.lookahead_days);
  const lookahead_days = LOOKAHEAD_DAYS_OPTIONS.includes(requestedLookahead)
    ? requestedLookahead
    : DEFAULT_CONFIG.lookahead_days;

  // Number(null) and Number('') are 0: an unset field must not mean "no lead time".
  const requestedLeadTime =
    source.lead_time_minutes == null || source.lead_time_minutes === '' ? NaN : Number(source.lead_time_minutes);
  const lead_time_minutes =
    Number.isFinite(requestedLeadTime) && requestedLeadTime >= 0 && requestedLeadTime <= MAX_LEAD_TIME_MINUTES
      ? requestedLeadTime
      : DEFAULT_CONFIG.lead_time_minutes;

  const language = LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language;

  return { min_elevation_deg, lookahead_days, lead_time_minutes, language };
}
