/**
 * Border-crossing info cards — Belize's two land borders (Mexico via
 * Santa Elena, Guatemala via Benque Viejo del Carmen). Per docs/research/
 * 10-remaining-feature-gaps.md, this is a top pain point in every Belize
 * travel blog checked, and per docs/research/12-ferry-dive-site-data-
 * sourcing.md's same pattern, there's no official structured source for
 * hours/fees/scam warnings — curated content, same
 * sharing/data/*.json + GET-only approach as ferries and dive sites.
 */

const SHARING_URL = 'http://127.0.0.1:8090';

export type PositionSource = 'border-crossing-point' | 'town-centroid-approximate';

export type BorderCrossing = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  positionSource: PositionSource;
  countries: [string, string];
  hours: string;
  documentsNeeded: string;
  fees: string;
  scamWarnings: string;
  sourceNote: string;
  lastVerifiedAt: string;
};

export async function fetchBorderCrossings(): Promise<BorderCrossing[]> {
  const res = await fetch(`${SHARING_URL}/border-crossings`);
  if (!res.ok) throw new Error(`Border crossings fetch failed (${res.status})`);
  const body = await res.json();
  return body.crossings;
}
