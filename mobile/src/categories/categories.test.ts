import { haversineKm } from './categories';

describe('haversineKm', () => {
  it('is 0 for the same point', () => {
    expect(haversineKm({ lat: 17.5, lon: -88.2 }, { lat: 17.5, lon: -88.2 })).toBe(0);
  });

  it('is symmetric', () => {
    const a = { lat: 17.5, lon: -88.2 };
    const b = { lat: 17.6, lon: -88.1 };
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 10);
  });

  it('matches a known real-world distance (Belize City to San Ignacio, ~90-100km beeline)', () => {
    const belizeCity = { lat: 17.4995, lon: -88.19 };
    const sanIgnacio = { lat: 17.1585, lon: -89.0707 };
    const km = haversineKm(belizeCity, sanIgnacio);
    expect(km).toBeGreaterThan(80);
    expect(km).toBeLessThan(110);
  });

  it('one degree of latitude is close to 111km everywhere', () => {
    const a = { lat: 17.0, lon: -88.2 };
    const b = { lat: 18.0, lon: -88.2 };
    expect(haversineKm(a, b)).toBeCloseTo(111, 0);
  });
});
