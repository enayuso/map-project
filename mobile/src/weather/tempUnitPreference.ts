/**
 * Remembers the user's °C/°F choice across app restarts — same lightweight
 * AsyncStorage-backed-single-value pattern as everything else this app
 * persists locally (favorites.ts, localLists.ts), just for one string
 * instead of a list.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TempUnit } from './api';

const KEY = 'belizemap:temp-unit';

export async function getTempUnitPreference(): Promise<TempUnit> {
  try {
    const value = await AsyncStorage.getItem(KEY);
    return value === 'F' ? 'F' : 'C'; // Celsius unless F was explicitly chosen before
  } catch {
    return 'C';
  }
}

export async function setTempUnitPreference(unit: TempUnit): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, unit);
  } catch {
    // Best-effort — losing this just means defaulting back to Celsius
    // next launch, not a real failure.
  }
}
