/**
 * State + handlers for the ferry-schedules utility panel. See
 * docs/research/12-ferry-dive-site-data-sourcing.md for why this is
 * curated, hand-maintained content (fetched once per session, not
 * re-fetched on every open) rather than a live feed. Extracted out of
 * App.tsx — see src/errors/useErrorLog.ts's header comment for why.
 */
import { useState } from 'react';
import { fetchFerryRoutes, type FerryRoute } from './api';

export type UseFerries = {
  visible: boolean;
  toggle: () => void;
  close: () => void;
  routes: FerryRoute[];
  loading: boolean;
  error: string | null;
};

export function useFerries(closeUtilityPanels: () => void): UseFerries {
  const [visible, setVisible] = useState(false);
  const [routes, setRoutes] = useState<FerryRoute[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = () => {
    if (visible) {
      setVisible(false);
      return;
    }
    closeUtilityPanels();
    setVisible(true);
    if (routes.length === 0) {
      setLoading(true);
      setError(null);
      fetchFerryRoutes()
        .then(setRoutes)
        .catch(() => setError('Could not load ferry routes.'))
        .finally(() => setLoading(false));
    }
  };

  return { visible, toggle, close: () => setVisible(false), routes, loading, error };
}
