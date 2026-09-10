/**
 * Local record of which shared lists *this device created* — the actual
 * list content lives on the sharing/ service (see api.ts), addressed by
 * code; this is just "which codes are mine, so I can find/edit/delete them
 * again later," the same role favorites.ts's AsyncStorage plays for plain
 * favorites, kept as its own file since this is a genuinely different
 * concern (bookkeeping for something shared, not the shared content
 * itself).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export type LocalList = {
  code: string;
  label: string;
  placeIds: string[];
};

const KEY = 'belizemap:shared-lists';

async function readLists(): Promise<LocalList[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeLists(lists: LocalList[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(lists));
  } catch {
    // Best-effort — losing this just means re-discovering an already-
    // shared list's code isn't possible locally, not data loss on the
    // server side.
  }
}

export function getLocalLists(): Promise<LocalList[]> {
  return readLists();
}

export async function addLocalList(list: LocalList): Promise<LocalList[]> {
  const current = await readLists();
  const next = [list, ...current];
  await writeLists(next);
  return next;
}

export async function updateLocalList(code: string, updates: Partial<Omit<LocalList, 'code'>>): Promise<LocalList[]> {
  const current = await readLists();
  const next = current.map(l => (l.code === code ? { ...l, ...updates } : l));
  await writeLists(next);
  return next;
}

export async function removeLocalList(code: string): Promise<LocalList[]> {
  const current = await readLists();
  const next = current.filter(l => l.code !== code);
  await writeLists(next);
  return next;
}
