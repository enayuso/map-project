/**
 * JS side of the Live Activity/Dynamic Island integration — per docs/
 * research/10-remaining-feature-gaps.md, the single most "Kakao/Naver
 * literally cannot do this" feature available, since Live Activities are
 * iOS-only. Talks to ios/BelizeMap/LiveActivityModule.swift, which starts/
 * updates/ends an ActivityKit activity mirroring whatever this app's own
 * live-navigation state (App.tsx's route/currentManeuverIndex) already is
 * — this module never reads navigation state back, it's a pure one-way
 * mirror driven by the existing turn-by-turn logic in navigation.ts.
 *
 * A no-op (never throws) wherever the native module isn't present — older
 * iOS, or a non-iOS/test environment — since this is pure polish layered
 * on top of turn-by-turn navigation that works perfectly well without it.
 */

import { NativeModules, Platform } from 'react-native';

const { LiveActivityModule } = NativeModules;

export type LiveActivityUpdate = {
  nextInstruction: string;
  distanceToManeuverKm: number;
  etaMinutes: number;
  maneuverEmoji: string;
};

let activityRunning = false;

/**
 * Starts the activity on first call, updates it on every call after —
 * App.tsx just calls this on every navigation-state change and doesn't
 * need to track "have I started yet" itself.
 */
export async function syncLiveActivity(
  costingLabel: string,
  update: LiveActivityUpdate,
): Promise<void> {
  if (Platform.OS !== 'ios' || !LiveActivityModule) return;
  try {
    if (!activityRunning) {
      const started: boolean = await LiveActivityModule.startActivity({ costingLabel, ...update });
      activityRunning = started;
    } else {
      await LiveActivityModule.updateActivity(update);
    }
  } catch {
    // Best-effort — a missed start/update just means no (or slightly
    // stale) Island/Lock Screen info, not a real failure; turn-by-turn
    // navigation itself doesn't depend on this in any way.
  }
}

export async function endLiveActivity(): Promise<void> {
  if (Platform.OS !== 'ios' || !LiveActivityModule || !activityRunning) return;
  activityRunning = false;
  try {
    await LiveActivityModule.endActivity();
  } catch {
    // Nothing to recover — the activity will eventually get cleared by the
    // system's own stale-activity handling even if this call fails.
  }
}
