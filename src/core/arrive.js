/* ============================================================
 * arrive.js — the pure parts of "a suggestion at work" (opt-in, the Android app only; tested in tests/arrive.test.js).
 *
 * The user saves the spot they stand on as the workplace, with a radius. The Android app keeps it on the phone and
 * asks Android for a geofence (android/widgets/java/WorkGeo.java); when the phone stays inside it for a few minutes
 * the app shows a notification that suggests starting a shift, and when the phone leaves it while a shift runs, one
 * that suggests ending it. Nothing starts or ends by itself: someone may come to the workplace without working, and
 * the notification's button opens the app at ?action=start / ?action=stop, which asks once more (App.doAction).
 *
 * The spot never reaches this page, the app's database, the cloud, Sentry or the statistics: the page only learns
 * whether the feature is on and its radius. The decision below is the one WorkGeo.decide makes on the phone; the
 * test keeps the two in step (the same numbers, the same rules).
 *   - an arrival while a shift runs: no suggestion;
 *   - the same arrival twice (Android sends the stay again, or the phone stepped out and back within AWAY_MS): one;
 *   - leaving with no shift running: no suggestion; leaving again within LEAVE_GAP_MS (the edge of the circle): one;
 *   - between 23:00 and 06:00 (Moments.quietHour) it still comes, without sound or vibration: a night shift starts then.
 * The glue (the section in Settings, the messages with the Android app) is app/arrive.js.
 * ============================================================ */
(function (root) {
  'use strict';
  const MIN = 60000;
  /** The radii the user picks from, in metres (a geofence below ~100 m misses often, Android's own advice). */
  const RADII = [150, 300, 500];
  const DEFAULT_R = 300;
  /** Out of the circle at least this long before a new arrival counts as new. */
  const AWAY_MS = 30 * MIN;
  /** One "end the shift?" per this long at most (the phone may cross the edge a few times as it leaves). */
  const LEAVE_GAP_MS = 60 * MIN;
  /** How long the phone stays inside before it counts as an arrival (Android's loitering delay): passing by is not one. */
  const DWELL_MS = 5 * MIN;
  const PACKAGE = 'io.github.leelor123.shifts';
  const SCHEME = 'shaati-geo';

  const radius = (r) => (RADII.includes(+r) ? +r : DEFAULT_R);

  /**
   * What one crossing suggests: 'start', 'stop' or null.
   * s: { kind: 'in' | 'out', active, now, lastInNote, lastExit, lastOutNote } (times in ms, 0 = never).
   */
  function decide(s) {
    const now = +s.now || 0;
    if (s.kind === 'in') {
      if (s.active) return null;
      const lastIn = +s.lastInNote || 0, lastExit = +s.lastExit || 0;
      // a suggestion came for this stay already: never left since, or came back too soon to be a new arrival
      if (lastIn > 0 && (lastExit < lastIn || now - lastExit < AWAY_MS)) return null;
      return 'start';
    }
    if (s.kind === 'out') {
      if (!s.active) return null;
      const lastOut = +s.lastOutNote || 0;
      if (lastOut > 0 && now - lastOut < LEAVE_GAP_MS) return null;
      return 'stop';
    }
    return null;
  }

  /** The link that opens the Android app's own screen for saving the spot (WorkGeoActivity): it asks there, in the
   *  phone's own windows, first with the disclosure and then for the location permission. Only the radius rides in it. */
  const setupUrl = (r) => `intent://save?r=${radius(r)}#Intent;scheme=${SCHEME};package=${PACKAGE};end`;

  /** What the Android app's status message says ({"geo":1,"on":…,"r":…,"bg":…}), cleaned; anything else: null. A spot
   *  in it would be a mistake and is dropped (the page never holds one). */
  function readStatus(m) {
    if (!m || typeof m !== 'object' || m.geo !== 1) return null;
    return { on: m.on === true, r: radius(m.r), bg: m.bg === true, fg: m.fg === true };
  }

  root.Arrive = { RADII, DEFAULT_R, AWAY_MS, LEAVE_GAP_MS, DWELL_MS, PACKAGE, SCHEME, radius, decide, setupUrl, readStatus };
  if (typeof module !== 'undefined') module.exports = root.Arrive;
})(typeof window !== 'undefined' ? window : globalThis);
