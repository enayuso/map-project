/**
 * Pure date-range logic for the seasonal-highlights layer (see
 * sharing/data/seasonal_highlights.json and docs/research/13-belize-
 * seasonal-highlights-sourcing.md) — a Belize-specific analog of Kakao
 * Map's own cherry-blossom seasonal layer, which shows each spot's status
 * as a simple 3-stage indicator (pre-bloom / starting / full bloom) rather
 * than just a date range. `seasonStatus()` is that same 3-stage idea,
 * generalized: `active` (today falls inside the highlighted window),
 * `upcoming` (within UPCOMING_WINDOW_DAYS of starting — Kakao shows
 * pre-bloom spots a couple of weeks ahead, not just the day bloom starts),
 * or `off-season` (neither).
 *
 * A month/day window (not a fixed year) since these are recurring annual
 * seasons — `startMonth > endMonth` means the window wraps across the new
 * year (e.g. a Nov-Feb season). None of the current seasonal_highlights.json
 * entries happen to wrap, but the logic handles it correctly regardless
 * (and is tested against a wrapping case below), since a future entry
 * easily could.
 *
 * Deliberately NOT trying to compute real moon phases for the whale-shark
 * entry (whose actual mechanism is tied to the full moon, not a fixed
 * calendar window) — see docs/research/13's own note on why this is
 * intentionally shown as a broad month window instead. Adding real lunar
 * calculation would be a meaningfully bigger, riskier piece of astronomy
 * code for a "curated content" feature that's supposed to stay simple,
 * hand-maintained JSON like every other entry in this file.
 */

export type SeasonWindow = {
  startMonth: number; // 1-12
  startDay: number; // 1-31
  endMonth: number;
  endDay: number;
};

export type SeasonStatus = 'active' | 'upcoming' | 'off-season';

// How many days ahead of a window's start counts as "upcoming" rather than
// plain "off-season" — matches Kakao's own cherry-blossom pattern of
// surfacing a pre-bloom spot a couple of weeks ahead of the actual date,
// not just the single day it starts.
const UPCOMING_WINDOW_DAYS = 21;

/**
 * Day-of-year for a given month/day, evaluated against `year` specifically
 * so the same UTC-midnight arithmetic is used throughout (avoids any
 * local-timezone drift between the two dates being compared). A Feb 29
 * requested against a non-leap `year` silently normalizes to Mar 1 via
 * `Date.UTC`'s own overflow behavior — a harmless one-day imprecision for
 * a once-a-year seasonal boundary, not worth guarding against separately.
 */
function dayOfYear(month: number, day: number, year: number): number {
  return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / 86400000);
}

export function seasonStatus(window: SeasonWindow, now: Date = new Date()): SeasonStatus {
  const year = now.getUTCFullYear();
  const today = dayOfYear(now.getUTCMonth() + 1, now.getUTCDate(), year);
  const start = dayOfYear(window.startMonth, window.startDay, year);
  const end = dayOfYear(window.endMonth, window.endDay, year);

  const wraps = start > end;
  const inRange = wraps ? today >= start || today <= end : today >= start && today <= end;
  if (inRange) return 'active';

  // Days until this year's (or, if already passed, next year's) start —
  // wrapping forward by a full year rather than treating "start already
  // happened" as "very far away," so late-December still correctly reads
  // as far from a mid-March start next year, not "21 days away" by some
  // stray negative-number coincidence.
  let daysUntilStart = start - today;
  if (daysUntilStart < 0) daysUntilStart += 365;
  return daysUntilStart <= UPCOMING_WINDOW_DAYS ? 'upcoming' : 'off-season';
}
