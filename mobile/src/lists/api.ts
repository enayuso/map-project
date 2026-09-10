/**
 * Client for sharing/'s shared-list endpoints — same backend service as
 * src/sharing/api.ts (live location), a different resource: a named,
 * shareable folder of saved places, matching Naver Map's own Dec 2022
 * favorites-folder upgrade. See sharing/app/main.py's header comment for
 * the full design (short-code access, no expiry — unlike a location
 * share, a saved list isn't inherently ephemeral).
 *
 * NOTE: 127.0.0.1 resolves to the host Mac from the iOS Simulator only —
 * same caveat as every other *_URL constant in this app's per-feature
 * api.ts files.
 */

const SHARING_URL = 'http://127.0.0.1:8090';

export type ListPlace = {
  id: string;
  name: string;
  subtitle: string;
  lat: number;
  lon: number;
};

export type SharedList = {
  label: string;
  places: ListPlace[];
  updatedAt: string;
};

async function parseOrThrow<T>(res: Response, notFoundMessage: string): Promise<T> {
  if (res.status === 404) throw new Error(notFoundMessage);
  if (!res.ok) throw new Error(`Sharing service ${res.status}`);
  return res.json();
}

export async function createList(label: string, places: ListPlace[]): Promise<{ code: string }> {
  const res = await fetch(`${SHARING_URL}/lists`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label, places }),
  });
  return parseOrThrow(res, 'Could not create the list.');
}

/** Called whenever the owner's copy of the list changes locally, so a
 * viewer polling getList sees it too — matching Naver's "shared lists stay
 * live" behavior, not a one-time snapshot. */
export async function updateList(code: string, label: string, places: ListPlace[]): Promise<void> {
  const res = await fetch(`${SHARING_URL}/lists/${code}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label, places }),
  });
  await parseOrThrow(res, 'This list no longer exists.');
}

export async function getList(code: string): Promise<SharedList> {
  const res = await fetch(`${SHARING_URL}/lists/${code.trim().toUpperCase()}`);
  return parseOrThrow(res, 'No list with that code — check it and try again.');
}

export async function deleteList(code: string): Promise<void> {
  await fetch(`${SHARING_URL}/lists/${code}`, { method: 'DELETE' });
}
