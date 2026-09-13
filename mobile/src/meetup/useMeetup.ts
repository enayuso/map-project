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
import { useState } from 'react';
import type { useCurrentPosition } from '@maplibre/maplibre-react-native';
import { findMeetupCandidates, type MeetupCandidate } from './api';
import { MAX_PARTICIPANTS } from './MeetupPanel';
import { logError } from '../errors/logger';
import type { SearchResult } from '../search/api';

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

  const activate = () => {
    setActive(true);
    setActiveParticipantIndex(0);
  };

  const reset = () => {
    setActive(false);
    setParticipants([null, null]);
    setCandidates([]);
    setResultsVisible(false);
    setError(null);
  };

  const selectParticipant = (index: number, result: SearchResult) => {
    setParticipants(prev => prev.map((p, i) => (i === index ? result : p)));
    recordRecentSearch(result);
    // Advance to the next empty slot, same "keep moving forward" feel as
    // the directions fields' auto-advance.
    const nextEmpty = participants.findIndex((p, i) => i !== index && !p);
    if (nextEmpty !== -1) setActiveParticipantIndex(nextEmpty);
  };

  const clearParticipant = (index: number) => {
    setParticipants(prev => prev.map((p, i) => (i === index ? null : p)));
    setActiveParticipantIndex(index);
  };

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
    setActiveParticipantIndex(participants.length);
  };

  const removeParticipant = (index: number) => {
    setParticipants(prev => prev.filter((_, i) => i !== index));
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
