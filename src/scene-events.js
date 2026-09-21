// -----------------------------------------------------------------------------
// `pass_starting` scene trigger: scheduling, and the event payload handed to
// the SDK's `publishSceneEvent`.
// -----------------------------------------------------------------------------

// The trigger this event fires, as declared in the manifest `scene_triggers`.
export const SCENE_TRIGGER_KEY = 'pass_starting';

// A little time to actually step outside once the trigger fires.
export const DEFAULT_LEAD_TIME_MS = 90 * 1000;

/**
 * Build the `data` object for the `pass_starting` scene event. Includes every
 * key declared in the manifest's `fields` (filters) and `variables` for this
 * trigger — here `direction` is declared in both, and sent once.
 * @param {import('./pass-predictor.js').Pass} pass - The pass about to start.
 * @returns {{direction: string, start_time: string, max_elevation_deg: number, duration_seconds: number}} The event data.
 * @example
 * buildPassStartingEventData(pass);
 */
export function buildPassStartingEventData(pass) {
  return {
    direction: pass.direction,
    start_time: pass.startTime.toISOString(),
    max_elevation_deg: Math.round(pass.maxElevationDeg),
    duration_seconds: pass.durationSeconds,
  };
}

/**
 * Schedules `onTrigger` to fire shortly before each upcoming pass starts.
 *
 * `reschedule` fully replaces the schedule every time it is called (clears
 * every pending timer, then sets one per still-future pass) — the simplest
 * way to avoid double-firing or stale entries across recomputes, at the cost
 * of no persistence across a process restart (acceptable: a restart also
 * recomputes the pass list from scratch before rescheduling).
 */
export class PassScheduler {
  /**
   * @param {object} deps
   * @param {(pass: import('./pass-predictor.js').Pass) => void} deps.onTrigger - Called when a pass is about to start.
   * @param {number} [deps.leadTimeMs] - How long before the pass start to fire.
   * @param {() => Date} [deps.now] - Injectable clock, for tests.
   * @param {typeof setTimeout} [deps.setTimer] - Injectable timer, for tests.
   * @param {typeof clearTimeout} [deps.clearTimer] - Injectable timer, for tests.
   */
  constructor({
    onTrigger,
    leadTimeMs = DEFAULT_LEAD_TIME_MS,
    now = () => new Date(),
    setTimer = setTimeout,
    clearTimer = clearTimeout,
  }) {
    this.onTrigger = onTrigger;
    this.leadTimeMs = leadTimeMs;
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.timers = [];
  }

  /**
   * Replace the schedule with one timer per still-future pass.
   * @param {import('./pass-predictor.js').Pass[]} passes - The freshly (re)computed passes.
   * @returns {void}
   * @example
   * scheduler.reschedule(passes);
   */
  reschedule(passes) {
    this.stop();
    const nowMs = this.now().getTime();
    for (const pass of passes) {
      const delay = pass.startTime.getTime() - this.leadTimeMs - nowMs;
      if (delay <= 0) {
        // Already inside the lead-time window (or past): do not fire late.
        continue;
      }
      this.timers.push(
        this.setTimer(() => {
          this.onTrigger(pass);
        }, delay),
      );
    }
  }

  /**
   * Cancel every pending timer.
   * @returns {void}
   * @example
   * scheduler.stop();
   */
  stop() {
    for (const timer of this.timers) {
      this.clearTimer(timer);
    }
    this.timers = [];
  }
}
