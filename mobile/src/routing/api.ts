/**
 * Phase 4 routing client: calls our Valhalla service for turn-by-turn
 * directions. See routing/README.md for the backend side.
 *
 * NOTE: 127.0.0.1 resolves to the host Mac from the iOS Simulator only —
 * same caveat as src/search/api.ts and src/styles/basic.json.
 */

const VALHALLA_URL = 'http://127.0.0.1:8002';

export type Costing = 'auto' | 'pedestrian' | 'bicycle';

export type LatLon = { lat: number; lon: number };

export type RouteManeuver = {
  instruction: string;
  distanceKm: number;
  durationSec: number;
  /** Valhalla's maneuver type code (turn direction/depart/arrive/roundabout/
   * etc.) — see src/routing/navigation.ts's MANEUVER_ICONS for the mapping. */
  type: number;
  /** Index into RouteResult.geometry.coordinates where this maneuver's
   * instruction applies — e.g. "distance to this coordinate" is exactly
   * "distance to the next turn" for live navigation (src/routing/
   * navigation.ts). */
  beginShapeIndex: number;
};

export type RouteResult = {
  distanceKm: number;
  durationMin: number;
  hasFerry: boolean;
  geometry: GeoJSON.LineString;
  maneuvers: RouteManeuver[];
};

/**
 * Decodes Valhalla's encoded polyline (precision 1e6, unlike Google's usual
 * 1e5) into [lon, lat] pairs for use as GeoJSON.
 */
function decodePolyline(encoded: string, precision = 6): [number, number][] {
  const factor = Math.pow(10, precision);
  const coords: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lon = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lon += result & 1 ? ~(result >> 1) : result >> 1;

    coords.push([lon / factor, lat / factor]);
  }
  return coords;
}

export async function fetchRoute(
  origin: LatLon,
  destination: LatLon,
  costing: Costing,
): Promise<RouteResult> {
  const res = await fetch(`${VALHALLA_URL}/route`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      locations: [
        { lat: origin.lat, lon: origin.lon },
        { lat: destination.lat, lon: destination.lon },
      ],
      costing,
    }),
  });
  const body = await res.json();
  if (!res.ok || !body.trip) {
    throw new Error(body.error || `Valhalla ${res.status}`);
  }

  const trip = body.trip;
  const leg = trip.legs[0];
  const geometry: GeoJSON.LineString = {
    type: 'LineString',
    coordinates: decodePolyline(leg.shape),
  };

  const maneuvers: RouteManeuver[] = leg.maneuvers.map((m: any) => ({
    instruction: m.instruction as string,
    distanceKm: m.length as number,
    durationSec: m.time as number,
    type: m.type as number,
    beginShapeIndex: m.begin_shape_index as number,
  }));

  return {
    distanceKm: trip.summary.length,
    durationMin: trip.summary.time / 60,
    hasFerry: !!trip.summary.has_ferry,
    geometry,
    maneuvers,
  };
}
