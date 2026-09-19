import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildNextPassOutput } from '../src/scene-actions.js';

function makePass(startTime, overrides = {}) {
  return {
    startTime,
    endTime: new Date(startTime.getTime() + 5 * 60 * 1000),
    maxElevationTime: new Date(startTime.getTime() + 2 * 60 * 1000),
    maxElevationDeg: 42,
    startAzimuthDeg: 315,
    maxAzimuthDeg: 0,
    endAzimuthDeg: 90,
    direction: 'NW',
    durationSeconds: 300,
    ...overrides,
  };
}

test('buildNextPassOutput returns found:false and nothing else when no pass is upcoming', () => {
  const output = buildNextPassOutput([], new Date('2026-09-20T00:00:00Z'));
  assert.deepEqual(output, { found: false });
});

test('buildNextPassOutput ignores passes already in the past', () => {
  const now = new Date('2026-09-20T20:10:00Z');
  const past = makePass(new Date('2026-09-20T20:00:00Z'));
  const output = buildNextPassOutput([past], now);
  assert.deepEqual(output, { found: false });
});

test('buildNextPassOutput returns the first still-future pass, with minutes_until rounded', () => {
  const now = new Date('2026-09-20T19:45:00Z');
  const upcoming = makePass(new Date('2026-09-20T20:00:00Z'));
  const output = buildNextPassOutput([upcoming], now);

  assert.deepEqual(output, {
    found: true,
    start_time: '2026-09-20T20:00:00.000Z',
    minutes_until: 15,
    max_elevation_deg: 42,
    duration_seconds: 300,
    direction: 'NW',
  });
});

test('buildNextPassOutput skips past passes cached alongside future ones', () => {
  const now = new Date('2026-09-20T20:10:00Z');
  const past = makePass(new Date('2026-09-20T20:00:00Z'));
  const future = makePass(new Date('2026-09-21T05:00:00Z'), { direction: 'SE' });
  const output = buildNextPassOutput([past, future], now);

  assert.equal(output.found, true);
  assert.equal(output.direction, 'SE');
});
