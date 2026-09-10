/**
 * Local record of which hazard reports *this device created* — mirrors
 * src/lists/localLists.ts's role exactly, just for hazard reports' own
 * bearer secret (deleteToken) instead of a list's access code. Needed
 * because sharing/'s DELETE /hazards/{id} requires that token and nothing
 * else identifies "mine" — there are no accounts.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export type MyHazardReport = {
  id: number;
  deleteToken: string;
};

const KEY = 'belizemap:my-hazard-reports';

async function readReports(): Promise<MyHazardReport[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeReports(reports: MyHazardReport[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(reports));
  } catch {
    // Best-effort — worst case this device just can't retract its own old
    // report anymore locally; the report itself still expires normally.
  }
}

export function getMyHazardReports(): Promise<MyHazardReport[]> {
  return readReports();
}

export async function addMyHazardReport(report: MyHazardReport): Promise<void> {
  const current = await readReports();
  await writeReports([report, ...current]);
}

export async function removeMyHazardReport(id: number): Promise<void> {
  const current = await readReports();
  await writeReports(current.filter(r => r.id !== id));
}
