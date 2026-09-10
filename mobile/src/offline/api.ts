/**
 * Offline maps (Phase 5) — flagged back when Phase 5 was first scoped as
 * "cheap to add once Phase 1's tile pipeline exists, worth doing given
 * Belize's low-connectivity rural/dive-site areas," never picked up until
 * now. Uses MapLibre Native's own built-in OfflineManager/OfflinePack API
 * (confirmed real by reading the library's own source before building
 * anything, not assumed) rather than baking a separate MBTiles file
 * ourselves — it downloads and caches everything a style needs (tiles,
 * glyphs, sprites) for a bounded region, and — this is the key
 * simplification — once a pack covers the current view, MapLibre Native
 * transparently serves from that local cache whenever a live tile request
 * fails. No "am I offline, switch to local tiles" logic needed anywhere
 * in this app; that's entirely the native SDK's own job.
 *
 * The one real requirement this forced: OfflinePackCreateOptions.mapStyle
 * is a fetchable URL string, not the inline style JSON object <Map
 * mapStyle={basicStyle}> normally takes — so Martin (backend/martin-
 * config.yaml) now also publishes styles/*.json at /style/<name>, using
 * its own built-in style-source feature (confirmed via Martin's real docs,
 * not assumed) rather than standing up a separate static file server for
 * this one thing.
 */

import { OfflineManager, OfflinePack, type OfflinePackStatus, type LngLatBounds } from '@maplibre/maplibre-react-native';

// NOTE: 127.0.0.1 resolves to the host Mac from the iOS Simulator only —
// same caveat as every other *_URL constant in this app's src/*/api.ts
// files.
const MARTIN_URL = 'http://127.0.0.1:3000';

// This project's vector tiles cap out at maxzoom 16 (see mobile/README.md
// and styles/basic.json) — downloading past that would just re-request
// the same tiles MapLibre already upscales client-side, wasted storage
// for zero extra detail.
const MAX_OFFLINE_ZOOM = 16;

export type OfflineStyle = 'basic' | 'hybrid';

export function styleUrlFor(style: OfflineStyle): string {
  return `${MARTIN_URL}/style/${style}`;
}

export type PackMetadata = {
  label: string;
  style: OfflineStyle;
  createdAt: string;
};

export async function downloadArea(
  bounds: LngLatBounds,
  minZoom: number,
  style: OfflineStyle,
  label: string,
  onProgress: (status: OfflinePackStatus) => void,
  onError: (message: string) => void,
): Promise<OfflinePack> {
  const metadata: PackMetadata = { label, style, createdAt: new Date().toISOString() };
  return OfflineManager.createPack(
    {
      mapStyle: styleUrlFor(style),
      bounds,
      minZoom,
      maxZoom: MAX_OFFLINE_ZOOM,
      metadata,
    },
    (_pack, status) => onProgress(status),
    (_pack, error) => onError(error.message),
  );
}

export async function listOfflinePacks(): Promise<OfflinePack[]> {
  return OfflineManager.getPacks();
}

export async function deleteOfflinePack(id: string): Promise<void> {
  return OfflineManager.deletePack(id);
}
