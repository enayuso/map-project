/**
 * Phase 3 Track B: write client for the canonical `places` table, via
 * PostgREST (backend/places-schema.sql). This is what actually persists —
 * unlike a hand-edit against Typesense directly, a place created/edited
 * here survives the next scripts/reindex_pois.sh run, since Typesense is
 * now just a rebuildable cache of this table.
 *
 * NOTE: 127.0.0.1 resolves to the host Mac from the iOS Simulator only —
 * same caveat as src/search/api.ts and src/routing/api.ts.
 */

const POSTGREST_URL = 'http://127.0.0.1:3001';

export type VerificationStatus = 'osm_import' | 'field_verified' | 'self_registered' | 'crowd_suggested';

export type PlaceInput = {
  name: string;
  category: string;
  lat: number;
  lon: number;
  phone?: string;
  hours?: string;
  website?: string;
  addressDescription?: string;
  verificationStatus: VerificationStatus;
  source?: string;
};

function toBody(input: Partial<PlaceInput>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (input.name !== undefined) body.name = input.name;
  if (input.category !== undefined) body.category = input.category;
  if (input.lat !== undefined && input.lon !== undefined) {
    body.geom = `SRID=4326;POINT(${input.lon} ${input.lat})`;
  }
  if (input.phone !== undefined) body.phone = input.phone || null;
  if (input.hours !== undefined) body.hours = input.hours || null;
  if (input.website !== undefined) body.website = input.website || null;
  if (input.addressDescription !== undefined) body.address_description = input.addressDescription || null;
  if (input.verificationStatus !== undefined) body.verification_status = input.verificationStatus;
  if (input.source !== undefined) body.source = input.source;
  return body;
}

/** Creates a brand-new place (osm_id left unset — never collides with an
 * OSM-seeded row). Returns the new row's id. */
export async function createPlace(input: PlaceInput): Promise<string> {
  const res = await fetch(`${POSTGREST_URL}/places`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(toBody(input)),
  });
  if (!res.ok) throw new Error(`PostgREST ${res.status}: ${await res.text()}`);
  const [row] = await res.json();
  return row.id as string;
}

/** Updates an existing place by id (a `places.id` UUID — see
 * placeIdFromSearchResultId for recovering this from a SearchResult). */
export async function updatePlace(id: string, input: Partial<PlaceInput>): Promise<void> {
  const res = await fetch(`${POSTGREST_URL}/places?id=eq.${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(toBody(input)),
  });
  if (!res.ok) throw new Error(`PostgREST ${res.status}: ${await res.text()}`);
}

/**
 * A SearchResult sourced from search/category-browsing carries an id like
 * `poi-<uuid>`, where <uuid> is literally the `places.id` this POI came
 * from (search/api.ts builds Typesense's own document id directly from
 * `places.id` as of Phase 3 Track B — see scripts/build_poi_index.py).
 * Returns null for anything that isn't reliably one of ours to edit: a
 * Nominatim ("place-...") result, or a POI tapped directly on the map
 * (App.tsx's placeFromFeature, sourced from the raw vector tile rather
 * than places, so it isn't guaranteed to have a matching row — e.g.
 * unnamed POIs render on the map but were never seeded into `places`,
 * which requires a name). Editing those is a deliberate v1 gap — see
 * mobile/README.md.
 */
export function placeIdFromSearchResultId(searchResultId: string): string | null {
  const match = searchResultId.match(/^poi-([0-9a-f-]{36})$/i);
  return match ? match[1] : null;
}
