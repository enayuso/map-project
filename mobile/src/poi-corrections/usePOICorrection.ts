/**
 * State + handlers for reporting a POI correction — Tier 2 of docs/
 * research/11-kakao-naver-poi-data-sourcing.md (see api.ts's own header
 * comment: a moderation queue, not a live write). Extracted out of
 * App.tsx — see src/errors/useErrorLog.ts's header comment for why.
 * `target` is a separate snapshot from `selectedPlace`, not a reference
 * to it, since opening the sheet closes the place card (the same "one
 * bottom sheet at a time" pattern as elsewhere in the app) — by the time
 * the sheet needs to know what it's reporting on, `selectedPlace` would
 * already be null. `open` takes the place as an argument rather than
 * reading `selectedPlace` itself, so App.tsx's bridge (which also needs
 * to null out `selectedPlace`) stays the one place that decides what
 * "opening this" means for the rest of the app.
 */
import { useState } from 'react';
import { Alert } from 'react-native';
import { submitPOICorrection, type CorrectionField } from './api';
import { logError } from '../errors/logger';
import type { SearchResult } from '../search/api';

export type UsePOICorrection = {
  target: SearchResult | null;
  open: (place: SearchResult) => void;
  close: () => void;
  submitting: boolean;
  error: string | null;
  submit: (field: CorrectionField, suggestedValue: string, note: string) => Promise<void>;
};

export function usePOICorrection(): UsePOICorrection {
  const [target, setTarget] = useState<SearchResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (field: CorrectionField, suggestedValue: string, note: string) => {
    if (!target) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitPOICorrection({
        poiId: target.id.replace(/^poi-/, ''),
        poiName: target.name,
        field,
        currentValue: field === 'name' ? target.name : undefined,
        suggestedValue: suggestedValue || undefined,
        note: note || undefined,
      });
      setTarget(null);
      Alert.alert('Thanks!', "Your report was submitted — someone will review it before anything changes.");
    } catch (e) {
      logError('poiCorrection:submit', e, { field });
      setError('Could not submit — try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return {
    target,
    open: setTarget,
    close: () => setTarget(null),
    submitting,
    error,
    submit,
  };
}
