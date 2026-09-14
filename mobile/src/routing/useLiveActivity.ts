/**
 * Live Activity / Dynamic Island integration (iOS only) — per
 * docs/research/10-remaining-feature-gaps.md, the single most
 * "Kakao/Naver literally cannot do this" feature available, since Live
 * Activities are iOS-only. See liveActivity.ts's own header comment: this
 * is a pure one-way mirror of App.tsx's existing live-navigation state,
 * never read back. Extracted out of App.tsx — see
 * src/errors/useErrorLog.ts's header comment for why. Owns no state of
 * its own, same as useSpotlight — every dependency is a parameter, since
 * the whole feature is "reflect this core navigation state outward,"
 * nothing this hook itself needs to track.
 */
import { useEffect } from 'react';
import { syncLiveActivity, endLiveActivity } from './liveActivity';
import { COSTING_LABELS } from './RoutePanel';
import { maneuverIcon, type UpcomingManeuver } from './navigation';
import type { Costing } from './api';

type RemainingTrip = { distanceKm: number; durationMin: number };

export function useLiveActivity(
  navigationActive: boolean,
  navigationArrived: boolean,
  upcomingManeuver: UpcomingManeuver | null,
  remainingTrip: RemainingTrip | null,
  costing: Costing,
): void {
  useEffect(() => {
    if (!navigationActive) return;
    if (navigationArrived) {
      syncLiveActivity(COSTING_LABELS[costing], {
        nextInstruction: "You've arrived",
        distanceToManeuverKm: 0,
        etaMinutes: 0,
        maneuverEmoji: '🏁',
      });
      return;
    }
    if (!upcomingManeuver || !remainingTrip) return;
    syncLiveActivity(COSTING_LABELS[costing], {
      nextInstruction: upcomingManeuver.maneuver.instruction,
      distanceToManeuverKm: upcomingManeuver.distanceToManeuverKm,
      etaMinutes: Math.round(remainingTrip.durationMin),
      maneuverEmoji: maneuverIcon(upcomingManeuver.maneuver.type),
    });
  }, [navigationActive, navigationArrived, upcomingManeuver, remainingTrip, costing]);

  useEffect(() => {
    if (!navigationActive) endLiveActivity();
  }, [navigationActive]);
}
