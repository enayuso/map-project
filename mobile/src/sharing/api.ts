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

async function parseOrThrow<T>(res: Response, notFoundMessage: string): Promise<T> {
  if (res.status === 404) throw new Error(notFoundMessage);
  if (!res.ok) throw new Error(`Sharing service ${res.status}`);
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
