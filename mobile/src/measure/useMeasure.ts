/**
 * State + handlers for the distance/area measurement tool. Confirmed
 * against live Kakao Map research (see geometry.ts's header comment):
 * their mobile app only has distance (tap points, cumulative straight-
 * line total, an X to end/clear) — area/radius are PC-only there. Built
 * here anyway per the original request, following the same tap-to-place
 * interaction for both modes since there's no mobile reference for area
 * to diverge from. Extracted out of App.tsx — see
 * src/errors/useErrorLog.ts's header comment for why.
 *
 * Measure is one of App.tsx's mutually-exclusive top-level modes (with
 * routing/meetup), so like useMeetup, this hook does NOT own its own
 * toggle — `activate`/`deactivate` are the primitives, and App.tsx's own
 * toggleMeasure bridge function calls them alongside the sibling toggles
 * (toggleRouting/toggleMeetup) and core state (closeCategoryBrowsing)
 * this feature shouldn't need to know about.
 */
import { useState } from 'react';
import type { MeasureMode } from './MeasureBar';
import { formatAreaKm2, polygonAreaKm2, polylineLengthKm, type LatLon } from './geometry';
import { formatDistanceKm } from '../categories/categories';

export type UseMeasure = {
  active: boolean;
  activate: () => void;
  deactivate: () => void;
  mode: MeasureMode;
  changeMode: (mode: MeasureMode) => void;
  points: LatLon[];
  addPoint: (lat: number, lon: number) => void;
  undo: () => void;
  clear: () => void;
  totalLabel: string;
};

export function useMeasure(): UseMeasure {
  const [active, setActive] = useState(false);
  const [mode, setMode] = useState<MeasureMode>('distance');
  const [points, setPoints] = useState<LatLon[]>([]);

  const activate = () => {
    setActive(true);
    setMode('distance');
    setPoints([]);
  };

  const deactivate = () => {
    setActive(false);
    setPoints([]);
  };

  const changeMode = (nextMode: MeasureMode) => {
    setMode(nextMode);
    setPoints([]); // a path doesn't carry over meaningfully between the two modes
  };

  const addPoint = (lat: number, lon: number) => {
    setPoints(prev => [...prev, { lat, lon }]);
  };

  const totalLabel =
    mode === 'distance' ? formatDistanceKm(polylineLengthKm(points)) : formatAreaKm2(polygonAreaKm2(points));

  return {
    active,
    activate,
    deactivate,
    mode,
    changeMode,
    points,
    addPoint,
    undo: () => setPoints(prev => prev.slice(0, -1)),
    clear: () => setPoints([]),
    totalLabel,
  };
}
