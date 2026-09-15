/**
 * Persists the profile session token across app restarts — same
 * lightweight AsyncStorage-backed-single-value pattern as everything else
 * this app persists locally (theme/appearancePreference.ts, favorites.ts).
 *
 * This token is a bearer secret (see sharing/README.md's Profile section):
 * anyone holding it can act as this user against the sharing/ service.
 * AsyncStorage, not Keychain, for the same reason every other per-device
 * secret in this app (nothing else needed real auth until now) has used
 * AsyncStorage — this app has no existing Keychain dependency to build on,
 * and adding one is a real tradeoff (another native module) worth making
 * deliberately, not as a side effect of this feature. Worth revisiting if
 * this app ever handles something more sensitive than a map-app profile.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'belizemap:profile-session-token';

export async function getStoredSessionToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export async function setStoredSessionToken(token: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, token);
  } catch {
    // Best-effort — losing this just means being signed out next launch,
    // not a real failure (the user can just sign in again).
  }
}

export async function clearStoredSessionToken(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // Best-effort, same reasoning as above.
  }
}
