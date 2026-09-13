/**
 * State + handlers for the error-log utility panel (see logger.ts's own
 * header comment for what this is and why). Extracted out of App.tsx as
 * part of the engineering-audit-driven cleanup of that file's size (2,300+
 * lines, 90+ useState hooks across ~26 features in one component) — this
 * one and its siblings (useOfflineMaps, useWeather, etc.) are each a
 * self-contained "quick, dismissable utility overlay" block that only
 * needs to plug into App.tsx's shared closeUtilityPanels() coordinator,
 * not deeply woven into the rest of the app's state the way routing/
 * navigation/search are — mechanical extractions, not a deep rewrite.
 */
import { useState } from 'react';
import { clearErrorLog, getErrorLog, type LoggedError } from './logger';

export type UseErrorLog = {
  visible: boolean;
  entries: LoggedError[];
  toggle: () => void;
  close: () => void;
  clear: () => void;
};

export function useErrorLog(closeUtilityPanels: () => void): UseErrorLog {
  const [visible, setVisible] = useState(false);
  const [entries, setEntries] = useState<LoggedError[]>([]);

  const toggle = () => {
    if (visible) {
      setVisible(false);
    } else {
      closeUtilityPanels();
      setVisible(true);
      getErrorLog().then(setEntries);
    }
  };

  const clear = () => {
    clearErrorLog();
    setEntries([]);
  };

  return { visible, entries, toggle, close: () => setVisible(false), clear };
}
