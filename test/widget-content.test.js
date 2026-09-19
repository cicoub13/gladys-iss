import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWidgetContent, ISS_IMAGE_KEY } from '../src/widget-content.js';

const MAX_COMPONENTS = 8;
const MAX_TILES = 6;
const MAX_STATUS = 1;
const MAX_BUTTONS = 4;
const MAX_STATUS_ITEMS = 10;

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

// Meta status rows ("Visible soon", "Orbital data") carry a { en, fr } label;
// pass rows carry a plain UTC-formatted string label — this is how the two
// kinds are told apart in the flat `items` array.
function findMetaItem(items, englishLabel) {
  return items.find((item) => typeof item.label === 'object' && item.label.en === englishLabel);
}

test('buildWidgetContent with no passes: the illustration plus a single status component', () => {
  const content = buildWidgetContent([], { now: new Date('2026-09-20T00:00:00Z') });

  assert.equal(content.version, 1);
  assert.ok(content.ttl_seconds > 0);
  assert.deepEqual(
    content.components.map((c) => c.type),
    ['image', 'status'],
  );
  assert.equal(content.components[0].key, ISS_IMAGE_KEY);
  assert.equal(findMetaItem(content.components[1].items, 'Visible soon').value.en, 'No');
});

test('buildWidgetContent with passes respects the component budget (image is the one focal slot)', () => {
  const now = new Date('2026-09-20T19:00:00Z');
  const content = buildWidgetContent([makePass()], { now });

  assert.ok(content.components.length <= MAX_COMPONENTS);
  assert.ok(countByType(content.components, 'value') <= MAX_TILES);
  assert.ok(countByType(content.components, 'status') <= MAX_STATUS);
  assert.ok(countByType(content.components, 'button') <= MAX_BUTTONS);
  // image and card-list are both FOCAL types (WIDGET_CONTENT_BUDGET.focal = 1):
  // exactly one focal component total, no card-list at all in this shape.
  assert.equal(countByType(content.components, 'image'), 1);
  assert.equal(countByType(content.components, 'card-list'), 0);
});

test('buildWidgetContent declares the ISS illustration as a cover-fit image with a translated alt text', () => {
  const content = buildWidgetContent([makePass()], { now: new Date('2026-09-20T00:00:00Z') });
  const image = content.components.find((component) => component.type === 'image');

  assert.equal(image.key, ISS_IMAGE_KEY);
  assert.equal(image.fit, 'cover');
  assert.ok(image.alt.en && image.alt.fr);
});

test('buildWidgetContent truncates the pass rows to 5, keeping the 2 summary rows on top', () => {
  const passes = Array.from({ length: 8 }, (_, index) =>
    makePass({ startTime: new Date(Date.parse('2026-09-20T20:00:00Z') + index * 90 * 60 * 1000) }),
  );
  const content = buildWidgetContent(passes, { now: new Date('2026-09-20T00:00:00Z'), tleStale: false });
  const items = content.components.find((component) => component.type === 'status').items;

  assert.ok(items.length <= MAX_STATUS_ITEMS);
  assert.equal(items.length, 7); // 5 pass rows + "Visible soon" + "Orbital data"
  assert.equal(findMetaItem(items, 'Visible soon') !== undefined, true);
  assert.equal(findMetaItem(items, 'Orbital data') !== undefined, true);
});

test('a pass status row shows the UTC time, direction, elevation and duration as plain (language-neutral) strings', () => {
  const content = buildWidgetContent([makePass()], { now: new Date('2026-09-20T00:00:00Z') });
  const items = content.components.find((component) => component.type === 'status').items;
  const passRow = items[0];

  assert.equal(passRow.label, '20/09 20:00 UTC');
  assert.equal(passRow.value, 'NW · 38° · 5min');
});

test('buildWidgetContent computes minutes-until-next from the given `now`', () => {
  const now = new Date('2026-09-20T19:50:00Z');
  const content = buildWidgetContent([makePass()], { now });
  const nextPassTile = content.components.find((c) => c.type === 'value' && c.label.en === 'Next pass');

  assert.equal(nextPassTile.value, 10);
  assert.equal(nextPassTile.unit, 'min');
});

test('buildWidgetContent never returns a negative minutes-until value', () => {
  // `now` is already past the pass start (can happen between two recomputes).
  const now = new Date('2026-09-20T20:10:00Z');
  const content = buildWidgetContent([makePass()], { now });
  const nextPassTile = content.components.find((c) => c.type === 'value' && c.label.en === 'Next pass');

  assert.equal(nextPassTile.value, 0);
});

test('buildWidgetContent flags a pass more than 24h away as not visible soon', () => {
  const now = new Date('2026-09-20T00:00:00Z');
  const farPass = makePass({ startTime: new Date('2026-09-25T20:00:00Z') });
  const content = buildWidgetContent([farPass], { now });
  const items = content.components.find((component) => component.type === 'status').items;

  assert.deepEqual(findMetaItem(items, 'Visible soon').value, { en: 'No', fr: 'Non' });
});

test('buildWidgetContent includes the orbital-data row only when tleStale is known', () => {
  const now = new Date('2026-09-20T00:00:00Z');

  const withoutInfo = buildWidgetContent([makePass()], { now });
  assert.equal(findMetaItem(withoutInfo.components.find((c) => c.type === 'status').items, 'Orbital data'), undefined);

  const stale = buildWidgetContent([makePass()], { now, tleStale: true });
  assert.deepEqual(findMetaItem(stale.components.find((c) => c.type === 'status').items, 'Orbital data').value, {
    en: 'Stale',
    fr: 'Périmé',
  });

  const fresh = buildWidgetContent([makePass()], { now, tleStale: false });
  assert.deepEqual(findMetaItem(fresh.components.find((c) => c.type === 'status').items, 'Orbital data').value, {
    en: 'Fresh',
    fr: 'À jour',
  });
});

test('buildWidgetContent puts the caption text under `text`, not `value` (server normalizer field name)', () => {
  const content = buildWidgetContent([makePass()], { now: new Date('2026-09-20T00:00:00Z') });
  const caption = content.components.find((component) => component.type === 'text');

  assert.equal(caption.text.en, 'Upcoming ISS passes');
  assert.ok(caption.text.fr);
  assert.equal(caption.value, undefined);
});

test('every human-facing label/value that is not a pass row is a multi-language object, per the widget spec', () => {
  const content = buildWidgetContent([makePass()], { now: new Date('2026-09-20T00:00:00Z'), tleStale: false });

  for (const component of content.components) {
    if (component.type === 'text') {
      assert.ok(component.text.en && component.text.fr);
    }
    if (component.type === 'value') {
      assert.ok(component.label.en && component.label.fr);
    }
    if (component.type === 'image') {
      assert.ok(component.alt.en && component.alt.fr);
    }
    if (component.type === 'status') {
      for (const item of component.items) {
        if (typeof item.label === 'object') {
          assert.ok(item.label.en && item.label.fr);
          assert.ok(item.value.en && item.value.fr);
        }
      }
    }
  }
});
