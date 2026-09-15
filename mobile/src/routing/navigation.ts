/**
 * Turn-by-turn live navigation logic: given the user's current position and
 * an active route, figures out which maneuver is "next," how far away it
 * is, and when to advance to the following one. No map-matching — distance
 * is straight-line (haversine) from the live GPS fix to the upcoming
 * maneuver's start coordinate, not distance-along-the-road. That's a
 * deliberate v1 simplification (see mobile/README.md): close enough for a
 * "turn in 300m" banner, not precise enough for real off-route detection,
 * which this doesn't attempt.
 */

import type { RouteManeuver, RouteResult } from './api';

/** Once you're this close to a maneuver's start coordinate, consider it
 * "reached" and advance to counting down to the next one. 30m comfortably
 * covers normal GPS drift without skipping a maneuver early. */
export const MANEUVER_ARRIVAL_THRESHOLD_KM = 0.03;

/** Valhalla's maneuver type codes → a single glyph for the nav banner. Not
 * every code Valhalla defines is listed (transit-specific ones don't apply
 * to car/foot/bike routing, which is all this app does) — anything unlisted
 * falls back to a plain straight-ahead arrow rather than showing nothing. */
const MANEUVER_ICONS: Record<number, string> = {
  1: '🚦', // start
  2: '🚦', // start right
  3: '🚦', // start left
  4: '🏁', // destination
  5: '🏁', // destination right
  6: '🏁', // destination left
  7: '↑', // becomes (road name changes, same direction)
  8: '↑', // continue
  9: '↗', // slight right
  10: '↱', // right
  11: '⤴', // sharp right
  12: '↩', // uturn right
  13: '↩', // uturn left
  14: '⤵', // sharp left
  15: '↰', // left
  16: '↖', // slight left
  17: '↑', // ramp straight
  18: '↱', // ramp right
  19: '↰', // ramp left
  20: '↱', // exit right
  21: '↰', // exit left
  22: '↑', // stay straight
  23: '↗', // stay right
  24: '↖', // stay left
  25: '↑', // merge
  26: '🔄', // roundabout enter
  27: '🔄', // roundabout exit
  28: '⛴️', // ferry enter
  29: '↑', // ferry exit
};

export function maneuverIcon(type: number): string {
  return MANEUVER_ICONS[type] ?? '↑';
}

export type UpcomingManeuver = {
  /** Index into route.maneuvers of the maneuver being counted down to. */
  index: number;
  maneuver: RouteManeuver;
  distanceToManeuverKm: number;
};

/** Great-circle distance in km — duplicated from src/categories/categories.ts
 * rather than imported, since routing and categories are otherwise
 * independent leaf modules and this is a two-line formula. */
function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * `currentManeuverIndex` is "the maneuver whose instruction you've already
 * acted on" — the upcoming one being counted down to is always the next
 * index. Returns null once there's nothing left to count down to (you've
 * advanced past the final maneuver, i.e. arrived).
 */
export function getUpcomingManeuver(
  route: RouteResult,
  currentManeuverIndex: number,
  position: { lat: number; lon: number },
): UpcomingManeuver | null {
  const nextIndex = currentManeuverIndex + 1;
  const maneuver = route.maneuvers[nextIndex];
  if (!maneuver) return null;

  const [lon, lat] = route.geometry.coordinates[maneuver.beginShapeIndex];
  const distanceToManeuverKm = haversineKm(position, { lat, lon });
  return { index: nextIndex, maneuver, distanceToManeuverKm };
}

const METERS_PER_SECOND_TO_MPH = 2.2369362920544;

/**
 * The device's own GPS-derived speed (m/s, from `useCurrentPosition`'s
 * `coords.speed` — CoreLocation under the hood on iOS), converted to mph —
 * this app's live speedometer during navigation. mph, not km/h: confirmed
 * Belize itself posts speed limits and road signage in mph despite being
 * otherwise metric (a common holdover in former British territories) — the
 * live reading should match what's actually on the road signs, not what the
 * rest of this app's distance fields happen to use.
 *
 * Returns null for a genuinely unavailable reading — CoreLocation's own
 * documented convention is a negative value (typically -1) when speed can't
 * be determined (no recent fix, poor accuracy, a device that doesn't report
 * it), so this treats any negative input the same way rather than showing a
 * nonsense negative speed.
 */
export function gpsSpeedToMph(metersPerSecond: number | null | undefined): number | null {
  // NaN fails both checks above it (`NaN == null` and `NaN < 0` are both
  // false), so it needs its own guard — found in review: without this, a
  // malformed reading would render as the literal text "NaN mph" instead
  // of being hidden like any other unavailable reading.
  if (metersPerSecond == null || Number.isNaN(metersPerSecond) || metersPerSecond < 0) return null;
  return metersPerSecond * METERS_PER_SECOND_TO_MPH;
}

/** Sum of the not-yet-completed maneuvers' own lengths/times — a reasonable
 * approximation of what's left, updating in discrete steps as each maneuver
 * completes rather than continuously along the road (same v1 simplification
 * as the distance-to-next-turn calculation above). */
export function getRemainingTrip(
  route: RouteResult,
  currentManeuverIndex: number,
): { distanceKm: number; durationMin: number } {
  const remaining = route.maneuvers.slice(currentManeuverIndex + 1);
  return {
    distanceKm: remaining.reduce((sum, m) => sum + m.distanceKm, 0),
    durationMin: remaining.reduce((sum, m) => sum + m.durationSec, 0) / 60,
  };
}
