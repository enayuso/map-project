/**
 * Dive-site data — per docs/research/12-ferry-dive-site-data-sourcing.md,
 * no structured per-site dive database exists for Belize anywhere
 * (government, scientific, or commercial). This is curated content — see
 * sharing/data/dive_sites.json — combining real OpenStreetMap points,
 * official UNESCO World Heritage reserve centroids, and named-landmark
 * stand-ins where no site-specific coordinate exists, each explicitly
 * labeled via `positionSource` rather than presented as uniformly precise.
 */

const SHARING_URL = 'http://127.0.0.1:8090';

export type DiveDifficulty = 'beginner' | 'intermediate' | 'advanced';
export type PositionSource = 'osm' | 'unesco-reserve-centroid' | 'atoll-landmark-approximate';

export type DiveSite = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  positionSource: PositionSource;
  reserve: string;
  depthMinM: number | null;
  depthMaxM: number | null;
  difficulty: DiveDifficulty | null;
  description: string;
  sourceNote: string;
  lastVerifiedAt: string;
};

export async function fetchDiveSites(): Promise<DiveSite[]> {
  const res = await fetch(`${SHARING_URL}/dive-sites`);
  if (!res.ok) throw new Error(`Dive sites fetch failed (${res.status})`);
  const body = await res.json();
  return body.sites;
}

export function formatDepth(site: DiveSite): string | null {
  if (site.depthMinM == null || site.depthMaxM == null) return null;
  if (site.depthMinM === site.depthMaxM) return `${site.depthMinM}m`;
  return `${site.depthMinM}–${site.depthMaxM}m`;
}

export const DIFFICULTY_LABELS: Record<DiveDifficulty, string> = {
  beginner: '🟢 Beginner',
  intermediate: '🟡 Intermediate',
  advanced: '🔴 Advanced',
};

/** Human-readable caveat shown per site — the whole point of tracking
 * positionSource explicitly rather than just shipping one lat/lon. */
export const POSITION_SOURCE_LABELS: Record<PositionSource, string> = {
  osm: 'Position: OpenStreetMap-tagged point',
  'unesco-reserve-centroid': "Position: approximate — reserve's official centroid, not this exact site",
  'atoll-landmark-approximate': 'Position: approximate — a landmark within the atoll, not this exact site',
};
