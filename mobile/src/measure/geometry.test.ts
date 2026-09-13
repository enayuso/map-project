/**
 * Locks in the manual verification already done for this module (see
 * mobile/README.md's "Distance/area measurement tool" section: "checked
 * against two known synthetic shapes... both within 0.5% of the expected
 * area") as a real, repeatable test instead of a one-time check.
 */
import { polygonAreaKm2, polylineLengthKm } from './geometry';

describe('polylineLengthKm', () => {
  it('is 0 for a single point or no points', () => {
    expect(polylineLengthKm([])).toBe(0);
    expect(polylineLengthKm([{ lat: 17.5, lon: -88.2 }])).toBe(0);
  });

  it('sums straight-line distance between consecutive points, not a route', () => {
    // Three points forming a right angle — the routed distance would be
    // shorter via the hypotenuse, but this tool is deliberately straight-
    // line-only (see this file's own header comment / Kakao's confirmed
    // mobile behavior), so the total must be leg1 + leg2, not the direct
    // corner-to-corner distance.
    const corner = { lat: 17.5, lon: -88.2 };
    const east = { lat: 17.5, lon: -88.19 }; // ~0.1km east at this latitude
    const north = { lat: 17.509, lon: -88.19 }; // ~1km north of `east`

    const total = polylineLengthKm([corner, east, north]);
    const directCornerToNorth = polylineLengthKm([corner, north]);

    expect(total).toBeGreaterThan(directCornerToNorth);
  });

  it('matches a known real-world distance within a small tolerance', () => {
    // Belize City to San Ignacio, roughly 120km by straight line (the
    // actual road distance is longer since it's not straight) — a coarse
    // sanity check that the haversine math itself isn't off by an order
    // of magnitude, not a precise fixture.
    const belizeCity = { lat: 17.4995, lon: -88.19 };
    const sanIgnacio = { lat: 17.1585, lon: -89.0707 };
    const km = polylineLengthKm([belizeCity, sanIgnacio]);
    expect(km).toBeGreaterThan(80);
    expect(km).toBeLessThan(110);
  });
});

describe('polygonAreaKm2', () => {
  it('is 0 for fewer than 3 points', () => {
    expect(polygonAreaKm2([])).toBe(0);
    expect(polygonAreaKm2([{ lat: 17.5, lon: -88.2 }])).toBe(0);
    expect(polygonAreaKm2([{ lat: 17.5, lon: -88.2 }, { lat: 17.51, lon: -88.2 }])).toBe(0);
  });

  it('computes a ~1km² square within 0.5%', () => {
    // 1km ~= 0.009 deg latitude everywhere; longitude degrees shrink by
    // cos(latitude) — both accounted for so this really is a ~1km square
    // at Belize's own latitude, not an arbitrary small box.
    const lat0 = 17.5;
    const dLat = 1 / 111.0;
    const dLon = 1 / (111.0 * Math.cos((lat0 * Math.PI) / 180));
    const square = [
      { lat: lat0, lon: -88.2 },
      { lat: lat0, lon: -88.2 + dLon },
      { lat: lat0 + dLat, lon: -88.2 + dLon },
      { lat: lat0 + dLat, lon: -88.2 },
    ];
    const area = polygonAreaKm2(square);
    expect(area).toBeCloseTo(1, 1);
    expect(Math.abs(area - 1) / 1).toBeLessThan(0.005);
  });

  it('computes a ~6km² rectangle (2km x 3km) within 0.5%', () => {
    const lat0 = 17.5;
    const dLat = 3 / 111.0;
    const dLon = 2 / (111.0 * Math.cos((lat0 * Math.PI) / 180));
    const rect = [
      { lat: lat0, lon: -88.2 },
      { lat: lat0, lon: -88.2 + dLon },
      { lat: lat0 + dLat, lon: -88.2 + dLon },
      { lat: lat0 + dLat, lon: -88.2 },
    ];
    const area = polygonAreaKm2(rect);
    expect(Math.abs(area - 6) / 6).toBeLessThan(0.005);
  });

  it('is invariant to which point the polygon starts from (auto-closes)', () => {
    const square = [
      { lat: 17.5, lon: -88.2 },
      { lat: 17.5, lon: -88.19 },
      { lat: 17.509, lon: -88.19 },
      { lat: 17.509, lon: -88.2 },
    ];
    const rotated = [square[2], square[3], square[0], square[1]];
    expect(polygonAreaKm2(rotated)).toBeCloseTo(polygonAreaKm2(square), 6);
  });
});
