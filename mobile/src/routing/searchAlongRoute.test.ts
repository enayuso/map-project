import { sampleRoute } from './searchAlongRoute';

// A straight ~11km line running due south along one meridian — easy to
// reason about exactly (each step is due south, so haversine distance is
// just a function of the latitude delta), unlike a real curved route.
const STRAIGHT_LINE: [number, number][] = [
  [-88.2, 17.6],
  [-88.2, 17.5],
];

describe('sampleRoute', () => {
  it('returns nothing for fewer than 2 coordinates', () => {
    expect(sampleRoute([])).toEqual([]);
    expect(sampleRoute([[-88.2, 17.5]])).toEqual([]);
  });

  it('returns a single sample at the start for a zero-length route', () => {
    const samples = sampleRoute([
      [-88.2, 17.5],
      [-88.2, 17.5],
    ]);
    expect(samples).toEqual([{ lat: 17.5, lon: -88.2, progressKm: 0 }]);
  });

  it('always includes the exact start and end points', () => {
    const samples = sampleRoute(STRAIGHT_LINE);
    expect(samples[0]).toEqual({ lat: 17.6, lon: -88.2, progressKm: 0 });
    const last = samples[samples.length - 1];
    expect(last.lat).toBeCloseTo(17.5, 6);
    expect(last.lon).toBeCloseTo(-88.2, 6);
  });

  it('produces evenly spaced samples covering the whole route', () => {
    const samples = sampleRoute(STRAIGHT_LINE, 5, 12);
    // Each consecutive pair should be roughly the same progressKm apart
    // (except possibly the last, which is fine — see below).
    const gaps = samples.slice(1).map((s, i) => s.progressKm - samples[i].progressKm);
    const firstGap = gaps[0];
    for (const gap of gaps) {
      expect(gap).toBeCloseTo(firstGap, 1);
    }
    // Latitude should decrease monotonically along this straight south-
    // bound line — no sample doubles back.
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i].lat).toBeLessThanOrEqual(samples[i - 1].lat);
    }
  });

  it('caps the sample count at maxSamples even on a very long route', () => {
    const longLine: [number, number][] = [
      [-89.2, 18.5],
      [-87.5, 16.0], // spans most of Belize — well over 200km
    ];
    const samples = sampleRoute(longLine, 5, 12);
    expect(samples.length).toBeLessThanOrEqual(12);
  });

  it('never returns fewer than 2 samples for a genuinely non-zero route', () => {
    // Spacing far larger than the route itself should still yield start+end,
    // not collapse to a single point.
    const samples = sampleRoute(STRAIGHT_LINE, 1000, 12);
    expect(samples.length).toBeGreaterThanOrEqual(2);
  });
});
