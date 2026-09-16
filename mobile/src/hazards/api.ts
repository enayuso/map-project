/**
 * Crowdsourced road hazard reporting — Waze's core idea, and per
 * docs/research/10-remaining-feature-gaps.md a genuinely undocumented-
 * anywhere-digital gap for Belize (rainy-season flooding, unpaved-road
 * washouts, informal checkpoints). Talks to sharing/'s /hazards endpoints —
 * same service as location sharing and shared lists, reusing the shared
 * `belize` Postgres database rather than standing up new infrastructure.
 *
 * No accounts: creating a report returns a deleteToken, kept only on this
 * device (AsyncStorage, see myReports.ts), needed to retract it early.
 * Anyone can "confirm" (still here) a report they didn't create — that's
 * the whole point, it's a shared signal, not a private one.
 */

const SHARING_URL = 'http://127.0.0.1:8090';

export type HazardType = 'flooding' | 'washout' | 'checkpoint' | 'crash' | 'hazard';

export const HAZARD_TYPE_LABELS: Record<HazardType, string> = {
  flooding: '🌊 Flooding',
  washout: '🕳️ Washed-out road',
  checkpoint: '🚧 Checkpoint',
  crash: '💥 Crash',
  hazard: '⚠️ Other hazard',
};

/** Just the emoji, for map markers — HAZARD_TYPE_LABELS' text is for UI rows. */
export const HAZARD_TYPE_EMOJI: Record<HazardType, string> = {
  flooding: '🌊',
  washout: '🕳️',
  checkpoint: '🚧',
  crash: '💥',
  hazard: '⚠️',
};

export type HazardReport = {
  id: number;
  type: HazardType;
  lat: number;
  lon: number;
  note: string | null;
  confirmCount: number;
  reportedAt: string;
  expiresAt: string;
};

export type BBox = { minLat: number; maxLat: number; minLon: number; maxLon: number };

export async function reportHazard(
  type: HazardType,
  lat: number,
  lon: number,
  note?: string,
): Promise<{ id: number; deleteToken: string; expiresAt: string }> {
  const res = await fetch(`${SHARING_URL}/hazards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, lat, lon, note: note || undefined }),
  });
  if (!res.ok) throw new Error(`Report failed (${res.status})`);
  return res.json();
}

export async function listHazards(bbox: BBox): Promise<HazardReport[]> {
  const params = new URLSearchParams({
    min_lat: String(bbox.minLat),
    max_lat: String(bbox.maxLat),
    min_lon: String(bbox.minLon),
    max_lon: String(bbox.maxLon),
  });
  const res = await fetch(`${SHARING_URL}/hazards?${params}`);
  if (!res.ok) throw new Error(`List failed (${res.status})`);
  const body = await res.json();
  return body.hazards;
}

export async function confirmHazard(id: number): Promise<{ expiresAt: string }> {
  const res = await fetch(`${SHARING_URL}/hazards/${id}/confirm`, { method: 'POST' });
  if (!res.ok) throw new Error(`Confirm failed (${res.status})`);
  return res.json();
}

export async function deleteHazard(id: number, deleteToken: string): Promise<void> {
  const res = await fetch(
    `${SHARING_URL}/hazards/${id}?delete_token=${encodeURIComponent(deleteToken)}`,
    { method: 'DELETE' },
  );
  if (!res.ok) throw new Error(`Delete failed (${res.status})`);
}

// App Store Guideline 1.2's "mechanism to report offensive content" for
// this feature's always-live, unmoderated UGC (see sharing/README.md's
// own follow-up for the Tmap/Kakao/Naver comparison this is scaled down
// from) — anyone can report, no delete_token needed, same as confirming.
// A fixed reason set, not free text: this is a lightweight flag for a
// human to review (scripts/review_hazard_reports.py), not a complaint form.
export type HazardReportReason = 'not_here' | 'spam' | 'duplicate' | 'inappropriate';

export const HAZARD_REPORT_REASON_LABELS: Record<HazardReportReason, string> = {
  not_here: "Not here / doesn't exist",
  spam: 'Spam or test post',
  duplicate: 'Duplicate report',
  inappropriate: 'Inappropriate note text',
};

export async function reportHazardIssue(id: number, reason: HazardReportReason): Promise<void> {
  const res = await fetch(`${SHARING_URL}/hazards/${id}/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) throw new Error(`Report failed (${res.status})`);
}
