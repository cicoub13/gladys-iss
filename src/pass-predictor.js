// -----------------------------------------------------------------------------
// Pure ISS visible-pass prediction: TLE + observer + time window -> Pass[].
//
// No I/O here (no network, no Gladys SDK) so this file is fully unit-testable
// on its own. A pass is "visible" when, at the same instant:
//   1. the ISS is above the horizon (elevation >= minElevationDeg);
//   2. the observer's sky is dark enough (sun below minSunAltitudeDeg);
//   3. the ISS itself is still lit by the sun (not inside Earth's shadow).
//
// Condition 3 needs the Sun's own position, which `suncalc` does not give (it
// only answers "where is the Sun as seen FROM a point on Earth's surface", not
// "is a point in orbit inside Earth's shadow"). `sunPositionEci` below is the
// low-precision Sun position formula from the Astronomical Almanac (~0.01°
// accuracy, geocentric equatorial, J2000-ish) — more than enough for a binary
// shadow test against Earth's radius, and `isSatelliteSunlit` is the standard
// cylindrical (no penumbra) Earth-shadow model used by amateur satellite
// trackers.
//
// Sampling is coarse (stepSeconds, default 10s): a pass boundary and its max
// elevation are only accurate to about one step. That is enough for a "go look
// outside" automation (which already adds a lead time before firing), and
// keeps this module simple — no sub-step refinement.
// -----------------------------------------------------------------------------

import * as satellite from 'satellite.js';
import SunCalc from 'suncalc';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const EARTH_RADIUS_KM = 6371;
const ASTRONOMICAL_UNIT_KM = 149597870.7;
const UNIX_EPOCH_JULIAN_DATE = 2440587.5;
const MILLISECONDS_PER_DAY = 86400000;

const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

const DEFAULT_MIN_ELEVATION_DEG = 10;
const DEFAULT_MIN_SUN_ALTITUDE_DEG = -6;
const DEFAULT_STEP_SECONDS = 10;

function normalizeDegrees(degrees) {
  return ((degrees % 360) + 360) % 360;
}

/**
 * Map an azimuth to the nearest of the 8 compass points.
 * @param {number} azimuthDeg - Azimuth in degrees (0 = North, clockwise).
 * @returns {'N'|'NE'|'E'|'SE'|'S'|'SW'|'W'|'NW'} The nearest compass point.
 * @example
 * compassFromAzimuth(313); // 'NW'
 */
export function compassFromAzimuth(azimuthDeg) {
  const index = Math.round(normalizeDegrees(azimuthDeg) / 45) % 8;
  return COMPASS_POINTS[index];
}

function julianDate(date) {
  return date.getTime() / MILLISECONDS_PER_DAY + UNIX_EPOCH_JULIAN_DATE;
}

/**
 * Low-precision Sun position (Astronomical Almanac formula, ~0.01° accuracy),
 * in geocentric equatorial coordinates (km) — close enough to the ECI/TEME
 * frame satellite.js works in for a binary Earth-shadow test.
 * @param {Date} date - The instant to compute the Sun's position for.
 * @returns {{x: number, y: number, z: number}} Sun position in km.
 * @example
 * sunPositionEci(new Date('2026-06-21T00:00:00Z'));
 */
export function sunPositionEci(date) {
  const daysSinceJ2000 = julianDate(date) - 2451545.0;
  const meanLongitudeDeg = normalizeDegrees(280.46 + 0.9856474 * daysSinceJ2000);
  const meanAnomalyDeg = normalizeDegrees(357.528 + 0.9856003 * daysSinceJ2000);
  const meanAnomalyRad = meanAnomalyDeg * DEG2RAD;

  const eclipticLongitudeRad =
    (meanLongitudeDeg + 1.915 * Math.sin(meanAnomalyRad) + 0.02 * Math.sin(2 * meanAnomalyRad)) * DEG2RAD;
  const obliquityRad = (23.439 - 0.0000004 * daysSinceJ2000) * DEG2RAD;
  const distanceKm =
    (1.00014 - 0.01671 * Math.cos(meanAnomalyRad) - 0.00014 * Math.cos(2 * meanAnomalyRad)) * ASTRONOMICAL_UNIT_KM;

  return {
    x: distanceKm * Math.cos(eclipticLongitudeRad),
    y: distanceKm * Math.sin(eclipticLongitudeRad) * Math.cos(obliquityRad),
    z: distanceKm * Math.sin(eclipticLongitudeRad) * Math.sin(obliquityRad),
  };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/**
 * Cylindrical (no penumbra) Earth-shadow test: is a point in orbit still lit
 * by the Sun, or hidden behind Earth?
 * @param {{x: number, y: number, z: number}} satelliteEci - Satellite position, km.
 * @param {{x: number, y: number, z: number}} sunEci - Sun position, km, same frame.
 * @returns {boolean} True when the satellite is sunlit.
 * @example
 * isSatelliteSunlit({ x: 6771, y: 0, z: 0 }, { x: 1.5e8, y: 0, z: 0 }); // true
 */
export function isSatelliteSunlit(satelliteEci, sunEci) {
  const sunDistance = Math.sqrt(dot(sunEci, sunEci));
  const sunUnit = { x: sunEci.x / sunDistance, y: sunEci.y / sunDistance, z: sunEci.z / sunDistance };

  // Component of the satellite's position along the Earth-Sun direction: a
  // positive value means the satellite is on the sunward side of Earth's
  // center, where Earth's shadow cannot reach it.
  const along = dot(satelliteEci, sunUnit);
  if (along > 0) {
    return true;
  }

  // On the night side: sunlit only if far enough from the Earth-Sun axis to
  // clear Earth's shadow cylinder.
  const satDistanceSquared = dot(satelliteEci, satelliteEci);
  const perpendicularDistance = Math.sqrt(Math.max(satDistanceSquared - along * along, 0));
  return perpendicularDistance > EARTH_RADIUS_KM;
}

/**
 * @typedef {object} Pass
 * @property {Date} startTime
 * @property {Date} endTime
 * @property {Date} maxElevationTime
 * @property {number} maxElevationDeg
 * @property {number} startAzimuthDeg
 * @property {number} maxAzimuthDeg
 * @property {number} endAzimuthDeg
 * @property {'N'|'NE'|'E'|'SE'|'S'|'SW'|'W'|'NW'} direction - Compass point the pass rises from.
 * @property {number} durationSeconds
 */

/**
 * Predict visible ISS passes over an observer within a time window.
 * @param {{line1: string, line2: string}} tle - The two TLE lines.
 * @param {{latitude: number, longitude: number}} observer - Observer location, degrees.
 * @param {{start: Date, end: Date, stepSeconds?: number}} window - Prediction window.
 * @param {{minElevationDeg?: number, minSunAltitudeDeg?: number}} [options] - Visibility thresholds.
 * @returns {Pass[]} Visible passes, chronologically ordered.
 * @example
 * findVisiblePasses(tle, { latitude: 48.85, longitude: 2.35 }, { start: new Date(), end: nextWeek });
 */
export function findVisiblePasses(tle, observer, window, options = {}) {
  const minElevationDeg = options.minElevationDeg ?? DEFAULT_MIN_ELEVATION_DEG;
  const minSunAltitudeDeg = options.minSunAltitudeDeg ?? DEFAULT_MIN_SUN_ALTITUDE_DEG;
  const stepMs = (window.stepSeconds ?? DEFAULT_STEP_SECONDS) * 1000;

  const satrec = satellite.twoline2satrec(tle.line1, tle.line2);
  const observerGd = {
    longitude: observer.longitude * DEG2RAD,
    latitude: observer.latitude * DEG2RAD,
    height: 0,
  };

  const samples = [];
  for (let time = window.start.getTime(); time <= window.end.getTime(); time += stepMs) {
    const date = new Date(time);
    const positionAndVelocity = satellite.propagate(satrec, date);
    if (!positionAndVelocity || !positionAndVelocity.position) {
      // Propagation failure (e.g. a decayed/invalid TLE): skip this instant.
      continue;
    }

    const positionEci = positionAndVelocity.position;
    const gmst = satellite.gstime(date);
    const positionEcf = satellite.eciToEcf(positionEci, gmst);
    const lookAngles = satellite.ecfToLookAngles(observerGd, positionEcf);
    const elevationDeg = lookAngles.elevation * RAD2DEG;
    const azimuthDeg = lookAngles.azimuth * RAD2DEG;

    const sunAltitudeDeg = SunCalc.getPosition(date, observer.latitude, observer.longitude).altitude * RAD2DEG;
    const observerIsDark = sunAltitudeDeg <= minSunAltitudeDeg;
    const satelliteIsSunlit = isSatelliteSunlit(positionEci, sunPositionEci(date));

    samples.push({
      date,
      elevationDeg,
      azimuthDeg,
      visible: elevationDeg >= minElevationDeg && observerIsDark && satelliteIsSunlit,
    });
  }

  const passes = [];
  let run = [];
  for (const sample of samples) {
    if (sample.visible) {
      run.push(sample);
      continue;
    }
    if (run.length > 0) {
      passes.push(buildPass(run));
      run = [];
    }
  }
  if (run.length > 0) {
    passes.push(buildPass(run));
  }

  return passes;
}

function buildPass(run) {
  const peak = run.reduce((best, sample) => (sample.elevationDeg > best.elevationDeg ? sample : best));
  const first = run[0];
  const last = run[run.length - 1];

  return {
    startTime: first.date,
    endTime: last.date,
    maxElevationTime: peak.date,
    maxElevationDeg: peak.elevationDeg,
    startAzimuthDeg: normalizeDegrees(first.azimuthDeg),
    maxAzimuthDeg: normalizeDegrees(peak.azimuthDeg),
    endAzimuthDeg: normalizeDegrees(last.azimuthDeg),
    direction: compassFromAzimuth(first.azimuthDeg),
    durationSeconds: Math.round((last.date.getTime() - first.date.getTime()) / 1000),
  };
}
