/**
 * Phase 2 search-box client: queries Nominatim (addresses/places) and
 * Typesense (POIs) in parallel and returns one merged, ranked list.
 *
 * NOTE: 127.0.0.1 here resolves to the host Mac from the iOS Simulator (same
 * as the tile server in src/styles/basic.json) — this only works because
 * we're targeting the Simulator, not a physical device. See docs/PLAN.md
 * Phase 4/production notes for what changes when this ships for real
 * (these URLs become real API endpoints, not localhost).
 */

const NOMINATIM_URL = 'http://127.0.0.1:8082';
const TYPESENSE_URL = 'http://127.0.0.1:8108';
const TYPESENSE_API_KEY = 'typesense_dev_local_only';

export type SearchResult = {
  id: string;
  name: string;
  subtitle: string;
  lat: number;
  lon: number;
  kind: 'place' | 'poi';
};

type NominatimHit = {
  place_id: number;
  display_name: string;
  name?: string;
  lat: string;
  lon: string;
  addresstype?: string;
};

type TypesenseHit = {
  document: {
    id: string;
    name: string;
    category: string;
    location: [number, number]; // [lat, lon]
  };
};

async function searchPlaces(query: string): Promise<SearchResult[]> {
  const url = `${NOMINATIM_URL}/search?q=${encodeURIComponent(
    query,
  )}&format=json&limit=5&countrycodes=bz`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const hits: NominatimHit[] = await res.json();
  return hits.map(h => ({
    id: `place-${h.place_id}`,
    name: h.name || h.display_name.split(',')[0],
    subtitle: h.display_name,
    lat: parseFloat(h.lat),
    lon: parseFloat(h.lon),
    kind: 'place' as const,
  }));
}

async function searchPOIs(query: string): Promise<SearchResult[]> {
  const url =
    `${TYPESENSE_URL}/collections/pois/documents/search?` +
    `q=${encodeURIComponent(query)}&query_by=name&per_page=5`;
  const res = await fetch(url, {
    headers: { 'X-TYPESENSE-API-KEY': TYPESENSE_API_KEY },
  });
  if (!res.ok) throw new Error(`Typesense ${res.status}`);
  const body: { hits: TypesenseHit[] } = await res.json();
  return body.hits.map(h => ({
    id: `poi-${h.document.id}`,
    name: h.document.name,
    subtitle: h.document.category.replace('_', ' '),
    lat: h.document.location[0],
    lon: h.document.location[1],
    kind: 'poi' as const,
  }));
}

/**
 * Runs both searches in parallel. Either can fail independently (e.g. one
 * service down) without losing the other's results.
 */
export async function searchAll(query: string): Promise<SearchResult[]> {
  const [places, pois] = await Promise.allSettled([
    searchPlaces(query),
    searchPOIs(query),
  ]);
  const results: SearchResult[] = [];
  if (places.status === 'fulfilled') results.push(...places.value);
  if (pois.status === 'fulfilled') results.push(...pois.value);
  // POIs first — a named-business match ("Sinatra Restaurant") is usually
  // more useful than a broad place match for the same query.
  return results.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'poi' ? -1 : 1));
}

/**
 * Category-filtered nearby search — powers the category quick-filter bar
 * (see src/categories/). `category` is one of the taxonomy keys from
 * scripts/build_poi_index.py (e.g. "restaurant", "cafe"). Typesense's
 * geopoint filter/sort syntax: `location:(lat, lon, radius km)` and
 * `location(lat,lon):asc` — see search/README.md's geo-radius example,
 * confirmed working there (489 results within 3km of Belize City).
 */
export async function searchNearby(
  category: string,
  center: { lat: number; lon: number },
  radiusKm = 8,
): Promise<SearchResult[]> {
  const filterBy = `category:=${category} && location:(${center.lat}, ${center.lon}, ${radiusKm} km)`;
  const sortBy = `location(${center.lat},${center.lon}):asc`;
  const url =
    `${TYPESENSE_URL}/collections/pois/documents/search?q=*&query_by=name` +
    `&filter_by=${encodeURIComponent(filterBy)}&sort_by=${encodeURIComponent(sortBy)}&per_page=50`;
  const res = await fetch(url, {
    headers: { 'X-TYPESENSE-API-KEY': TYPESENSE_API_KEY },
  });
  if (!res.ok) throw new Error(`Typesense ${res.status}`);
  const body: { hits: TypesenseHit[] } = await res.json();
  return body.hits.map(h => ({
    id: `poi-${h.document.id}`,
    name: h.document.name,
    subtitle: h.document.category.replace('_', ' '),
    lat: h.document.location[0],
    lon: h.document.location[1],
    kind: 'poi' as const,
  }));
}
