// -----------------------------------------------------------------------------
// Entry point of the ISS Overhead external integration for Gladys Assistant.
//
// This file only wires the SDK to the ISS logic (src/): it holds no orbital
// math or widget/scene shaping itself. It:
//   1. instantiates the SDK (connection, auth, reconnection: handled for you);
//   2. registers the widget and scene-action handlers (once, at startup: the
//      SDK keys them by name and re-serves them across reconnections);
//   3. loads/refreshes the ISS TLE and (re)computes the visible passes;
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
import { buildWidgetContent, WIDGET_KEY, ISS_IMAGE_KEY } from './src/widget-content.js';
import { buildNextPassOutput, SCENE_ACTION_KEY } from './src/scene-actions.js';
import { PassScheduler, buildPassStartingEventData, SCENE_TRIGGER_KEY } from './src/scene-events.js';

const TLE_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
const ISS_IMAGE_PATH = new URL('./assets/iss-photo.jpg', import.meta.url);

// Cached on first request: the photo is a static asset, never changes, so its
// image_key never needs to either (section 6: "when the bytes change, the key
// changes" — ours simply never do).
let issImageBase64 = null;

const gladys = new GladysIntegration();
const tleSource = new TleSource();

let config = normalizeConfig();
let house = null;
let passes = [];

const scheduler = new PassScheduler({
  onTrigger: async (pass) => {
    try {
      await gladys.publishSceneEvent(SCENE_TRIGGER_KEY, buildPassStartingEventData(pass));
    } catch (err) {
      logger.error(`Failed to fire the ${SCENE_TRIGGER_KEY} scene event`, err);
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
  // `location: true` in the manifest is what grants this call (403 otherwise).
  const houses = await gladys.getHouses();
  // MVP simplification: a single house with usable coordinates. Multi-house
  // support (a widget setting to pick one) is left for a later version.
  const candidate = houses.find((entry) => entry.latitude != null && entry.longitude != null);
  if (!candidate) {
    throw new Error('No house with a known location');
  }
  return { latitude: candidate.latitude, longitude: candidate.longitude };
}

// --- Capabilities ------------------------------------------------------------
// Registered once, before connecting: the SDK stores them by key and keeps
// answering with them across reconnections.

gladys.onWidgetGet(WIDGET_KEY, () => buildWidgetContent(passes, { tleStale: tleSource.isStale() }));

gladys.onWidgetGetImage(async (imageKey) => {
  if (imageKey !== ISS_IMAGE_KEY) {
    throw new Error(`Unknown image key: ${imageKey}`);
  }
  if (!issImageBase64) {
    issImageBase64 = (await readFile(ISS_IMAGE_PATH)).toString('base64');
  }
  return issImageBase64;
});

gladys.onSceneAction(SCENE_ACTION_KEY, () => buildNextPassOutput(passes));

// --- Configuration updated by the user ---------------------------------------
gladys.onConfigUpdated(async (newConfig) => {
  logger.info('onConfigUpdated -> new configuration received');
  try {
    config = normalizeConfig(newConfig);
    recomputePasses();
    // The passes just changed under every open dashboard: nudge them instead
    // of letting the card sit on stale content until its TTL expires.
    gladys.requestWidgetRefresh(WIDGET_KEY);
  } catch (err) {
    logger.error('Could not apply the new configuration, keeping the previous one', err);
  }
});

// --- Connection lifecycle ----------------------------------------------------
gladys.on('connected', async () => {
  try {
    config = normalizeConfig(await gladys.getConfig());
    // Coordinates have no update event: re-fetch them on every reconnection.
    house = await fetchHouse();
    await ensureTle();
    recomputePasses();

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
