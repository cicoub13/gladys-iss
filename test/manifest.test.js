// -----------------------------------------------------------------------------
// The manifest and the code state some facts twice (config defaults, the
// scene action's key). Nothing links them at runtime, and a divergence fails
// at the worst possible moment. These tests are that link.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { DEFAULT_CONFIG } from '../src/config.js';

const MAX_COVER_BYTES = 150 * 1024;

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
