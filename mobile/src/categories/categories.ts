/**
 * Category quick-filter data for the Kakao/Naver-style browsing bar
 * (CategoryBar.tsx / CategoryResultsSheet.tsx).
 *
 * This is a curated subset of the full 18-category taxonomy defined in
 * scripts/build_poi_index.py's AMENITY_MAP/SHOP_MAP/TOURISM_MAP — Kakao and
 * Naver's own category bars similarly surface only a handful of common
 * categories rather than their whole internal taxonomy, so this mirrors
 * that rather than listing all 18 (the full set stays queryable from
 * search, this is just the "browse nearby" shortcut row).
 */

import type { SearchResult } from '../search/api';

export type Category = {
  key: string;
  label: string;
  emoji: string;
};

export const CATEGORIES: Category[] = [
  { key: 'restaurant', label: 'Food', emoji: '🍽️' },
  { key: 'cafe', label: 'Cafes', emoji: '☕' },
  { key: 'grocery', label: 'Grocery', emoji: '🛒' },
  { key: 'fuel', label: 'Gas', emoji: '⛽' },
  { key: 'bank_atm', label: 'Bank/ATM', emoji: '🏧' },
  { key: 'pharmacy', label: 'Pharmacy', emoji: '💊' },
  { key: 'hotel_lodging', label: 'Hotels', emoji: '🏨' },
  { key: 'attraction', label: 'Attractions', emoji: '🎡' },
  { key: 'bar', label: 'Bars', emoji: '🍺' },
  { key: 'healthcare', label: 'Health', emoji: '🏥' },
];

export function categoryLabel(key: string): string {
  return CATEGORIES.find(c => c.key === key)?.label ?? key;
}

/** A category search hit with its distance from the query center attached. */
export type NearbyResult = SearchResult & { distanceKm: number };

/** Great-circle distance in km between two points (haversine). */
export function haversineKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** "180 m" under 1km, "1.8 km" above — matches how Kakao/Naver show distance. */
export function formatDistanceKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}
