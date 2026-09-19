import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TleSource, parseTleText, CELESTRAK_TLE_URL, STALE_AFTER_MS } from '../src/tle-source.js';

const SAMPLE_TLE_TEXT = [
  'ISS (ZARYA)',
  '1 25544U 98067A   26261.78789299  .00005868  00000+0  11393-3 0  9992',
  '2 25544  51.6308 196.8438 0004827 155.1807 204.9414 15.49168087586262',
].join('\n');

function fakeFs(initialFiles = {}) {
  const files = new Map(Object.entries(initialFiles));
  return {
    files,
    async readFile(path) {
      if (!files.has(path)) {
        const err = new Error('ENOENT');
        err.code = 'ENOENT';
        throw err;
      }
      return files.get(path);
    },
    async writeFile(path, content) {
      files.set(path, content);
    },
    async mkdir() {},
  };
}

function fakeFetch(responses) {
  let call = 0;
  return async () => {
    const response = responses[Math.min(call, responses.length - 1)];
    call += 1;
    return response;
  };
}

test('parseTleText extracts the two element lines from a 3-line Celestrak reply', () => {
  const { line1, line2 } = parseTleText(SAMPLE_TLE_TEXT);
  assert.ok(line1.startsWith('1 25544U'));
  assert.ok(line2.startsWith('2 25544'));
});

test('parseTleText throws when a TLE line is missing', () => {
  assert.throws(() => parseTleText('ISS (ZARYA)\nnot a tle line'));
});

test('TleSource.load returns null when there is no cache yet', async () => {
  const source = new TleSource({ cachePath: '/data/tle-cache.json', fs: fakeFs() });
  const result = await source.load();
  assert.equal(result, null);
  assert.equal(source.current, null);
});

test('TleSource.load reads back a previously cached TLE', async () => {
  const cached = { line1: '1 ...', line2: '2 ...', fetchedAt: new Date().toISOString() };
  const source = new TleSource({
    cachePath: '/data/tle-cache.json',
    fs: fakeFs({ '/data/tle-cache.json': JSON.stringify(cached) }),
  });

  const result = await source.load();
  assert.deepEqual(result, cached);
});

test('TleSource.refresh fetches, parses and persists a fresh TLE', async () => {
  const fs = fakeFs();
  const source = new TleSource({
    cachePath: '/data/tle-cache.json',
    fs,
    fetchImpl: fakeFetch([{ ok: true, text: async () => SAMPLE_TLE_TEXT }]),
  });

  const result = await source.refresh();

  assert.ok(result.line1.startsWith('1 25544U'));
  assert.ok(result.fetchedAt);
  assert.equal(JSON.parse(fs.files.get('/data/tle-cache.json')).line1, result.line1);
});

test('TleSource.refresh throws on a non-ok HTTP response', async () => {
  const source = new TleSource({
    cachePath: '/data/tle-cache.json',
    fs: fakeFs(),
    fetchImpl: fakeFetch([{ ok: false, status: 503, text: async () => '' }]),
  });

  await assert.rejects(() => source.refresh());
});

test('TleSource.refresh calls Celestrak for the ISS (NORAD 25544)', async () => {
  let calledUrl;
  const source = new TleSource({
    cachePath: '/data/tle-cache.json',
    fs: fakeFs(),
    fetchImpl: async (url) => {
      calledUrl = url;
      return { ok: true, text: async () => SAMPLE_TLE_TEXT };
    },
  });

  await source.refresh();
  assert.equal(calledUrl, CELESTRAK_TLE_URL);
});

test('TleSource.isStale is true when there is no TLE yet', () => {
  const source = new TleSource({ fs: fakeFs() });
  assert.equal(source.isStale(), true);
});

test('TleSource.isStale reflects the STALE_AFTER_MS threshold', async () => {
  const fs = fakeFs();
  const source = new TleSource({
    cachePath: '/data/tle-cache.json',
    fs,
    fetchImpl: fakeFetch([{ ok: true, text: async () => SAMPLE_TLE_TEXT }]),
  });
  await source.refresh();
  assert.equal(source.isStale(), false);

  source.current.fetchedAt = new Date(Date.now() - STALE_AFTER_MS - 1000).toISOString();
  assert.equal(source.isStale(), true);
});
