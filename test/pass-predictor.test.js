import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compassFromAzimuth, sunPositionEci, isSatelliteSunlit, findVisiblePasses } from '../src/pass-predictor.js';
import { ISS_TLE, PARIS_OBSERVER } from '../fixtures/tle-samples.js';

const EARTH_RADIUS_KM = 6371;
const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

test('compassFromAzimuth maps every cardinal/intercardinal exactly', () => {
  assert.equal(compassFromAzimuth(0), 'N');
  assert.equal(compassFromAzimuth(45), 'NE');
  assert.equal(compassFromAzimuth(90), 'E');
  assert.equal(compassFromAzimuth(135), 'SE');
  assert.equal(compassFromAzimuth(180), 'S');
  assert.equal(compassFromAzimuth(225), 'SW');
  assert.equal(compassFromAzimuth(270), 'W');
  assert.equal(compassFromAzimuth(315), 'NW');
});

test('compassFromAzimuth wraps around 360 back to N', () => {
  assert.equal(compassFromAzimuth(359), 'N');
  assert.equal(compassFromAzimuth(360), 'N');
  assert.equal(compassFromAzimuth(-10), 'N');
});

test('sunPositionEci returns a vector at roughly 1 AU', () => {
  const { x, y, z } = sunPositionEci(new Date('2026-03-20T00:00:00Z'));
  const distanceKm = Math.sqrt(x * x + y * y + z * z);
  const oneAuKm = 149597870.7;
  assert.ok(Math.abs(distanceKm - oneAuKm) / oneAuKm < 0.02, 'distance should be within 2% of 1 AU');
});

test('sunPositionEci gives a positive declination near the June solstice', () => {
  const { x, y, z } = sunPositionEci(new Date('2026-06-21T00:00:00Z'));
  const declinationDeg = Math.asin(z / Math.sqrt(x * x + y * y + z * z)) * (180 / Math.PI);
  assert.ok(declinationDeg > 20, `expected declination > 20deg near June solstice, got ${declinationDeg}`);
});

test('sunPositionEci gives a negative declination near the December solstice', () => {
  const { x, y, z } = sunPositionEci(new Date('2026-12-21T00:00:00Z'));
  const declinationDeg = Math.asin(z / Math.sqrt(x * x + y * y + z * z)) * (180 / Math.PI);
  assert.ok(declinationDeg < -20, `expected declination < -20deg near December solstice, got ${declinationDeg}`);
});

test('sunPositionEci gives a near-zero declination at the equinox', () => {
  const { x, y, z } = sunPositionEci(new Date('2026-03-20T09:00:00Z'));
  const declinationDeg = Math.asin(z / Math.sqrt(x * x + y * y + z * z)) * (180 / Math.PI);
  assert.ok(Math.abs(declinationDeg) < 1, `expected declination near 0deg at equinox, got ${declinationDeg}`);
});

test('isSatelliteSunlit is true when the satellite is on the sunward side of Earth', () => {
  const satEci = { x: EARTH_RADIUS_KM + 400, y: 0, z: 0 };
  const sunEci = { x: 1.5e8, y: 0, z: 0 };
  assert.equal(isSatelliteSunlit(satEci, sunEci), true);
});

test('isSatelliteSunlit is false deep inside Earth-s cylindrical shadow', () => {
  const satEci = { x: -(EARTH_RADIUS_KM + 400), y: 0, z: 0 };
  const sunEci = { x: 1.5e8, y: 0, z: 0 };
  assert.equal(isSatelliteSunlit(satEci, sunEci), false);
});

test('isSatelliteSunlit is true on the night side but far enough off-axis to clear the shadow', () => {
  const satEci = { x: -100, y: EARTH_RADIUS_KM + 1000, z: 0 };
  const sunEci = { x: 1.5e8, y: 0, z: 0 };
  assert.equal(isSatelliteSunlit(satEci, sunEci), true);
});

test('findVisiblePasses returns chronologically ordered, non-overlapping, well-formed passes', () => {
  const window = { start: new Date(), end: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000), stepSeconds: 10 };
  const passes = findVisiblePasses(ISS_TLE, PARIS_OBSERVER, window, { minElevationDeg: 10 });

  assert.ok(Array.isArray(passes));
  assert.ok(passes.length > 0, 'expected at least one visible pass over 4 days for a mid-latitude city');

  for (const [index, pass] of passes.entries()) {
    assert.ok(pass.endTime.getTime() >= pass.startTime.getTime());
    assert.ok(pass.maxElevationTime.getTime() >= pass.startTime.getTime());
    assert.ok(pass.maxElevationTime.getTime() <= pass.endTime.getTime());
    assert.ok(pass.maxElevationDeg >= 10 && pass.maxElevationDeg <= 90);
    assert.ok(COMPASS_POINTS.includes(pass.direction));
    assert.equal(pass.durationSeconds, Math.round((pass.endTime.getTime() - pass.startTime.getTime()) / 1000));
    for (const azimuth of [pass.startAzimuthDeg, pass.maxAzimuthDeg, pass.endAzimuthDeg]) {
      assert.ok(azimuth >= 0 && azimuth < 360);
    }
    assert.ok(pass.startTime.getTime() >= window.start.getTime());
    assert.ok(pass.endTime.getTime() <= window.end.getTime());

    if (index > 0) {
      assert.ok(
        pass.startTime.getTime() >= passes[index - 1].endTime.getTime(),
        'passes must not overlap and must be chronologically ordered',
      );
    }
  }
});

test('findVisiblePasses respects a stricter minElevationDeg', () => {
  const window = { start: new Date(), end: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000), stepSeconds: 10 };
  const lenient = findVisiblePasses(ISS_TLE, PARIS_OBSERVER, window, { minElevationDeg: 10 });
  const strict = findVisiblePasses(ISS_TLE, PARIS_OBSERVER, window, { minElevationDeg: 60 });

  assert.ok(strict.length <= lenient.length);
  for (const pass of strict) {
    assert.ok(pass.maxElevationDeg >= 60);
  }
});
