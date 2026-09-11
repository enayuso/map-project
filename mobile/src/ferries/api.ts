/**
 * Water-taxi/ferry schedules — per docs/research/12-ferry-dive-site-
 * data-sourcing.md, no API/feed exists anywhere for this (government or
 * private): every real operator publishes as an image or plain HTML page,
 * and Belize has no open-data portal at all. This is curated content —
 * see sharing/data/ferry_routes.json, hand-maintained and re-checked
 * every 2-3 months — served read-only from the same sharing/ service as
 * everything else this app doesn't need new infrastructure for.
 */

const SHARING_URL = 'http://127.0.0.1:8090';

export type FerryStop = { name: string; lat: number; lon: number };

export type FerryOperator = {
  name: string;
  url: string | null;
  phone: string | null;
  contactNote?: string;
};

export type SampleDeparture = { from: string; times: string[] };

export type FerryRoute = {
  id: string;
  name: string;
  isInternational: boolean;
  stops: FerryStop[];
  operators: FerryOperator[];
  notes: string;
  sampleDepartures: SampleDeparture[];
  lastVerifiedAt: string;
};

export async function fetchFerryRoutes(): Promise<FerryRoute[]> {
  const res = await fetch(`${SHARING_URL}/ferry-routes`);
  if (!res.ok) throw new Error(`Ferry routes fetch failed (${res.status})`);
  const body = await res.json();
  return body.routes;
}
