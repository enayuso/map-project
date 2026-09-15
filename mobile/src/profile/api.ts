/**
 * Client for sharing/'s profile endpoints — see sharing/README.md's
 * Profile section and docs/research/14-naver-kakao-profile-systems.md for
 * the full design (Sign in with Apple only, a profile keyed by Apple's own
 * stable per-app user id, an opaque bearer session token for every request
 * after the initial sign-in).
 *
 * NOTE: 127.0.0.1 resolves to the host Mac from the iOS Simulator only —
 * same caveat as every other *_URL constant in this app's per-feature
 * api.ts files.
 */

const SHARING_URL = 'http://127.0.0.1:8090';

export type Profile = {
  nickname: string;
  avatarEmoji: string;
  memberSince: string;
};

/** A small, fixed set of Belize-themed emoji avatars — mirrors
 * sharing/app/main.py's own AVATAR_EMOJI_CHOICES, which is the actual
 * source of truth (PUT /profile rejects anything not in its own copy of
 * this list regardless of what this one says). Duplicated rather than
 * fetched from the server because it's a short, rarely-changing UI
 * constant, not user data — same tradeoff this app already makes for
 * MeetupPanel.tsx's PARTICIPANT_COLORS. */
export const AVATAR_EMOJI_CHOICES = ['🧭', '🐢', '🦜', '🦞', '🐬', '🌴', '🏝️', '⛵', '🦋', '🐆'] as const;

/** Thrown specifically for a 401 — distinct from a plain network/server
 * error so callers (useProfile.ts) can tell "this session is no longer
 * valid, clear it and show signed-out" apart from "the request failed,
 * try again later without losing the session." */
export class ProfileAuthError extends Error {}

async function parseOrThrow<T>(res: Response): Promise<T> {
  if (res.status === 401) throw new ProfileAuthError('Signed out');
  if (!res.ok) throw new Error(`Profile service ${res.status}`);
  return res.json();
}

function authHeaders(sessionToken: string): Record<string, string> {
  return { Authorization: `Bearer ${sessionToken}` };
}

export async function signInWithAppleIdentityToken(
  identityToken: string,
): Promise<{ sessionToken: string; profile: Profile }> {
  const res = await fetch(`${SHARING_URL}/auth/apple`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identityToken }),
  });
  return parseOrThrow(res);
}

export async function fetchProfile(sessionToken: string): Promise<Profile> {
  const res = await fetch(`${SHARING_URL}/profile`, { headers: authHeaders(sessionToken) });
  return parseOrThrow(res);
}

export async function updateProfile(
  sessionToken: string,
  updates: { nickname?: string; avatarEmoji?: string },
): Promise<Profile> {
  const res = await fetch(`${SHARING_URL}/profile`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders(sessionToken) },
    body: JSON.stringify(updates),
  });
  return parseOrThrow(res);
}

export async function signOutSession(sessionToken: string): Promise<void> {
  // Best-effort — clearing the *local* session (sessionStorage.ts +
  // useProfile's own state) is what actually signs the device out from
  // the user's point of view; telling the server to drop its copy of the
  // token is tidy-up, not something worth blocking or erroring on if the
  // network happens to be down right when the user taps "Sign out."
  try {
    await fetch(`${SHARING_URL}/auth/session`, { method: 'DELETE', headers: authHeaders(sessionToken) });
  } catch {
    // Ignored — see above.
  }
}

export async function deleteAccount(sessionToken: string): Promise<void> {
  const res = await fetch(`${SHARING_URL}/profile`, { method: 'DELETE', headers: authHeaders(sessionToken) });
  await parseOrThrow(res);
}
