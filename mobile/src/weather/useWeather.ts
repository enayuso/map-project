/**
 * State + handlers for the weather utility panel — low-effort polish, not
 * a functional gap (see docs/research/09-kakao-naver-feature-audit.md).
 * Extracted out of App.tsx — see src/errors/useErrorLog.ts's header
 * comment for why. The iOS home-screen widget's own data-sync effect
 * (App.tsx) reads this hook's `weather`/`tempUnit` alongside the separate
 * favorites feature's own state, so it stays in App.tsx rather than living
 * in here — it's a cross-feature concern, not this feature's own.
 */
import { useEffect, useState, type RefObject } from 'react';
import type { MapRef } from '@maplibre/maplibre-react-native';
import { fetchCurrentWeather, type CurrentWeather, type TempUnit } from './api';
import { getTempUnitPreference, setTempUnitPreference } from './tempUnitPreference';
import { logError } from '../errors/logger';

export type UseWeather = {
  visible: boolean;
  toggle: () => void;
  close: () => void;
  loading: boolean;
  weather: CurrentWeather | null;
  error: string | null;
  tempUnit: TempUnit;
  toggleTempUnit: () => void;
  refresh: () => Promise<void>;
};

export function useWeather(mapRef: RefObject<MapRef | null>, closeUtilityPanels: () => void): UseWeather {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [weather, setWeather] = useState<CurrentWeather | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tempUnit, setTempUnit] = useState<TempUnit>('C');

  useEffect(() => {
    getTempUnitPreference().then(setTempUnit);
  }, []);

  const toggleTempUnit = () => {
    const next: TempUnit = tempUnit === 'C' ? 'F' : 'C';
    setTempUnit(next);
    setTempUnitPreference(next);
  };

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const center = await mapRef.current?.getCenter();
      if (!center) throw new Error('no map center');
      const [lon, lat] = center;
      setWeather(await fetchCurrentWeather(lat, lon));
    } catch (e) {
      logError('weather:refresh', e);
      setWeather(null);
      setError('Could not check the weather — try again.');
    } finally {
      setLoading(false);
    }
  };

  const toggle = () => {
    if (visible) {
      setVisible(false);
    } else {
      closeUtilityPanels();
      setVisible(true);
      refresh();
    }
  };

  return { visible, toggle, close: () => setVisible(false), loading, weather, error, tempUnit, toggleTempUnit, refresh };
}
