// -----------------------------------------------------------------------------
// Entry point of the ISS Overhead external integration for Gladys Assistant.
//
// This file only wires the SDK to the ISS logic (src/): it holds no orbital
// math or widget/scene shaping itself. It:
//   1. instantiates the SDK (connection, auth, reconnection: handled for you);
//   2. loads/refreshes the ISS TLE and (re)computes the visible passes;
//   3. attaches the raw-message handlers for widgets/scenes (not yet wrapped
//      by the SDK — see src/message-types.js);
//   4. schedules the `pass_starting` scene trigger;
//   5. connects and reports its status.
//
// The Gladys supervisor injects the connection settings as environment
// variables (GLADYS_HOST_API_URL, GLADYS_INTEGRATION_TOKEN,
// GLADYS_INTEGRATION_SELECTOR); the SDK reads them automatically.
// -----------------------------------------------------------------------------

import { readFile } from 'node:fs/promises';
import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './src/config.js';
import { TleSource } from './src/tle-source.js';
import { findVisiblePasses } from './src/pass-predictor.js';
import { buildWidgetContent, ISS_IMAGE_KEY } from './src/widget-content.js';
import { buildNextPassOutput } from './src/scene-actions.js';
import { PassScheduler, buildPassStartingEventData } from './src/scene-events.js';
import { attachRawMessageHandlers } from './src/raw-messages.js';

const TLE_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
const ISS_IMAGE_PATH = new URL('./assets/iss-illustration.png', import.meta.url);

// Cached on first request: the illustration is a static asset, never changes,
// so its image_key never needs to (section 6: "when the bytes change, the
// key changes" — ours simply never do).
let issImageBase64 = null;

const gladys = new GladysIntegration();
const tleSource = new TleSource();

let config = normalizeConfig();
let house = null;
let passes = [];

const scheduler = new PassScheduler({
  onTrigger: async (pass) => {
    try {
      await gladys.httpClient.post('/scene/event', { key: 'pass_starting', data: buildPassStartingEventData(pass) });
    } catch (err) {
      logger.error('Failed to fire the pass_starting scene event', err);
    }
  },
});

let refreshTimer = null;

function recomputePasses() {
  if (!house || !tleSource.current) {
    passes = [];
    scheduler.reschedule(passes);
    return;
  }
  const window = {
    start: new Date(),
    end: new Date(Date.now() + config.lookahead_days * 24 * 60 * 60 * 1000),
  };
  passes = findVisiblePasses(tleSource.current, house, window, { minElevationDeg: config.min_elevation_deg });
  scheduler.reschedule(passes);
}

async function ensureTle() {
  if (!tleSource.current) {
    await tleSource.load();
  }
  if (!tleSource.current || tleSource.isStale()) {
    try {
      await tleSource.refresh();
    } catch (err) {
      if (!tleSource.current) {
        throw err;
      }
      // Keep using the last known-good (if stale) TLE; the widget's "Orbital
      // data" status row reflects the staleness.
      logger.error('TLE refresh failed, keeping the last known-good one', err);
    }
  }
}

async function fetchHouse() {
  // gladys.httpClient is a real (if undocumented) instance property of the
  // installed SDK, reused here for the `location: true` /house endpoint it
  // does not wrap yet — see src/raw-messages.js for the equivalent note about
  // gladys.ws. Response shape assumed to be a bare array, like /device and
  // /contact (as opposed to /config's `{ config }` wrapper) — re-check once
  // the unmerged spec's exact text is available.
  const houses = await gladys.httpClient.get('/house');
  // MVP simplification: a single house with usable coordinates. Multi-house
  // support (a widget setting to pick one) is left for a later version.
  const candidate = houses.find((entry) => entry.latitude != null && entry.longitude != null);
  if (!candidate) {
    throw new Error('No house with a known location');
  }
  return { latitude: candidate.latitude, longitude: candidate.longitude };
}

function getWidgetContent() {
  return buildWidgetContent(passes, { tleStale: tleSource.isStale() });
}

async function getWidgetImage(imageKey) {
  if (imageKey !== ISS_IMAGE_KEY) {
    throw new Error(`Unknown image key: ${imageKey}`);
  }
  if (!issImageBase64) {
    issImageBase64 = (await readFile(ISS_IMAGE_PATH)).toString('base64');
  }
  return issImageBase64;
}

function handleSceneAction(key) {
  if (key === 'next_pass') {
    return buildNextPassOutput(passes);
  }
  throw new Error(`Unknown scene action: ${key}`);
}

// --- Configuration updated by the user ---------------------------------------
gladys.onConfigUpdated(async (newConfig) => {
  logger.info('onConfigUpdated -> new configuration received');
  try {
    config = normalizeConfig(newConfig);
    recomputePasses();
  } catch (err) {
    logger.error('Could not apply the new configuration, keeping the previous one', err);
  }
});

// --- Connection lifecycle ----------------------------------------------------
gladys.on('connected', async () => {
  try {
    config = normalizeConfig(await gladys.getConfig());
    house = await fetchHouse();
    await ensureTle();
    recomputePasses();
    attachRawMessageHandlers(gladys, { getWidgetContent, getWidgetImage, handleSceneAction, logger });

    if (!refreshTimer) {
      refreshTimer = setInterval(async () => {
        try {
          await ensureTle();
          recomputePasses();
        } catch (err) {
          logger.error('Periodic TLE refresh failed', err);
        }
      }, TLE_REFRESH_INTERVAL_MS);
    }

    await gladys.setConnectionStatus(true);
  } catch (err) {
    logger.error('Post-connection initialization failed', err);
    await gladys
      .setConnectionStatus(false, {
        en: 'Initialization failed, check the integration logs.',
        fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
      })
      .catch(() => {});
  }
});

// --- Graceful shutdown -------------------------------------------------------
gladys.handleShutdown(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }
  scheduler.stop();
});

// --- Startup -----------------------------------------------------------------
logger.info('Starting the ISS Overhead integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
