/**
 * State + handlers for the seasonal-highlights utility panel — same shape
 * as src/ferries/useFerries.ts and src/dive-sites/useDiveSites.ts (curated
 * content, fetched once per session, not re-fetched on every open).
 * Extracted as its own hook rather than folded into App.tsx directly — see
 * src/errors/useErrorLog.ts's header comment for why.
 */
import { useState } from 'react';
import { fetchSeasonalHighlights, type SeasonalHighlight } from './api';

export type UseSeasonalHighlights = {
  visible: boolean;
  toggle: () => void;
  close: () => void;
  highlights: SeasonalHighlight[];
  loading: boolean;
  error: string | null;
};

export function useSeasonalHighlights(closeUtilityPanels: () => void): UseSeasonalHighlights {
  const [visible, setVisible] = useState(false);
  const [highlights, setHighlights] = useState<SeasonalHighlight[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = () => {
    if (visible) {
      setVisible(false);
      return;
    }
    closeUtilityPanels();
    setVisible(true);
    if (highlights.length === 0) {
      setLoading(true);
      setError(null);
      fetchSeasonalHighlights()
        .then(setHighlights)
        .catch(() => setError('Could not load seasonal highlights.'))
        .finally(() => setLoading(false));
    }
  };

  return { visible, toggle, close: () => setVisible(false), highlights, loading, error };
}
