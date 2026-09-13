/**
 * State + handlers for live location sharing (see sharing/README.md for the
 * short-code, no-accounts access model). Two independent halves: sharing my
 * own position (push, on an interval) and viewing someone else's (poll, on a
 * separate interval) — a device can do either, both, or neither. Extracted
 * out of App.tsx — see src/errors/useErrorLog.ts's header comment for why.
 * `locationEnabled`/`setLocationEnabled`/`currentPosition` are parameters
 * (not owned here) since GPS is core, cross-feature state — this hook only
 * reads it (to push updates) and can turn it on (starting a share implies
 * needing a fix), not own its lifecycle.
 */
import { useEffect, useRef, useState } from 'react';
import type { useCurrentPosition } from '@maplibre/maplibre-react-native';
import { createShare, getSharedPosition, stopShare, updateShare, type SharedPosition } from './api';
import { logError } from '../errors/logger';

type CurrentPosition = ReturnType<typeof useCurrentPosition>;

export type UseSharing = {
  panelVisible: boolean;
  toggle: () => void;
  close: () => void;
  myCode: string | null;
  busy: boolean;
  error: string | null;
  startSharing: () => Promise<void>;
  stopSharing: () => void;
  viewedPosition: SharedPosition | null;
  viewingBusy: boolean;
  viewingError: string | null;
  startViewing: (rawCode: string) => Promise<void>;
  stopViewing: () => void;
};

export function useSharing(
  locationEnabled: boolean,
  setLocationEnabled: (enabled: boolean) => void,
  currentPosition: CurrentPosition,
  closeUtilityPanels: () => void,
): UseSharing {
  const [panelVisible, setPanelVisible] = useState(false);
  const [myCode, setMyCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewingCode, setViewingCode] = useState<string | null>(null);
  const [viewedPosition, setViewedPosition] = useState<SharedPosition | null>(null);
  const [viewingBusy, setViewingBusy] = useState(false);
  const [viewingError, setViewingError] = useState<string | null>(null);

  // A ref, not a direct effect dependency — currentPosition updates far more
  // often than the 15s push interval below should actually fire, and
  // depending on it directly would reset the interval's own timer on every
  // GPS tick, which could starve it from ever firing at all if fixes arrive
  // faster than 15s apart. The interval reads the *latest* position each
  // time it ticks; only myCode itself (start/stop) should recreate it.
  const currentPositionRef = useRef(currentPosition);
  useEffect(() => {
    currentPositionRef.current = currentPosition;
  }, [currentPosition]);

  useEffect(() => {
    if (!myCode) return;
    const interval = setInterval(() => {
      const pos = currentPositionRef.current;
      if (!pos) return;
      updateShare(myCode, pos.coords.latitude, pos.coords.longitude).catch(() => {
        // The share expired/was removed server-side unexpectedly — stop
        // pretending to still be sharing rather than retry forever.
        setMyCode(null);
      });
    }, 15000);
    return () => clearInterval(interval);
  }, [myCode]);

  useEffect(() => {
    if (!viewingCode) return;
    const poll = () => {
      getSharedPosition(viewingCode)
        .then(pos => {
          setViewedPosition(pos);
          setViewingError(null);
        })
        .catch(e => {
          setViewedPosition(null);
          setViewingError(e.message);
        });
    };
    poll(); // fetch immediately, don't make the viewer wait out the first interval
    const interval = setInterval(poll, 10000);
    return () => clearInterval(interval);
  }, [viewingCode]);

  const toggle = () => {
    if (panelVisible) {
      setPanelVisible(false);
    } else {
      closeUtilityPanels();
      setPanelVisible(true);
    }
  };

  const startSharing = async () => {
    if (!locationEnabled) setLocationEnabled(true);
    if (!currentPosition) {
      setError('Waiting for a GPS fix — try again in a moment.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { code } = await createShare(currentPosition.coords.latitude, currentPosition.coords.longitude);
      setMyCode(code);
    } catch (e) {
      logError('sharing:start', e);
      setError('Could not start sharing — try again.');
    } finally {
      setBusy(false);
    }
  };

  const stopSharing = () => {
    if (myCode) stopShare(myCode).catch(() => {}); // best-effort — it'll expire on its own regardless
    setMyCode(null);
  };

  const startViewing = async (rawCode: string) => {
    const code = rawCode.trim().toUpperCase();
    if (!code) return;
    setViewingBusy(true);
    setViewingError(null);
    try {
      const pos = await getSharedPosition(code);
      setViewedPosition(pos);
      setViewingCode(code);
    } catch (e) {
      logError('sharing:view', e);
      setViewingError(e instanceof Error ? e.message : 'Could not find that share.');
    } finally {
      setViewingBusy(false);
    }
  };

  const stopViewing = () => {
    setViewingCode(null);
    setViewedPosition(null);
    setViewingError(null);
  };

  return {
    panelVisible,
    toggle,
    close: () => setPanelVisible(false),
    myCode,
    busy,
    error,
    startSharing,
    stopSharing,
    viewedPosition,
    viewingBusy,
    viewingError,
    startViewing,
    stopViewing,
  };
}
