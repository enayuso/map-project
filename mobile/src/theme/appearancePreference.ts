/**
 * Remembers the user's Light/Dark/System choice across app restarts —
 * same lightweight AsyncStorage-backed-single-value pattern as everything
 * else this app persists locally (favorites.ts, localLists.ts,
 * tempUnitPreference.ts).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type AppearancePreference = 'system' | 'light' | 'dark';

const KEY = 'belizemap:appearance';

export async function getAppearancePreference(): Promise<AppearancePreference> {
  try {
    const value = await AsyncStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

export async function setAppearancePreference(pref: AppearancePreference): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, pref);
  } catch {
    // Best-effort — losing this just means defaulting back to System next
    // launch, not a real failure.
  }
}
