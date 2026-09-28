import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, DEFAULT_CONFIG } from '../src/config.js';

test('normalizeConfig falls back to the defaults when given nothing', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
  assert.deepEqual(normalizeConfig(null), DEFAULT_CONFIG);
  assert.deepEqual(normalizeConfig(undefined), DEFAULT_CONFIG);
});

test('normalizeConfig coerces string values from a form', () => {
  assert.deepEqual(
    normalizeConfig({ min_elevation_deg: '15', lookahead_days: '7', lead_time_minutes: '10', language: 'fr' }),
    { min_elevation_deg: 15, lookahead_days: 7, lead_time_minutes: 10, language: 'fr' },
  );
});

test('normalizeConfig falls back to the default lead time when unset or outside [0, 60]', () => {
  for (const lead_time_minutes of [null, '', -1, 61, 'bogus']) {
    assert.equal(normalizeConfig({ lead_time_minutes }).lead_time_minutes, DEFAULT_CONFIG.lead_time_minutes);
  }
  assert.equal(normalizeConfig({ lead_time_minutes: 0 }).lead_time_minutes, 0);
});

test('normalizeConfig snaps an unknown language back to the default', () => {
  assert.equal(normalizeConfig({ language: 'de' }).language, DEFAULT_CONFIG.language);
});

test('normalizeConfig rejects a min_elevation_deg outside [0, 90]', () => {
  assert.equal(normalizeConfig({ min_elevation_deg: -5 }).min_elevation_deg, DEFAULT_CONFIG.min_elevation_deg);
  assert.equal(normalizeConfig({ min_elevation_deg: 91 }).min_elevation_deg, DEFAULT_CONFIG.min_elevation_deg);
  assert.equal(
    normalizeConfig({ min_elevation_deg: 'not-a-number' }).min_elevation_deg,
    DEFAULT_CONFIG.min_elevation_deg,
  );
});

test('normalizeConfig snaps an out-of-set lookahead_days back to the default', () => {
  assert.equal(normalizeConfig({ lookahead_days: 4 }).lookahead_days, DEFAULT_CONFIG.lookahead_days);
  assert.equal(normalizeConfig({ lookahead_days: 'bogus' }).lookahead_days, DEFAULT_CONFIG.lookahead_days);
});

test('normalizeConfig accepts every declared lookahead_days option', () => {
  assert.equal(normalizeConfig({ lookahead_days: 3 }).lookahead_days, 3);
  assert.equal(normalizeConfig({ lookahead_days: 5 }).lookahead_days, 5);
  assert.equal(normalizeConfig({ lookahead_days: 7 }).lookahead_days, 7);
});
