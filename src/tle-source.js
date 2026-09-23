// -----------------------------------------------------------------------------
// ISS orbital data (TLE), fetched from Celestrak (no API key) and cached to
// disk so a container restart does not need a fresh fetch to compute passes.
//
// `fetchImpl` and `fs` are injectable so unit tests never touch the real
// network or filesystem — the Gladys sandbox mounts a read-only rootfs, so the
// real cache path in production is always under /data (the one writable
// volume), never the app directory.
// -----------------------------------------------------------------------------

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export const ISS_NORAD_ID = 25544;
export const CELESTRAK_TLE_URL = `https://celestrak.org/NORAD/elements/gp.php?CATNR=${ISS_NORAD_ID}&FORMAT=TLE`;
export const DEFAULT_CACHE_PATH = '/data/tle-cache.json';

// A TLE is only trustworthy for a few days after its epoch; past this, treat
// it as stale for display purposes (the widget's "orbital data" status row).
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

// Overall deadline for one Celestrak request (headers AND body): without it a
// stalled connection holds the startup path for undici's ~5 min defaults.
export const FETCH_TIMEOUT_MS = 15 * 1000;

/**
 * Parse Celestrak's 3-line TLE text (name line + the two element lines).
 * @param {string} text - Raw response body from Celestrak.
 * @returns {{line1: string, line2: string}} The two TLE lines.
 * @example
 * parseTleText('ISS (ZARYA)\n1 25544U ...\n2 25544 ...');
 */
export function parseTleText(text) {
  const lines = text
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);

  const line1 = lines.find((line) => line.startsWith('1 '));
  const line2 = lines.find((line) => line.startsWith('2 '));
  if (!line1 || !line2) {
    throw new Error('Could not find both TLE lines in the Celestrak response');
  }
  return { line1, line2 };
}

/**
 * Loads, caches and refreshes the ISS TLE.
 */
export class TleSource {
  /**
   * @param {object} [deps]
   * @param {string} [deps.cachePath] - Where to persist the last known-good TLE.
   * @param {typeof fetch} [deps.fetchImpl] - Injectable for tests.
   * @param {{readFile: Function, writeFile: Function, rename: Function, mkdir: Function}} [deps.fs] - Injectable for tests.
   * @param {number} [deps.fetchTimeoutMs] - Deadline of one Celestrak request, injectable for tests.
   */
  constructor({
    cachePath = DEFAULT_CACHE_PATH,
    fetchImpl = fetch,
    fs = { readFile, writeFile, rename, mkdir },
    fetchTimeoutMs = FETCH_TIMEOUT_MS,
  } = {}) {
    this.cachePath = cachePath;
    this.fetchImpl = fetchImpl;
    this.fs = fs;
    this.fetchTimeoutMs = fetchTimeoutMs;
    this.current = null;
  }

  /**
   * Load the last cached TLE from disk, if any.
   * @returns {Promise<{line1: string, line2: string, fetchedAt: string}|null>} The cached TLE, or null.
   * @example
   * await tleSource.load();
   */
  async load() {
    try {
      const raw = await this.fs.readFile(this.cachePath, 'utf8');
      this.current = JSON.parse(raw);
    } catch {
      this.current = null;
    }
    return this.current;
  }

  /**
   * Fetch a fresh TLE from Celestrak and persist it, replacing the cache.
   * @returns {Promise<{line1: string, line2: string, fetchedAt: string}>} The refreshed TLE.
   * @example
   * await tleSource.refresh();
   */
  async refresh() {
    // The same signal also aborts the body read below.
    const response = await this.fetchImpl(CELESTRAK_TLE_URL, { signal: AbortSignal.timeout(this.fetchTimeoutMs) });
    if (!response.ok) {
      throw new Error(`Celestrak request failed with status ${response.status}`);
    }
    const { line1, line2 } = parseTleText(await response.text());
    this.current = { line1, line2, fetchedAt: new Date().toISOString() };

    await this.fs.mkdir(dirname(this.cachePath), { recursive: true });
    // tmp + rename: a crash mid-write leaves the previous cache intact rather
    // than a truncated one. Owner-only, like every file under /data.
    const tmpPath = `${this.cachePath}.tmp`;
    await this.fs.writeFile(tmpPath, JSON.stringify(this.current), { encoding: 'utf8', mode: 0o600 });
    await this.fs.rename(tmpPath, this.cachePath);

    return this.current;
  }

  /**
   * Whether the currently held TLE is old enough to flag as stale.
   * @returns {boolean} True when there is no TLE, or it is older than STALE_AFTER_MS.
   * @example
   * tleSource.isStale();
   */
  isStale() {
    if (!this.current) {
      return true;
    }
    return Date.now() - new Date(this.current.fetchedAt).getTime() > STALE_AFTER_MS;
  }
}
