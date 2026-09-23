// -----------------------------------------------------------------------------
// A real ISS TLE (fetched from Celestrak on 2026-09-19) for property-based
// tests of pass-predictor.js. A TLE is only accurate for a few days around its
// own epoch (2026, day-of-year ~261.79, i.e. 2026-09-18) — tests pin their
// prediction windows next to that epoch (never `new Date()`), so the results
// do not depend on the day the suite runs. Refreshing this TLE means moving
// those pinned windows too.
// -----------------------------------------------------------------------------

export const ISS_TLE = {
  line1: '1 25544U 98067A   26261.78789299  .00005868  00000+0  11393-3 0  9992',
  line2: '2 25544  51.6308 196.8438 0004827 155.1807 204.9414 15.49168087586262',
};

// A well-known mid-latitude city, used as a generic (non-personal) test
// observer location.
export const PARIS_OBSERVER = { latitude: 48.8566, longitude: 2.3522 };
