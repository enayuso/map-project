/**
 * Client for sharing/'s profile endpoints — see sharing/README.md's
 * Profile section and docs/research/14-naver-kakao-profile-systems.md for
 * the full design. Two sign-in methods, both optional per profile: email +
 * password (this app's own first-party account system) and Sign in with
 * Apple (needs the paid Apple Developer Program membership to actually
 * enable the capability — not available on a free account, which is why
 * email/password exists at all). Either way, every request after signing
 * in carries an opaque bearer session token.
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
  /** Always true for a Sign in with Apple profile (nothing to verify —
   * this service never even sees an email for one) — only meaningfully
   * false right after an email/password signup, until the code sent to
   * that address is entered. */
  emailVerified: boolean;
};

export type SignedIn = { sessionToken: string; profile: Profile };

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

/** Sign-up/log-in/verify-email specifically need the server's own human-
 * readable message (a duplicate email, an incorrect password, an
 * incorrect verification code) shown directly to the user, not folded
 * into a generic "Profile service 409" — FastAPI's error body is either
 * `{detail: string}` (a plain HTTPException, e.g. "Incorrect email or
 * password") or `{detail: [{msg: string, ...}, ...]}` (a Pydantic
 * validation failure, e.g. a too-short password) — this normalizes
 * either shape to one message string. */
async function extractErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body.detail === 'string') return body.detail;
    if (Array.isArray(body.detail) && typeof body.detail[0]?.msg === 'string') return body.detail[0].msg;
  } catch {
    // Response body wasn't JSON (or was empty) — fall back to the caller's
    // generic message below rather than throwing a second error here.
  }
  return fallback;
}

async function parseAuthResponse(res: Response): Promise<SignedIn> {
  if (res.ok) return res.json();
  throw new Error(await extractErrorMessage(res, `Could not complete that (${res.status}).`));
}

function authHeaders(sessionToken: string): Record<string, string> {
  return { Authorization: `Bearer ${sessionToken}` };
}

export async function signUpWithEmail(email: string, password: string): Promise<SignedIn> {
  const res = await fetch(`${SHARING_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return parseAuthResponse(res);
}

export async function logInWithEmail(email: string, password: string): Promise<SignedIn> {
  const res = await fetch(`${SHARING_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return parseAuthResponse(res);
}

export async function signInWithAppleIdentityToken(identityToken: string): Promise<SignedIn> {
  const res = await fetch(`${SHARING_URL}/auth/apple`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identityToken }),
  });
  return parseAuthResponse(res);
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

export async function verifyEmailCode(sessionToken: string, code: string): Promise<void> {
  const res = await fetch(`${SHARING_URL}/auth/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(sessionToken) },
    body: JSON.stringify({ code }),
  });
  if (res.status === 401) throw new ProfileAuthError('Signed out');
  if (!res.ok) throw new Error(await extractErrorMessage(res, `Could not verify that code (${res.status}).`));
}

export async function resendVerificationCode(sessionToken: string): Promise<void> {
  const res = await fetch(`${SHARING_URL}/auth/resend-verification`, {
    method: 'POST',
    headers: authHeaders(sessionToken),
  });
  if (res.status === 401) throw new ProfileAuthError('Signed out');
  if (!res.ok) throw new Error(await extractErrorMessage(res, `Could not resend the code (${res.status}).`));
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
