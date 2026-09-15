/**
 * Client for sharing/'s location-sharing REST API — see that directory's
 * own README for the full design (short-code access model, sliding
 * expiry). This file is deliberately thin: it's a 1:1 wrapper over four
 * endpoints, no client-side logic beyond that.
 *
 * NOTE: 127.0.0.1 resolves to the host Mac from the iOS Simulator only —
 * same caveat as src/search/api.ts and src/routing/api.ts.
 */

const SHARING_URL = 'http://127.0.0.1:8090';

export type ShareInfo = {
  code: string;
  expiresAt: string;
};

export type SharedPosition = {
  lat: number;
  lon: number;
  label: string | null;
  updatedAt: string;
  expiresAt: string;
};

/**
 * Thrown for any non-404 non-2xx response, carrying the real HTTP status —
 * found in review: every current caller against this rate-limited service
 * (useMeetup.ts's live-share poll, useSharing.ts's push interval and view
 * poll) needs to tell "the shared-service rate limit was hit this tick" (a
 * 429, worth a quiet retry) apart from "this share is actually gone." A
 * plain `Error('Sharing service 429')` made each caller re-derive that by
 * string-matching a message this file happens to format a certain way — one
 * caller had it, the other two didn't, so the exact bug this class exists
 * to prevent was already live in two-thirds of the pollers hitting this
 * endpoint. A typed status fixes it at the one place that should own it.
 */
export class SharingHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'SharingHttpError';
    this.status = status;
  }
}

async function parseOrThrow<T>(res: Response, notFoundMessage: string): Promise<T> {
  if (res.status === 404) throw new Error(notFoundMessage);
  if (!res.ok) throw new SharingHttpError(res.status, `Sharing service ${res.status}`);
  return res.json();
}

export async function createShare(
  lat: number,
  lon: number,
  label?: string,
): Promise<ShareInfo> {
  const res = await fetch(`${SHARING_URL}/shares`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lon, label }),
  });
  return parseOrThrow(res, 'Could not start sharing.');
}

export async function updateShare(code: string, lat: number, lon: number): Promise<void> {
  const res = await fetch(`${SHARING_URL}/shares/${code}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lon }),
  });
  await parseOrThrow(res, 'This share has ended or expired.');
}

export async function getSharedPosition(code: string): Promise<SharedPosition> {
  const res = await fetch(`${SHARING_URL}/shares/${code.trim().toUpperCase()}`);
  return parseOrThrow(res, 'No active share with that code — check it and try again.');
}

export async function stopShare(code: string): Promise<void> {
  await fetch(`${SHARING_URL}/shares/${code}`, { method: 'DELETE' });
}
