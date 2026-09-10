/**
 * Tier 2 of docs/research/11-kakao-naver-poi-data-sourcing.md's two-tier
 * model — anyone can suggest a correction to an existing POI, but nothing
 * publishes automatically. Submissions land in sharing/'s poi_corrections
 * queue and only reach the real Typesense pois index after a human
 * reviews them (see scripts/review_poi_corrections.py) — mirroring how
 * Kakao/Naver's own "suggest an edit" flow is a moderation queue, not a
 * live write.
 *
 * Deliberately scoped to CORRECTIONS on existing POIs only, not
 * suggesting brand-new places — this project has a standing decision to
 * not build in-app place-adding (waiting on BNSDI).
 */

const SHARING_URL = 'http://127.0.0.1:8090';

export type CorrectionField = 'name' | 'category' | 'closed' | 'other';

export async function submitPOICorrection(params: {
  poiId: string;
  poiName: string;
  field: CorrectionField;
  currentValue?: string;
  suggestedValue?: string;
  note?: string;
}): Promise<{ id: number }> {
  const res = await fetch(`${SHARING_URL}/poi-corrections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      poi_id: params.poiId,
      poi_name: params.poiName,
      field: params.field,
      current_value: params.currentValue,
      suggested_value: params.suggestedValue,
      note: params.note,
    }),
  });
  if (!res.ok) throw new Error(`Submit failed (${res.status})`);
  return res.json();
}
