import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassScheduler, buildPassStartingEventData, DEFAULT_LEAD_TIME_MS } from '../src/scene-events.js';

function makePass(startTime) {
  return {
    startTime,
    endTime: new Date(startTime.getTime() + 5 * 60 * 1000),
    maxElevationTime: new Date(startTime.getTime() + 2 * 60 * 1000),
    maxElevationDeg: 42,
    startAzimuthDeg: 315,
    maxAzimuthDeg: 0,
    endAzimuthDeg: 90,
    direction: 'NW',
    durationSeconds: 300,
  };
}

function fakeTimers() {
  let nextId = 1;
  const pending = new Map();
  return {
    setTimer: (fn, delay) => {
      const id = nextId++;
      pending.set(id, { fn, delay });
      return id;
    },
    clearTimer: (id) => {
      pending.delete(id);
    },
    pending,
  };
}

test('buildPassStartingEventData includes direction, start_time, max_elevation_deg, duration_seconds', () => {
  const pass = makePass(new Date('2026-09-20T20:00:00Z'));
  const data = buildPassStartingEventData(pass);

  assert.deepEqual(data, {
    direction: 'NW',
    start_time: '2026-09-20T20:00:00.000Z',
    max_elevation_deg: 42,
    duration_seconds: 300,
  });
});

test('PassScheduler schedules one timer per still-future pass, with the lead time subtracted', () => {
  const now = new Date('2026-09-20T19:00:00Z');
  const { setTimer, clearTimer, pending } = fakeTimers();
  const triggered = [];
  const scheduler = new PassScheduler({
    onTrigger: (pass) => triggered.push(pass),
    now: () => now,
    setTimer,
    clearTimer,
  });

  const pass = makePass(new Date('2026-09-20T20:00:00Z'));
  scheduler.reschedule([pass]);

  assert.equal(pending.size, 1);
  const [{ delay }] = pending.values();
  assert.equal(delay, pass.startTime.getTime() - DEFAULT_LEAD_TIME_MS - now.getTime());
});

test('PassScheduler does not schedule a pass whose lead-time window has already passed', () => {
  const now = new Date('2026-09-20T19:59:50Z'); // within DEFAULT_LEAD_TIME_MS of the pass start
  const { setTimer, clearTimer, pending } = fakeTimers();
  const scheduler = new PassScheduler({ onTrigger: () => {}, now: () => now, setTimer, clearTimer });

  scheduler.reschedule([makePass(new Date('2026-09-20T20:00:00Z'))]);

  assert.equal(pending.size, 0);
});

test('PassScheduler.reschedule clears every previously pending timer', () => {
  const now = new Date('2026-09-20T19:00:00Z');
  const { setTimer, clearTimer, pending } = fakeTimers();
  const scheduler = new PassScheduler({ onTrigger: () => {}, now: () => now, setTimer, clearTimer });

  scheduler.reschedule([makePass(new Date('2026-09-20T20:00:00Z')), makePass(new Date('2026-09-21T20:00:00Z'))]);
  assert.equal(pending.size, 2);

  scheduler.reschedule([makePass(new Date('2026-09-22T20:00:00Z'))]);
  assert.equal(pending.size, 1);
});

test('PassScheduler.stop clears every pending timer and calls onTrigger for none of them', () => {
  const now = new Date('2026-09-20T19:00:00Z');
  const { setTimer, clearTimer, pending } = fakeTimers();
  const triggered = [];
  const scheduler = new PassScheduler({
    onTrigger: (pass) => triggered.push(pass),
    now: () => now,
    setTimer,
    clearTimer,
  });

  scheduler.reschedule([makePass(new Date('2026-09-20T20:00:00Z'))]);
  scheduler.stop();

  assert.equal(pending.size, 0);
  assert.equal(triggered.length, 0);
});

test('a scheduled timer firing calls onTrigger with the corresponding pass', () => {
  const now = new Date('2026-09-20T19:00:00Z');
  const { setTimer, clearTimer, pending } = fakeTimers();
  const triggered = [];
  const scheduler = new PassScheduler({
    onTrigger: (pass) => triggered.push(pass),
    now: () => now,
    setTimer,
    clearTimer,
  });

  const pass = makePass(new Date('2026-09-20T20:00:00Z'));
  scheduler.reschedule([pass]);

  for (const { fn } of pending.values()) {
    fn();
  }

  assert.equal(triggered.length, 1);
  assert.equal(triggered[0], pass);
});
