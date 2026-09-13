/**
 * State + handlers for crowdsourced road hazard reporting (Waze's core
 * idea) — per docs/research/10-remaining-feature-gaps.md, a genuinely
 * undocumented gap for Belize's flooding/washouts/checkpoints. Extracted
 * out of App.tsx — see src/errors/useErrorLog.ts's header comment for why.
 * `layerVisible` is a map *layer* (like measure's points), not a modal
 * panel — it doesn't consume taps or need to be mutually exclusive with
 * anything, so it can just stay on; `reportVisible` (the actual report
 * form) IS one of the dismissable utility overlays, so `openReport` takes
 * `closeUtilityPanels` the same way every other panel's open/toggle does.
 * `mapRef`/`currentPosition` are parameters (not owned here) since they're
 * core, cross-feature state this hook only reads.
 */
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { MapRef, useCurrentPosition } from '@maplibre/maplibre-react-native';
import {
  confirmHazard,
  deleteHazard,
  listHazards,
  reportHazard,
  type HazardReport,
  type HazardType,
} from './api';
import { addMyHazardReport, getMyHazardReports, removeMyHazardReport, type MyHazardReport } from './myReports';
import { logError } from '../errors/logger';

type CurrentPosition = ReturnType<typeof useCurrentPosition>;

export type UseHazards = {
  layerVisible: boolean;
  toggleLayer: () => void;
  list: HazardReport[];
  notifyRegionChanged: () => void;
  reportVisible: boolean;
  openReport: () => void;
  closeReport: () => void;
  reportSubmitting: boolean;
  reportError: string | null;
  submitReport: (type: HazardType, note: string) => Promise<void>;
  locationLabel: string;
  selected: HazardReport | null;
  select: (hazard: HazardReport | null) => void;
  isSelectedMine: boolean;
  confirming: boolean;
  deleting: boolean;
  confirmSelected: () => Promise<void>;
  deleteSelected: () => Promise<void>;
};

export function useHazards(
  mapRef: RefObject<MapRef | null>,
  currentPosition: CurrentPosition,
  closeUtilityPanels: () => void,
): UseHazards {
  const [layerVisible, setLayerVisible] = useState(false);
  const [list, setList] = useState<HazardReport[]>([]);
  const [reportVisible, setReportVisible] = useState(false);
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [selected, setSelected] = useState<HazardReport | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [myReports, setMyReports] = useState<MyHazardReport[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getMyHazardReports().then(setMyReports);
  }, []);

  const refresh = async () => {
    const bounds = await mapRef.current?.getBounds(); // [west, south, east, north]
    if (!bounds) return;
    const [west, south, east, north] = bounds;
    try {
      setList(await listHazards({ minLat: south, maxLat: north, minLon: west, maxLon: east }));
    } catch (e) {
      // Still not worth a user-facing error for a background layer refresh
      // — a failed refresh just leaves the previous set showing — but now
      // logged so a string of these isn't invisible (see src/errors/logger.ts).
      logError('hazards:refresh', e);
    }
  };

  const toggleLayer = () => {
    if (layerVisible) {
      setLayerVisible(false);
      setList([]);
    } else {
      setLayerVisible(true);
      refresh();
    }
  };

  // Called from App.tsx's onRegionDidChange on every map move — a short
  // debounce (same idea, same duration as SearchBox's own search debounce)
  // coalesces a flurry of small pans into one bbox refresh instead of one
  // per frame. A no-op while the layer's off.
  const notifyRegionChanged = () => {
    if (!layerVisible) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(refresh, 400);
  };

  const openReport = () => {
    closeUtilityPanels();
    setReportVisible(true);
    setReportError(null);
  };

  const submitReport = async (type: HazardType, note: string) => {
    let point: { lat: number; lon: number } | null = null;
    if (currentPosition) {
      point = { lat: currentPosition.coords.latitude, lon: currentPosition.coords.longitude };
    } else {
      const center = await mapRef.current?.getCenter();
      if (center) point = { lat: center[1], lon: center[0] };
    }
    if (!point) {
      setReportError('Could not determine a location.');
      return;
    }
    setReportSubmitting(true);
    setReportError(null);
    try {
      const res = await reportHazard(type, point.lat, point.lon, note || undefined);
      await addMyHazardReport({ id: res.id, deleteToken: res.deleteToken });
      setMyReports(prev => [{ id: res.id, deleteToken: res.deleteToken }, ...prev]);
      setReportVisible(false);
      if (!layerVisible) setLayerVisible(true);
      refresh();
    } catch (e) {
      logError('hazards:report', e, { type });
      setReportError('Could not submit report — try again.');
    } finally {
      setReportSubmitting(false);
    }
  };

  const confirmSelected = async () => {
    if (!selected) return;
    setConfirming(true);
    try {
      await confirmHazard(selected.id);
      setSelected(null);
      refresh();
    } catch (e) {
      // Still leave the card open on failure — the user can just try
      // again — but now logged (see src/errors/logger.ts).
      logError('hazards:confirm', e);
    } finally {
      setConfirming(false);
    }
  };

  const deleteSelected = async () => {
    if (!selected) return;
    const mine = myReports.find(r => r.id === selected.id);
    if (!mine) return;
    setDeleting(true);
    try {
      await deleteHazard(selected.id, mine.deleteToken);
      await removeMyHazardReport(selected.id);
      setMyReports(prev => prev.filter(r => r.id !== selected.id));
      setSelected(null);
      refresh();
    } catch (e) {
      // Still leave the card open on failure — the user can just try
      // again — but now logged (see src/errors/logger.ts).
      logError('hazards:delete', e);
    } finally {
      setDeleting(false);
    }
  };

  return {
    layerVisible,
    toggleLayer,
    list,
    notifyRegionChanged,
    reportVisible,
    openReport,
    closeReport: () => setReportVisible(false),
    reportSubmitting,
    reportError,
    submitReport,
    locationLabel: currentPosition ? 'at your current location' : 'at the center of the map',
    selected,
    select: setSelected,
    isSelectedMine: !!selected && myReports.some(r => r.id === selected.id),
    confirming,
    deleting,
    confirmSelected,
    deleteSelected,
  };
}
