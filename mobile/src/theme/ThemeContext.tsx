/**
 * App-wide theme: current color scheme (light/dark) + the user's own
 * Light/Dark/System preference, following Naver Map's own real dark-mode
 * update (System/Light/Dark, plus a time-of-day auto mode we don't
 * replicate — see mobile/README.md). A single provider (mounted in
 * index.js) rather than each component independently calling
 * `useColorScheme()`, because the *preference* (did the user override the
 * system setting?) is shared app-wide state, not a per-component concern.
 *
 * Mounted inside ErrorBoundary, not outside it: if this provider itself
 * ever threw, the boundary should still catch it. The tradeoff is that
 * ErrorBoundary's own fallback UI (a class component, can't use this
 * hook) stays a fixed, non-theme-aware light color — a deliberate, narrow
 * scope cut for a screen only ever seen on a genuine crash.
 */
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { DarkColors, LightColors, type ThemeColors } from './colors';
import {
  getAppearancePreference,
  setAppearancePreference,
  type AppearancePreference,
} from './appearancePreference';

type Scheme = 'light' | 'dark';

type ThemeContextValue = {
  colors: ThemeColors;
  scheme: Scheme;
  preference: AppearancePreference;
  /** Cycles System → Light → Dark → System. Exposed as a single action
   * (not a setter) because the only UI for this is one More-menu row
   * that advances through the three states on tap — see App.tsx's
   * moreMenuItems' "appearance" entry. */
  cyclePreference: () => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  colors: LightColors,
  scheme: 'light',
  preference: 'system',
  cyclePreference: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreference] = useState<AppearancePreference>('system');

  useEffect(() => {
    getAppearancePreference().then(setPreference);
  }, []);

  const scheme: Scheme = preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;
  const colors = scheme === 'dark' ? DarkColors : LightColors;

  const cyclePreference = () => {
    const next: AppearancePreference =
      preference === 'system' ? 'light' : preference === 'light' ? 'dark' : 'system';
    setPreference(next);
    setAppearancePreference(next);
  };

  return (
    <ThemeContext.Provider value={{ colors, scheme, preference, cyclePreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
