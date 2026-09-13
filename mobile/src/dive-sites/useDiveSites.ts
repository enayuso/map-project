/**
 * State + handlers for the dive-sites utility feature. See
 * docs/research/12-ferry-dive-site-data-sourcing.md for why this is
 * curated, hand-maintained content rather than a live feed. Extracted out
 * of App.tsx — see src/errors/useErrorLog.ts's header comment for why.
 * "Get directions to a site" stays in App.tsx, not here — it bridges to
 * the routing feature (startDirectionsTo), a cross-feature concern this
 * hook shouldn't need to know about.
 */
import { useState } from 'react';
import { fetchDiveSites, type DiveSite } from './api';

export type UseDiveSites = {
  active: boolean;
  toggle: () => void;
  close: () => void;
  sites: DiveSite[];
  loading: boolean;
  error: string | null;
};

export function useDiveSites(closeUtilityPanels: () => void): UseDiveSites {
  const [active, setActive] = useState(false);
  const [sites, setSites] = useState<DiveSite[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = () => {
    if (active) {
      setActive(false);
      return;
    }
    closeUtilityPanels();
    setActive(true);
    if (sites.length === 0) {
      setLoading(true);
      setError(null);
      fetchDiveSites()
        .then(setSites)
        .catch(() => setError('Could not load dive sites.'))
        .finally(() => setLoading(false));
    }
  };

  return { active, toggle, close: () => setActive(false), sites, loading, error };
}
