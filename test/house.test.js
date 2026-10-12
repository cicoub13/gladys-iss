import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectHouse, fetchHouse, refreshHouse } from '../src/house.js';
import { normalizeConfig } from '../src/config.js';

// getHouses() sorts by name: the house that used to win by default comes first.
const HOUSES = [
  { id: '1', name: 'Apartment', selector: 'apartment', latitude: 48.8566, longitude: 2.3522 },
  { id: '2', name: 'Barn', selector: 'barn', latitude: null, longitude: null },
  { id: '3', name: 'Cottage', selector: 'cottage', latitude: 45.764, longitude: 4.8357 },
];

const APARTMENT = { latitude: 48.8566, longitude: 2.3522 };
const COTTAGE = { latitude: 45.764, longitude: 4.8357 };

function fakeLogger() {
  const warnings = [];
  const errors = [];
  return { warnings, errors, warn: (...args) => warnings.push(args), error: (...args) => errors.push(args) };
}

test('selectHouse returns the chosen house when it is located', () => {
  assert.equal(selectHouse(HOUSES, 'cottage').selector, 'cottage');
});

test('selectHouse falls back to the first located house when nothing is chosen', () => {
  assert.equal(selectHouse(HOUSES, null).selector, 'apartment');
  assert.equal(selectHouse(HOUSES, undefined).selector, 'apartment');
});

test('selectHouse falls back to the first located house when the chosen one is unknown or unlocated', () => {
  assert.equal(selectHouse(HOUSES, 'deleted-house').selector, 'apartment');
  assert.equal(selectHouse(HOUSES, 'barn').selector, 'apartment');
});

test('selectHouse returns null when no house is located', () => {
  assert.equal(selectHouse([HOUSES[1]], 'barn'), null);
  assert.equal(selectHouse([], null), null);
});

test('fetchHouse returns the coordinates of the chosen house', async () => {
  const logger = fakeLogger();
  assert.deepEqual(await fetchHouse(async () => HOUSES, 'cottage', logger), COTTAGE);
  assert.equal(logger.warnings.length, 0);
});

test('fetchHouse falls back silently when no house is chosen (existing installs)', async () => {
  const logger = fakeLogger();
  assert.deepEqual(await fetchHouse(async () => HOUSES, null, logger), APARTMENT);
  assert.equal(logger.warnings.length, 0);
});

test('fetchHouse falls back and warns when the chosen house is unknown or unlocated', async () => {
  for (const selector of ['deleted-house', 'barn']) {
    const logger = fakeLogger();
    assert.deepEqual(await fetchHouse(async () => HOUSES, selector, logger), APARTMENT);
    assert.equal(logger.warnings.length, 1);
    assert.match(logger.warnings[0][0], new RegExp(selector));
  }
});

test('fetchHouse throws when no house is located', async () => {
  await assert.rejects(
    fetchHouse(async () => [HOUSES[1]], null, fakeLogger()),
    /No house with a known location/,
  );
});

test('a configuration change to another house switches the coordinates the passes use', async () => {
  const config = normalizeConfig({ house: 'cottage' });
  const house = await refreshHouse({
    current: APARTMENT,
    getHouses: async () => HOUSES,
    selector: config.house,
    logger: fakeLogger(),
  });
  assert.deepEqual(house, COTTAGE);
});

test('a configuration change clearing the house goes back to the first located house', async () => {
  const config = normalizeConfig({ house: '' });
  const house = await refreshHouse({
    current: COTTAGE,
    getHouses: async () => HOUSES,
    selector: config.house,
    logger: fakeLogger(),
  });
  assert.deepEqual(house, APARTMENT);
});

test('refreshHouse keeps the current house when the houses cannot be read', async () => {
  const logger = fakeLogger();
  const house = await refreshHouse({
    current: APARTMENT,
    getHouses: async () => {
      throw new Error('host API unreachable');
    },
    selector: 'cottage',
    logger,
  });
  assert.deepEqual(house, APARTMENT);
  assert.equal(logger.errors.length, 1);
});
