/**
 * Lightweight local error/crash log — the engineering-audit finding this
 * answers: the app had zero error visibility once shipped (no console
 * logging anywhere, no crash reporting, several catch blocks that silently
 * swallowed failures with just a code comment). This is deliberately NOT a
 * remote crash-reporting service (Sentry etc.) — that needs its own
 * account/DSN, and is a reasonable next step, not this one. What this
 * *does* give: every caught error, plus every render error the new
 * ErrorBoundary (./ErrorBoundary.tsx) catches, gets a structured
 * console.error (visible in Xcode/simctl device logs during development,
 * the same way this project's native crashes have been debugged all
 * along) AND a copy persisted locally (AsyncStorage, capped ring buffer),
 * viewable/shareable from More > 🐞 Error log (./ErrorLogPanel.tsx) — so a
 * solo dev can ask a beta tester to export a real report without needing
 * their device in hand.
 *
 * Only catches JS-level errors. A native crash (like the offline-maps one
 * fixed earlier this session) happens below the JS bridge and never
 * reaches this at all — that still needs Xcode's own crash reports, or a
 * native crash-reporting SDK, to capture.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const LOG_KEY = 'belizemap:error-log';
const MAX_ENTRIES = 100;

export type LoggedError = {
  timestamp: string;
  scope: string;
  message: string;
  stack?: string;
  extra?: Record<string, unknown>;
};

// Simple in-memory cache so repeated logError() calls in one session don't
// each re-read AsyncStorage. Best-effort, not race-free — two logError()
// calls firing before the first read resolves could clobber each other's
// write. Acceptable for a local debug log (same "best-effort persistence"
// tradeoff src/places/favorites.ts already makes); not worth a write queue
// for this.
let cache: LoggedError[] | null = null;

async function readLog(): Promise<LoggedError[]> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(LOG_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    cache = Array.isArray(parsed) ? parsed : [];
  } catch {
    cache = [];
  }
  return cache;
}

async function writeLog(entries: LoggedError[]): Promise<void> {
  cache = entries;
  try {
    await AsyncStorage.setItem(LOG_KEY, JSON.stringify(entries));
  } catch {
    // This *is* the error logger — it shouldn't be able to throw its own
    // visible errors just because storage failed to persist one entry.
  }
}

/**
 * Logs an error: always to the console, best-effort to the persisted
 * local log. Fire-and-forget — never awaited, never throws — so it's safe
 * to drop into any catch block without changing that block's own control
 * flow or error-handling behavior.
 */
export function logError(scope: string, error: unknown, extra?: Record<string, unknown>): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  console.error(`[${scope}]`, message, extra ?? '');

  const entry: LoggedError = { timestamp: new Date().toISOString(), scope, message, stack, extra };
  readLog()
    .then(current => writeLog([entry, ...current].slice(0, MAX_ENTRIES)))
    .catch(() => {
      // See writeLog's own comment above.
    });
}

export function getErrorLog(): Promise<LoggedError[]> {
  return readLog();
}

export async function clearErrorLog(): Promise<void> {
  await writeLog([]);
}
