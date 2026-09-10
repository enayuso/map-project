/**
 * Distance/area measurement tool. Per docs/research (live Kakao Map
 * research, 2026-09-10, not saved as its own doc but summarized here since
 * it directly shaped this feature): Kakao Map's mobile app only has
 * distance measurement — tap points, cumulative straight-line distance, a
 * red X to end/clear. Area and radius measurement are confirmed **PC/web
 * only**, absent from their mobile app entirely. This tool builds both
 * anyway (the original ask covered both), matching Kakao's confirmed
 * mobile mechanics for distance (tap-to-place, running total, explicit
 * clear) and extending the same interaction pattern to area, since no
 * mobile reference exists to diverge from there.
 *
 * Pure geometry, no backend calls — this is the one feature in this app
 * that's entirely client-side math.
 */

import { haversineKm } from '../categories/categories';

export type LatLon = { lat: number; lon: number };

/** Straight-line (not route-following) total length through every point in
 * order — confirmed to match Kakao's own mobile behavior: their tool is
 * always straight segments between taps, never routed. */
export function polylineLengthKm(points: LatLon[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineKm(points[i - 1], points[i]);
  }
  return total;
}

/**
 * Polygon area in km². Projects each point to a local flat x/y plane
 * (equirectangular, centered on the polygon's own mean latitude) and
 * applies the standard planar shoelace formula — accurate enough at
 * city/country scale for a rough measurement tool, not a cadastral-grade
 * one (no source claims Kakao's own tool is survey-grade either — its
 * whole PC-only area feature is aimed at casual real-estate/investment
 * eyeballing, per the research, not legal measurement).
 */
export function polygonAreaKm2(points: LatLon[]): number {
  if (points.length < 3) return 0;

  const R = 6371; // km, matches categories.ts's haversineKm
  const meanLat = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
  const latRad = (meanLat * Math.PI) / 180;

  const xy = points.map(p => ({
    x: R * ((p.lon * Math.PI) / 180) * Math.cos(latRad),
    y: R * ((p.lat * Math.PI) / 180),
  }));

  let sum = 0;
  for (let i = 0; i < xy.length; i++) {
    const a = xy[i];
    const b = xy[(i + 1) % xy.length]; // wraps around — the polygon auto-closes back to its first point
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/** "180 m²" under a hectare-ish scale, "3.4 km²" above — no source found
 * evidence Kakao shows 평 (the traditional Korean floor-area unit)
 * alongside m², so this doesn't either; matches formatDistanceKm's own
 * small/large-unit-switch convention in categories.ts. */
export function formatAreaKm2(km2: number): string {
  if (km2 < 0.01) return `${Math.round(km2 * 1_000_000)} m²`;
  return `${km2.toFixed(2)} km²`;
}

/** GeoJSON ring for a Polygon source — must repeat the first point at the
 * end (GeoJSON's own closure convention, distinct from polygonAreaKm2's
 * modular-wraparound sum above, which doesn't need the literal repeat). */
export function toClosedRing(points: LatLon[]): [number, number][] {
  const ring = points.map((p): [number, number] => [p.lon, p.lat]);
  if (ring.length > 0) ring.push(ring[0]);
  return ring;
}
