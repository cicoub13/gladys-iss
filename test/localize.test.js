import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localizePass, localizeWidgetPass, resolveLanguage } from '../src/localize.js';

// The container gets `TZ` from Gladys: the values follow it, not UTC.
process.env.TZ = 'Europe/Paris';

const pass = { startTime: new Date('2026-09-28T17:49:55.673Z'), direction: 'W' };

test('localizePass formats the date and time in French, in the local time zone', () => {
  assert.deepEqual(localizePass(pass, 'fr'), {
    start_date: 'lundi 28 septembre',
    start_hour: '19:49',
    direction_name: 'ouest',
  });
});

test('localizePass formats the date and time in English', () => {
  assert.deepEqual(localizePass(pass, 'en'), {
    start_date: 'Monday, September 28',
    start_hour: '07:49 PM',
    direction_name: 'west',
  });
});

test('localizePass names every compass point the predictor produces', () => {
  for (const direction of ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']) {
    for (const language of ['en', 'fr']) {
      assert.ok(localizePass({ ...pass, direction }, language).direction_name, `${direction} in ${language}`);
    }
  }
});

test('localizeWidgetPass gives a compact local date-time and compass point per language', () => {
  assert.deepEqual(localizeWidgetPass(pass, 'fr'), { when: '28/09 19:49', direction: 'O' });
  assert.deepEqual(localizeWidgetPass(pass, 'en'), { when: '09/28, 07:49 PM', direction: 'W' });
});

test('resolveLanguage falls back to English for an unsupported or missing language', () => {
  assert.equal(resolveLanguage('fr'), 'fr');
  assert.equal(resolveLanguage('de'), 'en');
  assert.equal(resolveLanguage(undefined), 'en');
});
