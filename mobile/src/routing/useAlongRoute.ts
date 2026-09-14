/**
 * State + handlers for "search along route" — per
 * docs/research/10-remaining-feature-gaps.md, no new backend, just
 * searchAlongRoute.ts sampling the existing route geometry and reusing
 * search/api.ts's searchNearby per sample. Extracted out of App.tsx —
 * see src/errors/useErrorLog.ts's header comment for why. `route` is a
 * parameter (not owned here) since it's core routing state this hook
 * only reads; picking a result replaces the route's destination and
 * records a recent search, both core cross-feature state, so that
 * bridge (handleSelectAlongRouteResult) stays in App.tsx.
 *
 * `wantsOpen` (not a plain `visible`) is what App.tsx feeds into
 * src/modals/useModalCoordinator.ts as this feature's "desired" signal —
 * AlongRouteSheet and RoutePanel are each their own <Modal>, and two
 * <Modal>s can't both be presented at once from the same presenting view
 * controller (confirmed directly against a real "Attempt to present
 * <RCTFabricModalHostViewController> ... which is already presenting
 * <RCTFabricModalHostViewController>" failure — see mobile/README.md's
 * "Known issues" #10). The coordinator is what actually sequences that
 * handoff now; this hook doesn't need to know RoutePanel exists at all.
 */
import { useState } from 'react';
import type { RouteResult } from './api';
import { searchAlongRoute, type AlongRouteResult } from './searchAlongRoute';
import { logError } from '../errors/logger';

export type UseAlongRoute = {
  wantsOpen: boolean;
  open: () => void;
  close: () => void;
  category: string | null;
  loading: boolean;
  error: string | null;
  results: AlongRouteResult[];
  selectCategory: (key: string) => Promise<void>;
};

export function useAlongRoute(route: RouteResult | null): UseAlongRoute {
  const [wantsOpen, setWantsOpen] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<AlongRouteResult[]>([]);

  const close = () => {
    setWantsOpen(false);
    setCategory(null);
    setResults([]);
    setError(null);
  };

  const selectCategory = async (key: string) => {
    if (!route) return;
    setCategory(key);
    setLoading(true);
    setError(null);
    try {
      const found = await searchAlongRoute(route.geometry.coordinates as [number, number][], key);
      setResults(found);
      if (found.length === 0) setError(null); // empty state has its own message, not an error
    } catch (e) {
      logError('alongRoute:search', e, { category: key });
      setResults([]);
      setError('Could not search along this route.');
    } finally {
      setLoading(false);
    }
  };

  return {
    wantsOpen,
    open: () => setWantsOpen(true),
    close,
    category,
    loading,
    error,
    results,
    selectCategory,
  };
}
