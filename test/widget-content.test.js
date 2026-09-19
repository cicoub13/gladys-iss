import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWidgetContent } from '../src/widget-content.js';

const MAX_COMPONENTS = 8;
const MAX_TILES = 6;
const MAX_STATUS = 1;
const MAX_BUTTONS = 4;

function makePass(overrides = {}) {
  return {
    startTime: new Date('2026-09-20T20:00:00Z'),
    endTime: new Date('2026-09-20T20:05:00Z'),
    maxElevationTime: new Date('2026-09-20T20:02:30Z'),
    maxElevationDeg: 38,
    startAzimuthDeg: 315,
    maxAzimuthDeg: 0,
    endAzimuthDeg: 90,
    direction: 'NW',
    durationSeconds: 300,
    ...overrides,
  };
}

function countByType(components, type) {
  return components.filter((component) => component.type === type).length;
}

test('buildWidgetContent with no passes returns a single status component, no empty card-list', () => {
  const content = buildWidgetContent([], { now: new Date('2026-09-20T00:00:00Z') });

  assert.equal(content.version, 1);
  assert.ok(content.ttl_seconds > 0);
  assert.equal(content.components.length, 1);
  assert.equal(content.components[0].type, 'status');
  assert.ok(content.components[0].rows.length >= 1);
});

test('buildWidgetContent with passes respects the component budget', () => {
  const now = new Date('2026-09-20T19:00:00Z');
  const content = buildWidgetContent([makePass()], { now });

  assert.ok(content.components.length <= MAX_COMPONENTS);
  assert.ok(countByType(content.components, 'value') <= MAX_TILES);
  assert.ok(countByType(content.components, 'status') <= MAX_STATUS);
  assert.ok(countByType(content.components, 'button') <= MAX_BUTTONS);
  // Exactly one focal component (the card-list) in this MVP shape.
  assert.equal(countByType(content.components, 'card-list'), 1);
});

test('buildWidgetContent truncates the card-list to 5 items', () => {
  const passes = Array.from({ length: 8 }, (_, index) =>
    makePass({ startTime: new Date(Date.parse('2026-09-20T20:00:00Z') + index * 90 * 60 * 1000) }),
  );
  const content = buildWidgetContent(passes, { now: new Date('2026-09-20T00:00:00Z') });
  const cardList = content.components.find((component) => component.type === 'card-list');

  assert.equal(cardList.items.length, 5);
});

test('buildWidgetContent computes minutes-until-next from the given `now`', () => {
  const now = new Date('2026-09-20T19:50:00Z');
  const content = buildWidgetContent([makePass()], { now });
  const nextPassTile = content.components.find((c) => c.type === 'value' && c.label === 'Next pass');

  assert.equal(nextPassTile.value, 10);
  assert.equal(nextPassTile.unit, 'min');
});

test('buildWidgetContent never returns a negative minutes-until value', () => {
  // `now` is already past the pass start (can happen between two recomputes).
  const now = new Date('2026-09-20T20:10:00Z');
  const content = buildWidgetContent([makePass()], { now });
  const nextPassTile = content.components.find((c) => c.type === 'value' && c.label === 'Next pass');

  assert.equal(nextPassTile.value, 0);
});

test('buildWidgetContent flags a pass more than 24h away as not visible soon', () => {
  const now = new Date('2026-09-20T00:00:00Z');
  const farPass = makePass({ startTime: new Date('2026-09-25T20:00:00Z') });
  const content = buildWidgetContent([farPass], { now });
  const status = content.components.find((component) => component.type === 'status');

  assert.equal(status.rows.find((row) => row.label === 'Visible soon').value, 'No');
});

test('buildWidgetContent includes the orbital-data row only when tleStale is known', () => {
  const now = new Date('2026-09-20T00:00:00Z');

  const withoutInfo = buildWidgetContent([makePass()], { now });
  assert.equal(
    withoutInfo.components.find((c) => c.type === 'status').rows.find((row) => row.label === 'Orbital data'),
    undefined,
  );

  const stale = buildWidgetContent([makePass()], { now, tleStale: true });
  assert.equal(
    stale.components.find((c) => c.type === 'status').rows.find((row) => row.label === 'Orbital data').value,
    'Stale',
  );

  const fresh = buildWidgetContent([makePass()], { now, tleStale: false });
  assert.equal(
    fresh.components.find((c) => c.type === 'status').rows.find((row) => row.label === 'Orbital data').value,
    'Fresh',
  );
});
