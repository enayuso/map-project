/**
 * iOS Spotlight search integration — per
 * docs/research/10-remaining-feature-gaps.md, favorites/recents show up
 * in the system-wide Spotlight search (swipe down on the home screen);
 * tapping one jumps straight to that place, cold-launch or not. Extracted
 * out of App.tsx — see src/errors/useErrorLog.ts's header comment for
 * why. Unlike the other extracted features, this one owns no state of
 * its own — it's two effects bridging `favorites`/`recentSearches` (core
 * state) out to the native index, and a native selection back in to
 * `selectedPlace`/the camera (also core) — so every dependency is a
 * parameter rather than something this hook manages.
 */
import { useEffect } from 'react';
import type { RefObject } from 'react';
import type { CameraRef } from '@maplibre/maplibre-react-native';
import { indexSpotlightItems, subscribeToSpotlightSelection } from './api';
import type { SearchResult } from '../search/api';

export function useSpotlight(
  favorites: SearchResult[],
  recentSearches: SearchResult[],
  setSelectedPlace: (place: SearchResult) => void,
  recordRecentSearch: (place: SearchResult) => void,
  cameraRef: RefObject<CameraRef | null>,
): void {
  useEffect(() => {
    // A plain keyed object, not `Map` — this file already imports MapLibre's
    // own `Map` React component under that exact name, which shadows the
    // built-in JS Map class.
    const deduped: Record<string, SearchResult> = {};
    // Favorites first — a deliberately saved place is more worth surfacing
    // in Spotlight than something merely searched once.
    [...favorites, ...recentSearches].forEach(item => {
      deduped[item.id] = item;
    });
    indexSpotlightItems(Object.values(deduped));
  }, [favorites, recentSearches]);

  useEffect(() => {
    const unsubscribe = subscribeToSpotlightSelection(id => {
      const match = [...favorites, ...recentSearches].find(item => item.id === id);
      if (!match) return; // stale index entry (e.g. a favorite since removed) — nothing to jump to
      setSelectedPlace(match);
      recordRecentSearch(match);
      cameraRef.current?.flyTo({ center: [match.lon, match.lat], zoom: 16, duration: 1200 });
    });
    return unsubscribe;
    // setSelectedPlace/cameraRef/recordRecentSearch are all stable
    // identities (a useState setter, a useRef object, and a useCallback'd
    // function in App.tsx), so listing them here doesn't cause any extra
    // resubscribing beyond what favorites/recentSearches changing already does.
  }, [favorites, recentSearches, setSelectedPlace, recordRecentSearch, cameraRef]);
}
