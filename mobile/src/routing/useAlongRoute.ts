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
 * `hidingRoutePanel`/`onRoutePanelDismissed`/`onSheetDismissed` exist for one
 * reason: AlongRouteSheet and RoutePanel are each their own <Modal>, and two
 * <Modal>s can't both be presented at once from the same presenting view
 * controller — confirmed directly against the real failure, not guessed:
 * opening this sheet while RoutePanel was still up logged "Attempt to
 * present <RCTFabricModalHostViewController> ... which is already
 * presenting <RCTFabricModalHostViewController>" in the native (os_log)
 * console, and the second Modal silently never appeared — `visible` here
 * was genuinely true the whole time, confirmed by rendering a plain,
 * non-Modal debug marker off of it directly. (An earlier version of this
 * fix assumed a *different* bug — the same-tap backdrop race documented in
 * SearchBox.tsx's openResults/dismiss — since the symptom looked identical
 * from the outside; that was wrong, caught by actually testing the fix
 * live rather than trusting the pattern-match to the documented bug.)
 *
 * The real fix: treat the two Modals as mutually exclusive, handed off via
 * each one's onDismiss (iOS-only, fires once the dismiss *animation* has
 * actually finished — not just when `visible` flips, which is what makes
 * this reliable instead of guessing at a delay). open() asks App.tsx to
 * hide RoutePanel (via `hidingRoutePanel`); only once RoutePanel's Modal
 * reports back via onRoutePanelDismissed do we actually set our own
 * `visible` true, so our Modal only ever tries to present once the
 * previous one has genuinely finished clearing the way. close() is the
 * mirror image: hide our own Modal first, and only restore RoutePanel
 * (clearing `hidingRoutePanel`) once onSheetDismissed confirms ours is
 * fully gone too.
 */
import { useState } from 'react';
import type { RouteResult } from './api';
import { searchAlongRoute, type AlongRouteResult } from './searchAlongRoute';
import { logError } from '../errors/logger';

export type UseAlongRoute = {
  visible: boolean;
  // App.tsx ANDs this into RoutePanel's own `visible` prop, and wires
  // onRoutePanelDismissed to RoutePanel's onDismiss.
  hidingRoutePanel: boolean;
  open: () => void;
  close: () => void;
  onRoutePanelDismissed: () => void;
  onSheetDismissed: () => void;
  category: string | null;
  loading: boolean;
  error: string | null;
  results: AlongRouteResult[];
  selectCategory: (key: string) => Promise<void>;
};

export function useAlongRoute(route: RouteResult | null): UseAlongRoute {
  const [visible, setVisible] = useState(false);
  const [hidingRoutePanel, setHidingRoutePanel] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<AlongRouteResult[]>([]);

  const open = () => {
    // Don't present yet — wait for confirmation that RoutePanel's Modal has
    // actually finished getting out of the way (onRoutePanelDismissed).
    setHidingRoutePanel(true);
  };

  const onRoutePanelDismissed = () => {
    // Guard against reacting to RoutePanel dismissing for some unrelated
    // reason (e.g. the route itself was cleared) — only reveal our own
    // Modal if we're the one who asked RoutePanel to hide.
    if (hidingRoutePanel) setVisible(true);
  };

  const close = () => {
    setVisible(false);
  };

  const onSheetDismissed = () => {
    // Only now is it safe for RoutePanel to re-present.
    setHidingRoutePanel(false);
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
    visible,
    hidingRoutePanel,
    open,
    close,
    onRoutePanelDismissed,
    onSheetDismissed,
    category,
    loading,
    error,
    results,
    selectCategory,
  };
}
