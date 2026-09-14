/**
 * Belize seasonal highlights (lobster/conch closed seasons, whale sharks at
 * Gladden Spit, turtle nesting) — curated content, same reasoning and same
 * backend as src/ferries/api.ts and src/dive-sites/api.ts: no live feed
 * exists for any of this (see docs/research/13-belize-seasonal-highlights-
 * sourcing.md), so it's hand-maintained in sharing/data/seasonal_
 * highlights.json and served read-only from the existing sharing/ service.
 */
import type { SeasonWindow } from './seasonalStatus';

const SHARING_URL = 'http://127.0.0.1:8090';

export type SeasonalHighlight = {
  id: string;
  name: string;
  emoji: string;
  activeWindow: SeasonWindow;
  location: { lat: number; lon: number; label: string } | null;
  description: string;
  source: string;
  confidence: string;
  lastVerifiedAt: string;
};

export async function fetchSeasonalHighlights(): Promise<SeasonalHighlight[]> {
  const res = await fetch(`${SHARING_URL}/seasonal-highlights`);
  if (!res.ok) throw new Error(`Seasonal highlights fetch failed (${res.status})`);
  const body = await res.json();
  return body.highlights;
}
