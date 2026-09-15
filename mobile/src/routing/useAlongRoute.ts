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
  // Fed to the sheet's own <Modal onDismiss> alongside the coordinator's
  // own onDismiss (App.tsx composes both) — see onDismissed's own doc
  // comment for why the content reset waits for this instead of running
  // synchronously inside close().
  onDismissed: () => void;
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

  // Only asks the coordinator to start hiding — deliberately does NOT reset
  // category/results/error itself. AlongRouteSheet's <Modal> uses
  // animationType="slide" (a real, non-instant transition), so clearing
  // its content here would flash the sheet back to "nothing selected yet"
  // while it's still visibly sliding off screen. The previous, pre-
  // coordinator version of this hook deferred exactly this reset until
  // onSheetDismissed (fired only once the dismiss animation had actually
  // finished) — found missing during a review of the coordinator
  // generalization that replaced it, confirmed as a real regression (not
  // just a guess) by checking AlongRouteSheet.tsx's own animationType.
  // onDismissed below restores that deferral, generalized to work with
  // any coordinator-driven dismiss rather than the old bespoke handoff.
  const close = () => {
    setWantsOpen(false);
  };

  const onDismissed = () => {
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
    onDismissed,
    category,
    loading,
    error,
    results,
    selectCategory,
  };
}
