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

// Belize is a fixed UTC-6 year-round — it does not observe daylight saving
// time (confirmed: no DST transitions in Belize's tz database entry). Found
// during a review pass: this file originally read `now`'s calendar date via
// getUTC*() directly, which is wrong for a genuinely Belize-only feature —
// for roughly 6 hours every evening (6pm-midnight Belize time), the UTC
// calendar date has already rolled over to the next day, so a season's
// last evening could report "off-season" hours early, and the same for a
// season about to start. Using the *device's* local timezone instead would
// be equally wrong in a different way — this app's whole audience is
// "in or planning a trip to Belize," not "wherever this particular phone's
// clock happens to be set," which matters directly for testing too (this
// project's own dev Simulator runs on Korea time, UTC+9, 15 hours off).
// Fixing this by shifting the instant by the fixed offset and reading its
// UTC calendar fields is the standard fixed-offset-timezone trick, and is
// exact here specifically because Belize has no DST to account for.
const BELIZE_UTC_OFFSET_MS = -6 * 60 * 60 * 1000;

function belizeNow(now: Date): Date {
  return new Date(now.getTime() + BELIZE_UTC_OFFSET_MS);
}

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
  const belize = belizeNow(now);
  const year = belize.getUTCFullYear();
  const todayMonth = belize.getUTCMonth() + 1;
  const todayDay = belize.getUTCDate();
  // Midnight (UTC-representation) of today, in the same shifted "Belize
  // calendar" frame as `belize` itself — used below for whole-day epoch
  // arithmetic, deliberately not `belize.getTime()` directly, which still
  // carries today's own time-of-day and would make the next-year gap a
  // fraction of a day off depending on what time it currently is.
  const todayMidnightMs = Date.UTC(year, todayMonth - 1, todayDay);
  const today = dayOfYear(todayMonth, todayDay, year);
  const start = dayOfYear(window.startMonth, window.startDay, year);
  const end = dayOfYear(window.endMonth, window.endDay, year);

  const wraps = start > end;
  const inRange = wraps ? today >= start || today <= end : today >= start && today <= end;
  if (inRange) return 'active';

  // Days until this year's (or, if already passed, next year's) start —
  // wrapping forward to next year's actual occurrence rather than treating
  // "start already happened" as "very far away," so late-December still
  // correctly reads as far from a mid-March start next year, not "21 days
  // away" by some stray negative-number coincidence. Found in review: an
  // earlier version added a flat `+= 365` here, which is off by one for
  // any today-to-next-start gap that spans a Feb 29 (25% of years) —
  // computed via real epoch-millisecond arithmetic against `year + 1`
  // instead, which sidesteps the whole leap-year question rather than
  // special-casing it (`Date.UTC` already knows how many days are in any
  // given year).
  const daysUntilStart =
    start >= today
      ? start - today
      : Math.round((Date.UTC(year + 1, window.startMonth - 1, window.startDay) - todayMidnightMs) / 86400000);
  return daysUntilStart <= UPCOMING_WINDOW_DAYS ? 'upcoming' : 'off-season';
}
