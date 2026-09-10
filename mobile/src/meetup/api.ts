/**
 * Fair meeting-point calculator — notably, per docs/research/
 * 09-kakao-naver-feature-audit.md, neither Kakao Map nor Naver Map actually
 * has this as a native feature (both punt to third-party apps built on
 * their APIs), so this isn't catching up to a reference implementation,
 * it's building something genuinely differentiated.
 *
 * "Fair" here means minimax, not average: among candidate venues near
 * everyone, pick the ones where the WORST-OFF participant's travel time is
 * smallest — not just the fastest on average, which could mean one person
 * has a short trip and another has a long one. A true geometric midpoint
 * would ignore the actual road network entirely (unfair whenever a river,
 * a highway-only connection, or just uneven road density means "close on
 * the map" isn't "close by road") — so candidates are scored by real
 * Valhalla travel times, not straight-line distance.
 */

import { haversineKm } from '../categories/categories';
import type { Costing, LatLon } from '../routing/api';
import type { SearchResult } from '../search/api';

const VALHALLA_URL = 'http://127.0.0.1:8002';
const TYPESENSE_URL = 'http://127.0.0.1:8108';
const TYPESENSE_API_KEY = 'typesense_dev_local_only';

// Candidate venues are drawn from these — a "meeting point" in practice
// almost always means "let's grab food/coffee/a drink," not a random
// street corner. Same 18-category taxonomy as scripts/build_poi_index.py.
const MEETUP_CATEGORIES = ['restaurant', 'cafe', 'bar'];

const MIN_CANDIDATE_RADIUS_KM = 1;
const MAX_CANDIDATE_RADIUS_KM = 15;
// How far out to look for candidate venues around the group's centroid,
// relative to how spread out the group actually is — tight if everyone's
// nearby, wide if they're scattered across town, clamped to a sane range
// either way (a huge radius search for a dense city returns too much to
// usefully rank; too tight for a spread-out group returns nothing at all).
const CANDIDATE_RADIUS_FACTOR = 0.6;

const CANDIDATE_QUERY_LIMIT = 40; // capped so the one matrix call below stays a single reasonably-sized request
const MAX_RESULTS = 8;

export type MeetupCandidate = {
  place: SearchResult;
  /** Same order as the `participants` array passed in. null = Valhalla
   * couldn't route there at all from that participant (not just slow). */
  travelTimesMin: (number | null)[];
  /** The fairness score this list is sorted by: the single worst-off
   * participant's travel time. Lower is fairer. */
  maxTimeMin: number;
  avgTimeMin: number;
};

function centroid(points: LatLon[]): LatLon {
  return {
    lat: points.reduce((sum, p) => sum + p.lat, 0) / points.length,
    lon: points.reduce((sum, p) => sum + p.lon, 0) / points.length,
  };
}

type TypesenseHit = {
  document: { id: string; name: string; category: string; location: [number, number] };
};

/**
 * Finds real venues near the group's centroid and ranks them by how fair a
 * meeting point each one would be. Costing defaults to driving since that's
 * how most people actually get to a meetup, but the same walk/bike profiles
 * routing already supports work here too.
 */
export async function findMeetupCandidates(
  participants: LatLon[],
  costing: Costing = 'auto',
): Promise<MeetupCandidate[]> {
  if (participants.length < 2) {
    throw new Error('Need at least 2 participants to find a meeting point');
  }

  const center = centroid(participants);
  const maxSpreadKm = Math.max(...participants.map(p => haversineKm(center, p)));
  const radiusKm = Math.min(
    MAX_CANDIDATE_RADIUS_KM,
    Math.max(MIN_CANDIDATE_RADIUS_KM, maxSpreadKm * CANDIDATE_RADIUS_FACTOR),
  );

  const filterBy = `category:=[${MEETUP_CATEGORIES.join(',')}] && location:(${center.lat}, ${center.lon}, ${radiusKm} km)`;
  const sortBy = `location(${center.lat},${center.lon}):asc`;
  const searchUrl =
    `${TYPESENSE_URL}/collections/pois/documents/search?q=*&query_by=name` +
    `&filter_by=${encodeURIComponent(filterBy)}&sort_by=${encodeURIComponent(sortBy)}&per_page=${CANDIDATE_QUERY_LIMIT}`;
  const searchRes = await fetch(searchUrl, { headers: { 'X-TYPESENSE-API-KEY': TYPESENSE_API_KEY } });
  if (!searchRes.ok) throw new Error(`Typesense ${searchRes.status}`);
  const searchBody: { hits: TypesenseHit[] } = await searchRes.json();

  if (searchBody.hits.length === 0) return [];

  const candidates: SearchResult[] = searchBody.hits.map(h => ({
    id: `poi-${h.document.id}`,
    name: h.document.name,
    subtitle: h.document.category.replace('_', ' '),
    lat: h.document.location[0],
    lon: h.document.location[1],
    kind: 'poi' as const,
  }));

  // One matrix call gets every participant's travel time to every
  // candidate — Valhalla's own dedicated tool for exactly this, and
  // dramatically fewer requests than N x M individual /route calls.
  const matrixRes = await fetch(`${VALHALLA_URL}/sources_to_targets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sources: participants.map(p => ({ lat: p.lat, lon: p.lon })),
      targets: candidates.map(c => ({ lat: c.lat, lon: c.lon })),
      costing,
    }),
  });
  if (!matrixRes.ok) throw new Error(`Valhalla matrix ${matrixRes.status}`);
  const matrixBody: { sources_to_targets: { time: number | null }[][] } = await matrixRes.json();

  const results: MeetupCandidate[] = candidates.map((place, targetIdx) => {
    const travelTimesMin = matrixBody.sources_to_targets.map(row => {
      const t = row[targetIdx]?.time;
      return t == null ? null : t / 60;
    });
    const allReachable = travelTimesMin.every((t): t is number => t != null);
    // A venue unreachable for even one participant isn't "fair" for
    // anyone — disqualified outright (Infinity sorts it dead last, then
    // filtered out below) rather than just penalized as "slow".
    const maxTimeMin = allReachable ? Math.max(...(travelTimesMin as number[])) : Infinity;
    const avgTimeMin = allReachable
      ? (travelTimesMin as number[]).reduce((s, t) => s + t, 0) / travelTimesMin.length
      : Infinity;
    return { place, travelTimesMin, maxTimeMin, avgTimeMin };
  });

  return results
    .filter(r => Number.isFinite(r.maxTimeMin))
    .sort((a, b) => a.maxTimeMin - b.maxTimeMin || a.avgTimeMin - b.avgTimeMin)
    .slice(0, MAX_RESULTS);
}
