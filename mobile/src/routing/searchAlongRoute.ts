/**
 * Search-along-route — per docs/research/10-remaining-feature-gaps.md,
 * genuinely useful for Belize's long, sparse inter-town drives (Belize
 * City–Placencia, etc.) where gas/food/ATM stops are few and far between.
 * Reuses existing infrastructure rather than adding anything new: the
 * route geometry already comes back from src/routing/api.ts's fetchRoute,
 * and src/search/api.ts's searchNearby already does a Typesense geo-radius
 * query — this module is the missing piece in between, turning "search
 * near one point" into "search near anywhere along this path."
 *
 * Approach: since there's no server-side "buffer along a polyline" query
 * available (Typesense only offers point+radius), this samples the route
 * at even intervals and runs one point-radius search per sample, then
 * merges/dedupes the results and ranks them by progress along the route
 * rather than by raw distance from any single point — the same practical
 * approximation a buffer-corridor search produces, at a fraction of the
 * server calls. Good enough for a two-lane highway (search radius comfortably
 * covers "just off the road"); a wide loop or heavily-curved route could in
 * theory sample past a hazard tucked in a bend, an acceptable tradeoff for
 * how rarely that matters in Belize's fairly direct road network.
 */

import { haversineKm } from '../categories/categories';
import { searchNearby, type SearchResult } from '../search/api';

export type AlongRouteResult = SearchResult & {
  /** Straight-line distance (km) from the nearest route sample point —
   * a proxy for "how far off your path," not true point-to-polyline
   * distance (see header comment for why that's an acceptable tradeoff). */
  detourKm: number;
  /** Cumulative route distance (km) at the sample point that produced this
   * result — sorting by this gives "in the order you'll pass them," not by
   * raw beeline distance from a single center. */
  progressKm: number;
};

const SAMPLE_SPACING_KM = 5; // one search center roughly every 5km of route
const MAX_SAMPLES = 12; // caps Typesense calls even on a very long route
const SEARCH_RADIUS_KM = 3; // how far off-route a result can still count as "along the way"
const MAX_RESULTS = 40;

type LonLat = [number, number];

/** Cumulative distance (km) at each coordinate, index-aligned with
 * `coordinates` — coordinates[0] is always 0. */
function cumulativeDistancesKm(coordinates: LonLat[]): number[] {
  const distances = [0];
  for (let i = 1; i < coordinates.length; i++) {
    const [lonA, latA] = coordinates[i - 1];
    const [lonB, latB] = coordinates[i];
    distances.push(distances[i - 1] + haversineKm({ lat: latA, lon: lonA }, { lat: latB, lon: lonB }));
  }
  return distances;
}

/** The lat/lon at a given cumulative distance along the route, linearly
 * interpolating between the two straddling coordinates. Clamps to the
 * route's own start/end for out-of-range targets. */
function pointAtDistance(
  coordinates: LonLat[],
  cumDist: number[],
  targetKm: number,
): { lat: number; lon: number } {
  const total = cumDist[cumDist.length - 1];
  const clamped = Math.max(0, Math.min(total, targetKm));
  // Find the segment [i-1, i] straddling clamped — linear scan is fine here:
  // this runs at most MAX_SAMPLES times per search, not per route point.
  let i = 1;
  while (i < cumDist.length && cumDist[i] < clamped) i++;
  if (i >= cumDist.length) i = cumDist.length - 1;
  const segStart = cumDist[i - 1];
  const segEnd = cumDist[i];
  const t = segEnd > segStart ? (clamped - segStart) / (segEnd - segStart) : 0;
  const [lonA, latA] = coordinates[i - 1];
  const [lonB, latB] = coordinates[i];
  return { lat: latA + (latB - latA) * t, lon: lonA + (lonB - lonA) * t };
}

/** Evenly spaced sample points (each carrying its own progressKm) covering
 * the whole route, always including the start and end. Spacing widens
 * automatically past MAX_SAMPLES so a very long route still costs a
 * bounded number of Typesense calls rather than growing without limit. */
export function sampleRoute(
  coordinates: LonLat[],
  spacingKm = SAMPLE_SPACING_KM,
  maxSamples = MAX_SAMPLES,
): { lat: number; lon: number; progressKm: number }[] {
  if (coordinates.length < 2) return [];
  const cumDist = cumulativeDistancesKm(coordinates);
  const total = cumDist[cumDist.length - 1];
  if (total === 0) {
    const [lon, lat] = coordinates[0];
    return [{ lat, lon, progressKm: 0 }];
  }

  const naiveCount = Math.floor(total / spacingKm) + 1;
  const sampleCount = Math.max(2, Math.min(maxSamples, naiveCount));
  const step = total / (sampleCount - 1);

  const samples: { lat: number; lon: number; progressKm: number }[] = [];
  for (let i = 0; i < sampleCount; i++) {
    const progressKm = i === sampleCount - 1 ? total : i * step; // exact end, no float drift
    const { lat, lon } = pointAtDistance(coordinates, cumDist, progressKm);
    samples.push({ lat, lon, progressKm });
  }
  return samples;
}

/**
 * Runs one searchNearby per route sample, merges results (keeping each
 * place's closest sample/detour), and returns them ordered by progress
 * along the route.
 */
export async function searchAlongRoute(
  coordinates: LonLat[],
  category: string,
): Promise<AlongRouteResult[]> {
  const samples = sampleRoute(coordinates);
  const perSample = await Promise.all(
    samples.map(s => searchNearby(category, { lat: s.lat, lon: s.lon }, SEARCH_RADIUS_KM).catch(() => [])),
  );

  const best = new Map<string, AlongRouteResult>();
  perSample.forEach((results, sampleIndex) => {
    const sample = samples[sampleIndex];
    for (const r of results) {
      const detourKm = haversineKm({ lat: sample.lat, lon: sample.lon }, { lat: r.lat, lon: r.lon });
      const existing = best.get(r.id);
      if (!existing || detourKm < existing.detourKm) {
        best.set(r.id, { ...r, detourKm, progressKm: sample.progressKm });
      }
    }
  });

  return Array.from(best.values())
    .sort((a, b) => a.progressKm - b.progressKm)
    .slice(0, MAX_RESULTS);
}
