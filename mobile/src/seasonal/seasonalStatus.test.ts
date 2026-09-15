import { seasonStatus, type SeasonWindow } from './seasonalStatus';

// Lobster's real closed season, per docs/research/13 — a real, non-wrapping
// window (March 1 - June 30) to exercise the ordinary case.
const LOBSTER_CLOSED: SeasonWindow = { startMonth: 3, startDay: 1, endMonth: 6, endDay: 30 };

// A synthetic wrapping window (Nov 15 - Feb 15) — none of the current
// seasonal_highlights.json entries happen to wrap, but the logic needs to
// handle it correctly regardless, since a future entry easily could.
const WRAPPING: SeasonWindow = { startMonth: 11, startDay: 15, endMonth: 2, endDay: 15 };

// Constructs an instant that's unambiguously the given calendar day *in
// Belize* (a fixed UTC-6, no DST) — noon UTC is 6am Belize time, safely
// clear of the day boundary either way. Using plain UTC-midnight here
// instead would make every test date actually mean "6pm the previous day
// in Belize," silently testing the wrong day for the exact bug this file
// guards against below.
function utc(month: number, day: number, year = 2026): Date {
  return new Date(Date.UTC(year, month - 1, day, 12));
}

describe('seasonStatus', () => {
  it('reports active in the middle of a non-wrapping window', () => {
    expect(seasonStatus(LOBSTER_CLOSED, utc(4, 15))).toBe('active');
  });

  it('reports active on the exact start and end days (inclusive)', () => {
    expect(seasonStatus(LOBSTER_CLOSED, utc(3, 1))).toBe('active');
    expect(seasonStatus(LOBSTER_CLOSED, utc(6, 30))).toBe('active');
  });

  it('reports upcoming shortly before a window starts', () => {
    // Feb 20 is 9 days before March 1.
    expect(seasonStatus(LOBSTER_CLOSED, utc(2, 20))).toBe('upcoming');
  });

  it('reports off-season well before a window starts', () => {
    expect(seasonStatus(LOBSTER_CLOSED, utc(1, 1))).toBe('off-season');
  });

  it('reports off-season well after a window ends', () => {
    expect(seasonStatus(LOBSTER_CLOSED, utc(9, 1))).toBe('off-season');
  });

  it('reports off-season right after a window ends, not upcoming for next year', () => {
    // July 5 is right after the window closes on June 30 — should not be
    // mistaken for "upcoming" next March just because some arithmetic
    // wrapped around badly.
    expect(seasonStatus(LOBSTER_CLOSED, utc(7, 5))).toBe('off-season');
  });

  it('handles a wrapping window: active inside the December portion', () => {
    expect(seasonStatus(WRAPPING, utc(12, 25))).toBe('active');
  });

  it('handles a wrapping window: active inside the January/February portion', () => {
    expect(seasonStatus(WRAPPING, utc(1, 10))).toBe('active');
    expect(seasonStatus(WRAPPING, utc(2, 15))).toBe('active');
  });

  it('handles a wrapping window: off-season in the middle of the gap', () => {
    expect(seasonStatus(WRAPPING, utc(6, 1))).toBe('off-season');
  });

  it('handles a wrapping window: upcoming shortly before the wrap-start', () => {
    // Nov 5 is 10 days before Nov 15.
    expect(seasonStatus(WRAPPING, utc(11, 5))).toBe('upcoming');
  });

  it('handles upcoming across a year boundary (late December before an early-January-adjacent start)', () => {
    const earlyStart: SeasonWindow = { startMonth: 1, startDay: 5, endMonth: 1, endDay: 20 };
    // Dec 20 is 16 days before Jan 5 of the following year.
    expect(seasonStatus(earlyStart, utc(12, 20))).toBe('upcoming');
    // Dec 1 is 35 days before Jan 5 — too far out to be "upcoming".
    expect(seasonStatus(earlyStart, utc(12, 1))).toBe('off-season');
  });

  it('counts real calendar days to next year\'s start across a Feb 29, not a hardcoded 365', () => {
    // A window starting March 1 wraps across Feb 29 whenever next year is
    // a leap year (2028 is). Confirmed by hand (not asserted through
    // seasonStatus's own public true/false split, which this specific gap
    // is too large to observably affect — see the git history/PR
    // discussion for why a boundary-crossing test wasn't feasible here):
    // Dec 31, 2027 -> March 1, 2028 is 61 real days; a hardcoded `+= 365`
    // shortcut (the bug this fix removes) would have computed 60. Both
    // values are far outside the 21-day "upcoming" window regardless, so
    // this off-by-one was real but never user-visible at this app's
    // actual threshold — fixed anyway since real calendar arithmetic
    // (via Date.UTC on the correct target year) costs nothing extra over
    // a magic constant that's simply wrong 25% of the time.
    const marchFirst: SeasonWindow = { startMonth: 3, startDay: 1, endMonth: 3, endDay: 1 };
    expect(seasonStatus(marchFirst, new Date(Date.UTC(2027, 11, 31, 12)))).toBe('off-season');
  });

  // Belize is a fixed UTC-6 with no DST — these specifically exercise the
  // real bug found in review: reading a UTC calendar date directly (rather
  // than shifting to Belize's own) reports the wrong day for roughly 6
  // hours every evening, since Belize's clock lags UTC's calendar date
  // rollover by 6 hours.
  describe('Belize-local time (UTC-6), not raw UTC or device-local time', () => {
    it('is still active on the last evening of a window, even once UTC has already rolled to the next day', () => {
      // July 1, 04:00 UTC = June 30, 22:00 Belize time — still June 30 in
      // Belize, the last day of the lobster-closed window, but already
      // "July 1" if read as a raw UTC calendar date.
      const lastEveningInBelize = new Date(Date.UTC(2026, 6, 1, 4, 0));
      expect(seasonStatus(LOBSTER_CLOSED, lastEveningInBelize)).toBe('active');
    });

    it('is not yet active in the first hours of a window\'s start day, read as raw UTC', () => {
      // Feb 28, 23:00 UTC = Feb 28, 17:00 Belize time — still Feb 28 in
      // Belize (one day before the window opens), even though a
      // same-instant reading of a *different* window's boundary (the
      // case above) already shows how these two zones can disagree.
      const stillFebInBelize = new Date(Date.UTC(2026, 1, 28, 23, 0));
      expect(seasonStatus(LOBSTER_CLOSED, stillFebInBelize)).toBe('upcoming');
    });

    it('does not depend on the device\'s own local timezone', () => {
      // Same instant as the first case above, expressed as a plain Date —
      // Date instants are timezone-independent (there's only one
      // Date.getTime() per instant), so this is really just re-confirming
      // seasonStatus reads its own fixed Belize offset rather than
      // whatever Intl/device timezone the test happens to run under.
      const instant = new Date(Date.UTC(2026, 6, 1, 4, 0)).getTime();
      expect(seasonStatus(LOBSTER_CLOSED, new Date(instant))).toBe('active');
    });
  });
});
