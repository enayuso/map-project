/**
 * The full 18-category taxonomy (scripts/build_poi_index.py's
 * AMENITY_MAP/SHOP_MAP/TOURISM_MAP), for the Add/Edit Place form's category
 * picker. Deliberately separate from src/categories/categories.ts's
 * CATEGORIES — that's a curated ~10-category subset for the quick-filter
 * browsing bar; this needs every real category a place could actually be,
 * since you're picking the *correct* one, not a common shortcut.
 */

export type CategoryOption = { key: string; label: string };

export const ALL_CATEGORIES: CategoryOption[] = [
  { key: 'restaurant', label: 'Restaurant' },
  { key: 'cafe', label: 'Cafe' },
  { key: 'bar', label: 'Bar' },
  { key: 'grocery', label: 'Grocery' },
  { key: 'shop', label: 'Shop' },
  { key: 'hotel_lodging', label: 'Hotel/Lodging' },
  { key: 'attraction', label: 'Attraction' },
  { key: 'bank_atm', label: 'Bank/ATM' },
  { key: 'pharmacy', label: 'Pharmacy' },
  { key: 'healthcare', label: 'Healthcare' },
  { key: 'school', label: 'School' },
  { key: 'fuel', label: 'Gas Station' },
  { key: 'parking', label: 'Parking' },
  { key: 'transport', label: 'Transport' },
  { key: 'worship', label: 'Place of Worship' },
  { key: 'government', label: 'Government' },
  { key: 'dive_watersports', label: 'Dive/Watersports' },
  { key: 'other', label: 'Other' },
];
