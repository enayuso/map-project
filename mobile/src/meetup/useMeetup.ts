/**
 * State + handlers for the fair meeting-point calculator. Per
 * docs/research/09-kakao-naver-feature-audit.md, neither Kakao Map nor
 * Naver Map actually has this natively (both punt to third-party apps
 * built on their APIs) — see api.ts's own header comment for the actual
 * fairness logic (minimax on real Valhalla travel times, not a straight-
 * line geometric midpoint). Extracted out of App.tsx — see
 * src/errors/useErrorLog.ts's header comment for why.
 *
 * Meetup is one of App.tsx's mutually-exclusive top-level modes (with
 * routing/measure), so unlike the simpler utility-panel hooks, this one
 * does NOT own its own toggle — `activate`/`reset` are the primitives,
 * and App.tsx's own toggleMeetup bridge function calls them alongside
 * the sibling toggles (toggleRouting/toggleMeasure) and core state
 * (closeCategoryBrowsing, selectedPlace) that this feature shouldn't
 * need to know about. Likewise, picking a result ends meetup mode *and*
 * opens that place's card — a cross-feature bridge (handleSelect
 * MeetupCandidate) that stays in App.tsx for the same reason.
 * `currentPosition`/`locationEnabled`/`setLocationEnabled`/
 * `recordRecentSearch` are parameters (not owned here) since they're
 * core, cross-feature state this hook only reads or appends to.
 */
import { useEffect, useRef, useState } from 'react';
import type { useCurrentPosition } from '@maplibre/maplibre-react-native';
import { findMeetupCandidates, type MeetupCandidate } from './api';
import { MAX_PARTICIPANTS } from './MeetupPanel';
import { logError } from '../errors/logger';
import { getSharedPosition } from '../sharing/api';
import type { SearchResult } from '../search/api';

// How often a participant filled via a live-share code re-polls their
// position — matches src/sharing/useSharing.ts's own viewing-poll interval,
// since this is the same underlying mechanism (a live-shared position),
// just fed into a different consumer.
const LIVE_SHARE_POLL_MS = 10000;

type CurrentPosition = ReturnType<typeof useCurrentPosition>;

export type UseMeetup = {
  active: boolean;
  activate: () => void;
  reset: () => void;
  participants: (SearchResult | null)[];
  activeParticipantIndex: number;
  setActiveParticipantIndex: (index: number) => void;
  selectParticipant: (index: number, result: SearchResult) => void;
  clearParticipant: (index: number) => void;
  fillCurrentLocation: (index: number) => void;
  /**
   * Kakao's own group-location-sharing screen predicts each participant's
   * live ETA to a shared destination — this is the fusion of that idea with
   * the two features this app already has separately (live location
   * sharing, this fair meeting-point calculator): fill a participant slot
   * from someone else's live-shared position (the same short code from
   * src/sharing/), rather than a one-time search/current-location snapshot.
   * `liveShareCodes[index]` tracks which slots are live so the effect below
   * knows what to keep polling, and MeetupPanel can show a "live" indicator.
   */
  fillFromSharedCode: (index: number, code: string) => Promise<void>;
  liveShareCodes: (string | null)[];
  sharedLocationError: string | null;
  addParticipant: () => void;
  removeParticipant: (index: number) => void;
  candidates: MeetupCandidate[];
  resultsVisible: boolean;
  closeResults: () => void;
  loading: boolean;
  error: string | null;
  findMeetupPoint: () => Promise<void>;
};

export function useMeetup(
  locationEnabled: boolean,
  setLocationEnabled: (enabled: boolean) => void,
  currentPosition: CurrentPosition,
  recordRecentSearch: (result: SearchResult) => void,
): UseMeetup {
  const [active, setActive] = useState(false);
  const [participants, setParticipants] = useState<(SearchResult | null)[]>([null, null]);
  const [activeParticipantIndex, setActiveParticipantIndex] = useState(0);
  const [candidates, setCandidates] = useState<MeetupCandidate[]>([]);
  const [resultsVisible, setResultsVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveShareCodes, setLiveShareCodes] = useState<(string | null)[]>([null, null]);
  const [sharedLocationError, setSharedLocationError] = useState<string | null>(null);

  const activate = () => {
    setActive(true);
    setActiveParticipantIndex(0);
  };

  const reset = () => {
    setActive(false);
    setParticipants([null, null]);
    setLiveShareCodes([null, null]);
    setCandidates([]);
    setResultsVisible(false);
    setError(null);
    setSharedLocationError(null);
  };

  const selectParticipant = (index: number, result: SearchResult) => {
    setParticipants(prev => prev.map((p, i) => (i === index ? result : p)));
    // A direct selection (search, current-location, map tap) replaces
    // whatever was there — including a live-shared position, which stops
    // being polled once it's no longer what's actually filling the slot.
    setLiveShareCodes(prev => prev.map((c, i) => (i === index ? null : c)));
    recordRecentSearch(result);
    // Advance to the next empty slot, same "keep moving forward" feel as
    // the directions fields' auto-advance.
    const nextEmpty = participants.findIndex((p, i) => i !== index && !p);
    if (nextEmpty !== -1) setActiveParticipantIndex(nextEmpty);
  };

  const clearParticipant = (index: number) => {
    setParticipants(prev => prev.map((p, i) => (i === index ? null : p)));
    setLiveShareCodes(prev => prev.map((c, i) => (i === index ? null : c)));
    setActiveParticipantIndex(index);
  };

  /**
   * Kakao's group-sharing screen predicts each participant's live ETA to a
   * shared destination — this is that idea fused with the two features
   * this app already has separately (see the header comment above
   * useMeetup and the UseMeetup.fillFromSharedCode doc comment). Fills a
   * participant slot from someone else's live-shared position (the same
   * short code src/sharing/ already uses) instead of a one-time snapshot,
   * and marks it in `liveShareCodes` so the poll effect below keeps it
   * fresh while meetup mode stays open.
   */
  const fillFromSharedCode = async (index: number, code: string) => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setSharedLocationError(null);
    try {
      const pos = await getSharedPosition(trimmed);
      selectParticipant(index, {
        id: `shared-${index}`,
        name: pos.label ? `${pos.label} (shared)` : `Shared location (${trimmed})`,
        subtitle: 'Live shared location',
        lat: pos.lat,
        lon: pos.lon,
        kind: 'poi',
      });
      // selectParticipant (above) just cleared this index back to null on
      // the assumption it's a one-time selection — override that back to
      // live for this specific case, now that the slot is actually filled.
      setLiveShareCodes(prev => prev.map((c, i) => (i === index ? trimmed : c)));
    } catch (e) {
      logError('meetup:fillFromSharedCode', e, { index });
      setSharedLocationError(e instanceof Error ? e.message : 'Could not find that shared location.');
    }
  };

  // Keeps every live-shared participant's position fresh while meetup mode
  // is open — same poll cadence as src/sharing/useSharing.ts's own
  // "viewing" poll, since it's the same underlying mechanism, just feeding
  // a different consumer. A ref (not a direct effect dependency) so the
  // interval doesn't need to be torn down and recreated every time a slot
  // is filled/cleared — it always reads whichever codes are current.
  const liveShareCodesRef = useRef(liveShareCodes);
  useEffect(() => {
    liveShareCodesRef.current = liveShareCodes;
  }, [liveShareCodes]);

  useEffect(() => {
    if (!active) return;
    const poll = () => {
      liveShareCodesRef.current.forEach((code, index) => {
        if (!code) return;
        getSharedPosition(code)
          .then(pos => {
            setParticipants(prev => prev.map((p, i) => (i === index && p ? { ...p, lat: pos.lat, lon: pos.lon } : p)));
          })
          .catch(e => {
            // The share expired or was stopped server-side — stop treating
            // this slot as live (matches useSharing's own "stop pretending"
            // behavior on a failed push/poll) but leave the participant's
            // last-known position filled in rather than blanking the slot
            // out from under the user mid-session.
            logError('meetup:liveSharePoll', e, { index });
            setLiveShareCodes(prev => prev.map((c, i) => (i === index ? null : c)));
          });
      });
    };
    const interval = setInterval(poll, LIVE_SHARE_POLL_MS);
    return () => clearInterval(interval);
  }, [active]);

  const fillCurrentLocation = (index: number) => {
    if (!locationEnabled) setLocationEnabled(true);
    if (!currentPosition) return;
    selectParticipant(index, {
      id: `current-location-${index}`,
      name: 'My location',
      subtitle: 'Current position',
      lat: currentPosition.coords.latitude,
      lon: currentPosition.coords.longitude,
      kind: 'poi',
    });
  };

  const addParticipant = () => {
    setParticipants(prev => (prev.length < MAX_PARTICIPANTS ? [...prev, null] : prev));
    setLiveShareCodes(prev => (prev.length < MAX_PARTICIPANTS ? [...prev, null] : prev));
    setActiveParticipantIndex(participants.length);
  };

  const removeParticipant = (index: number) => {
    setParticipants(prev => prev.filter((_, i) => i !== index));
    // Kept in lockstep with participants — same index scheme, so a removed
    // slot's live-poll tracking is dropped along with the slot itself.
    setLiveShareCodes(prev => prev.filter((_, i) => i !== index));
  };

  const findMeetupPoint = async () => {
    const filled = participants.filter((p): p is SearchResult => !!p);
    if (filled.length < 2) return;
    setLoading(true);
    setError(null);
    setResultsVisible(true);
    try {
      const found = await findMeetupCandidates(filled, 'auto');
      setCandidates(found);
      if (found.length === 0) setError('Nothing reachable by everyone nearby.');
    } catch (e) {
      logError('meetup:compare', e, { participantCount: filled.length });
      setCandidates([]);
      setError('Could not compare travel times — check that everyone has a valid location.');
    } finally {
      setLoading(false);
    }
  };

  return {
    active,
    activate,
    reset,
    participants,
    activeParticipantIndex,
    setActiveParticipantIndex,
    selectParticipant,
    clearParticipant,
    fillCurrentLocation,
    fillFromSharedCode,
    liveShareCodes,
    sharedLocationError,
    addParticipant,
    removeParticipant,
    candidates,
    resultsVisible,
    closeResults: () => setResultsVisible(false),
    loading,
    error,
    findMeetupPoint,
  };
}
