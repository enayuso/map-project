import { seasonStatus, type SeasonWindow } from './seasonalStatus';

// Lobster's real closed season, per docs/research/13 — a real, non-wrapping
// window (March 1 - June 30) to exercise the ordinary case.
const LOBSTER_CLOSED: SeasonWindow = { startMonth: 3, startDay: 1, endMonth: 6, endDay: 30 };

// A synthetic wrapping window (Nov 15 - Feb 15) — none of the current
// seasonal_highlights.json entries happen to wrap, but the logic needs to
// handle it correctly regardless, since a future entry easily could.
const WRAPPING: SeasonWindow = { startMonth: 11, startDay: 15, endMonth: 2, endDay: 15 };

function utc(month: number, day: number, year = 2026): Date {
  return new Date(Date.UTC(year, month - 1, day));
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
});
