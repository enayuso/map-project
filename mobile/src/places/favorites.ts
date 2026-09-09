/**
 * Saved places + recent searches — persisted locally via AsyncStorage, no
 * backend involved. This is the other half of "tap a place, see it later"
 * that Kakao/Naver offer alongside search and category browsing: a ★ button
 * on the place card, and a recents/saved shortcut when the search box is
 * empty (see SearchBox.tsx).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SearchResult } from '../search/api';

const FAVORITES_KEY = 'belizemap:favorites';
const RECENTS_KEY = 'belizemap:recent-searches';
const MAX_RECENTS = 8;

async function readList(key: string): Promise<SearchResult[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Corrupt or missing storage shouldn't crash the app — just start fresh.
    return [];
  }
}

async function writeList(key: string, list: SearchResult[]): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(list));
  } catch {
    // Best-effort persistence; losing a save isn't worth surfacing an error
    // for on a hobby-scale local cache.
  }
}

export function getFavorites(): Promise<SearchResult[]> {
  return readList(FAVORITES_KEY);
}

export async function addFavorite(place: SearchResult): Promise<SearchResult[]> {
  const current = await readList(FAVORITES_KEY);
  if (current.some(p => p.id === place.id)) return current;
  const next = [place, ...current];
  await writeList(FAVORITES_KEY, next);
  return next;
}

export async function removeFavorite(id: string): Promise<SearchResult[]> {
  const current = await readList(FAVORITES_KEY);
  const next = current.filter(p => p.id !== id);
  await writeList(FAVORITES_KEY, next);
  return next;
}

export function getRecentSearches(): Promise<SearchResult[]> {
  return readList(RECENTS_KEY);
}

export async function addRecentSearch(place: SearchResult): Promise<SearchResult[]> {
  const current = await readList(RECENTS_KEY);
  // Move-to-front on repeat visits, rather than showing the same place twice.
  const deduped = current.filter(p => p.id !== place.id);
  const next = [place, ...deduped].slice(0, MAX_RECENTS);
  await writeList(RECENTS_KEY, next);
  return next;
}
