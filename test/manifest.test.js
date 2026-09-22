// -----------------------------------------------------------------------------
// The manifest and the code state some facts twice (config defaults, the
// scene action's key). Nothing links them at runtime, and a divergence fails
// at the worst possible moment. These tests are that link.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { validateWidgetImage } from '@gladysassistant/integration-sdk';
import { DEFAULT_CONFIG } from '../src/config.js';
import { WIDGET_KEY } from '../src/widget-content.js';
import { SCENE_ACTION_KEY } from '../src/scene-actions.js';
import { SCENE_TRIGGER_KEY } from '../src/scene-events.js';

const MAX_COVER_BYTES = 150 * 1024;
// The Gladys release that ships the provider type, the dashboard widgets and
// the scene triggers/actions this integration is made of: v5.0.4's manifest
// schema still had none of them.
const MIN_GLADYS_VERSION = '>=5.1.0';
// INTEGRATION_CATALOG_CATEGORIES in the core: the browse categories of the
// catalog sidebar. The manifest schema deliberately has no enum (an unknown
// key is dropped with a warning, never a rejection) — so a typo here would
// silently land the integration in the uncategorized bucket.
const CATALOG_CATEGORIES = [
  'climate',
  'lighting',
  'energy',
  'security',
  'multimedia',
  'appliances',
  'environment',
  'protocols',
  'network',
  'notifications',
  'assistants',
  'services',
];

const readJson = (name) => JSON.parse(readFileSync(new URL(`../${name}`, import.meta.url), 'utf8'));

const manifest = readJson('gladys-assistant-integration.json');
const pkg = readJson('package.json');

test('the manifest version matches package.json and the image tag', () => {
  assert.equal(manifest.version, pkg.version);
  assert.ok(
    manifest.docker_image.endsWith(`:${manifest.version}`),
    `docker_image ${manifest.docker_image} must be tagged ${manifest.version}`,
  );
});

test('the manifest is a provider integration that declares location and at least one capability', () => {
  assert.equal(manifest.type, 'provider');
  assert.equal(manifest.location, true);
  assert.ok(
    (manifest.widgets?.length ?? 0) > 0 ||
      (manifest.scene_triggers?.length ?? 0) > 0 ||
      (manifest.scene_actions?.length ?? 0) > 0,
  );
});

test('the manifest requires the Gladys release that ships these capabilities', () => {
  assert.equal(manifest.gladys_version, MIN_GLADYS_VERSION);
});

test('the catalog categories are declared and come from the core vocabulary', () => {
  assert.ok(manifest.categories?.length >= 1 && manifest.categories.length <= 3);
  for (const category of manifest.categories) {
    assert.ok(CATALOG_CATEGORIES.includes(category), `unknown catalog category: ${category}`);
  }
});

test('the widget, trigger and action keys the code registers are the ones the manifest declares', () => {
  // The SDK routes every widget.get / scene-action.run by key: a key declared
  // here but registered under another name reaches no handler at all.
  assert.deepEqual(
    manifest.widgets.map((widget) => widget.key),
    [WIDGET_KEY],
  );
  assert.deepEqual(
    manifest.scene_triggers.map((trigger) => trigger.key),
    [SCENE_TRIGGER_KEY],
  );
  assert.deepEqual(
    manifest.scene_actions.map((action) => action.key),
    [SCENE_ACTION_KEY],
  );
});

test('the min_elevation_deg config default matches the one the code falls back to', () => {
  const field = manifest.config_schema.find((entry) => entry.key === 'min_elevation_deg');
  assert.equal(field.default, DEFAULT_CONFIG.min_elevation_deg);
});

test('the lookahead_days config default matches the one the code falls back to', () => {
  const field = manifest.config_schema.find((entry) => entry.key === 'lookahead_days');
  assert.equal(Number(field.default), DEFAULT_CONFIG.lookahead_days);
});

test('every scene trigger and action field/variable/output is translated (en + fr)', () => {
  const labeledEntries = [
    ...manifest.widgets.flatMap((widget) => [widget, ...(widget.settings ?? [])]),
    ...manifest.scene_triggers.flatMap((trigger) => [trigger, ...trigger.fields, ...trigger.variables]),
    ...manifest.scene_actions.flatMap((action) => [action, ...action.outputs]),
  ];

  for (const entry of labeledEntries) {
    assert.ok(entry.label.en, `missing English label on ${JSON.stringify(entry)}`);
    assert.ok(entry.label.fr, `missing French label on ${JSON.stringify(entry)}`);
  }
});

test('the scene trigger direction options are exactly the 8 compass points the code produces', () => {
  const trigger = manifest.scene_triggers.find((entry) => entry.key === 'pass_starting');
  const directionField = trigger.fields.find((field) => field.key === 'direction');
  assert.deepEqual(
    directionField.options.map((option) => option.value),
    ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'],
  );
});

test('the cover image points at a real, appropriately sized file in the repo', () => {
  assert.ok(manifest.cover_image.endsWith('/cover.jpg'));
  const size = statSync(new URL('../cover.jpg', import.meta.url)).size;
  assert.ok(size <= MAX_COVER_BYTES, `cover.jpg is ${size} bytes, over the ${MAX_COVER_BYTES}-byte store limit`);
});

test('the next_pass scene action declares the exact keys buildNextPassOutput can return', () => {
  const action = manifest.scene_actions.find((entry) => entry.key === 'next_pass');
  const declaredKeys = action.outputs.map((output) => output.key).sort();
  assert.deepEqual(
    declaredKeys,
    ['direction', 'duration_seconds', 'found', 'max_elevation_deg', 'minutes_until', 'start_time'].sort(),
  );
});

test('the widget image asset is one the core will serve, not refuse', () => {
  // The core validates and REFUSES (it never recompresses): a PNG/JPEG/WebP of
  // at most 300 KB decoded and 4096x4096 px. validateWidgetImage is the SDK's
  // copy of that check, run here on the bytes actually shipped in the image.
  const bytes = readFileSync(new URL('../assets/iss-photo.jpg', import.meta.url));
  assert.deepEqual(validateWidgetImage(bytes.toString('base64')), []);
});

test('the Dockerfile ships the widget image asset the code reads at runtime', () => {
  // A missing asset only surfaces when a dashboard first shows the card, long
  // after the build that dropped it.
  const dockerfile = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');
  assert.match(dockerfile, /COPY assets\/iss-photo\.jpg/);
});
