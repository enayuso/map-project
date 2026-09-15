import React from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import SearchBox from '../search/SearchBox';
import type { SearchResult } from '../search/api';
import { useTheme } from '../theme/ThemeContext';

// Input panel for the fair meeting-point calculator: 2-5 participant slots
// (search, current-location shortcut, or a map tap — same input methods
// DirectionsSearchPanel already established, minus its pan-to-select
// picker, not needed for a first version of this). Each slot gets its own
// color, reused consistently on its map marker and in the results list's
// per-participant time chips (src/meetup/MeetupResultsSheet.tsx) so a
// participant is visually the same thing everywhere on screen.
export const PARTICIPANT_COLORS = ['#2f9e44', '#d9534f', '#2b6cb0', '#d9a441', '#8551c9'];
export const MAX_PARTICIPANTS = PARTICIPANT_COLORS.length;
const MIN_PARTICIPANTS = 2;

const DROPDOWN_TOP = 300; // generous fixed offset below the whole panel — see its own render for why this can't be computed per-row

type Props = {
  participants: (SearchResult | null)[];
  // A stable id per slot, independent of its current position in
  // `participants` — see useMeetup.ts's own `slotIds` doc comment. Used as
  // both this row's React `key` and its SearchBox's coordinator `id`
  // instead of the array index, so removing an earlier participant can't
  // silently hand a still-open dropdown's state to a different row.
  slotIds: string[];
  activeIndex: number;
  onFocusParticipant: (index: number) => void;
  onSelectParticipant: (index: number, result: SearchResult) => void;
  onClearParticipant: (index: number) => void;
  onUseCurrentLocation: (index: number) => void;
  // Kakao-style fusion of live location sharing with this calculator — see
  // useMeetup.ts's fillFromSharedCode doc comment. liveShareCodes[index]
  // being non-null means that slot is actively poll-refreshed, shown here
  // as a small "🔴 live" badge next to the participant's name.
  onUseSharedLocation: (index: number, code: string) => void;
  liveShareCodes: (string | null)[];
  sharedLocationError: string | null;
  onAddParticipant: () => void;
  onRemoveParticipant: (index: number) => void;
  onFindMeetupPoint: () => void;
  finding: boolean;
  onClose: () => void;
  recentSearches: SearchResult[];
  favorites: SearchResult[];
};

export default function MeetupPanel({
  participants,
  slotIds,
  activeIndex,
  onFocusParticipant,
  onSelectParticipant,
  onClearParticipant,
  onUseCurrentLocation,
  onUseSharedLocation,
  liveShareCodes,
  sharedLocationError,
  onAddParticipant,
  onRemoveParticipant,
  onFindMeetupPoint,
  finding,
  onClose,
  recentSearches,
  favorites,
}: Props) {
  const { colors } = useTheme();
  const filledCount = participants.filter(Boolean).length;
  const canFind = filledCount >= MIN_PARTICIPANTS && !finding;

  // Alert.prompt is iOS-only (this app is iOS-first/iOS-only for now,
  // matching the same precedent in src/lists/ListsManagerPanel.tsx) — a
  // native text-input dialog, so a shared code doesn't need its own inline
  // input UI just for this one step.
  //
  // Deliberately a dedicated row button (below), not one of SearchBox's own
  // extraShortcuts, despite `onUseCurrentLocation` living there and doing
  // something conceptually identical. Found the hard way, across two
  // separate debugging passes: calling Alert.prompt from inside SearchBox's
  // extraShortcut handler (src/search/SearchBox.tsx's handleExtraShortcut,
  // which closes this dropdown's own <Modal> immediately before running
  // the shortcut's action) reliably made the alert silently fail to
  // appear — confirmed not a general Alert/Alert.prompt problem (a plain
  // Alert.prompt call from an ordinary Pressable elsewhere in this exact
  // Meet Up panel works perfectly), and not fixable with a deferred
  // setTimeout either (tried 0ms, 300ms — neither helped; an
  // onDismiss-chained version made it worse, surfacing a real
  // `Cannot read property 'getSnapshot' of null` crash). Rather than keep
  // chasing the exact native mechanism, sidestepped it architecturally:
  // this action now lives on its own row button, called directly, with no
  // dependency on SearchBox's dropdown or its Modal at all.
  const promptForSharedLocation = (index: number) => {
    Alert.prompt('Enter their share code', "Ask them to open Live Location Sharing and read you their code", code => {
      const trimmed = (code || '').trim();
      if (trimmed) onUseSharedLocation(index, trimmed);
    });
  };

  return (
    <View style={styles.container}>
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>🤝 Find a meeting point</Text>
          <Pressable
            style={[styles.closeButton, { backgroundColor: colors.divider }]}
            onPress={onClose}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close">
            <Text style={[styles.closeLabel, { color: colors.textPrimary }]}>✕</Text>
          </Pressable>
        </View>

        {sharedLocationError && (
          <Text style={[styles.sharedLocationError, { color: colors.danger }]}>{sharedLocationError}</Text>
        )}

        {participants.map((participant, index) => (
          <View key={slotIds[index]}>
            {index > 0 && <View style={[styles.divider, { backgroundColor: colors.dividerStrong }]} />}
            <View style={[styles.fieldRow, activeIndex === index && styles.fieldRowActive]}>
              <View style={[styles.dot, { backgroundColor: PARTICIPANT_COLORS[index] }]} />
              <SearchBox
                id={`meetup:${slotIds[index]}`}
                embedded
                clearOnSelect={false}
                placeholder={`Person ${index + 1}`}
                dropdownTop={DROPDOWN_TOP}
                value={participant?.name ?? ''}
                onFocus={() => onFocusParticipant(index)}
                onSelect={result => onSelectParticipant(index, result)}
                recentSearches={recentSearches}
                favorites={favorites}
                extraShortcuts={[{ label: '📍 Use current location', onPress: () => onUseCurrentLocation(index) }]}
              />
              {liveShareCodes[index] && (
                <Text
                  style={[styles.liveBadge, { color: colors.accent }]}
                  accessibilityLabel="Live shared location, updating automatically">
                  🔴 live
                </Text>
              )}
              {!participant && (
                <Pressable
                  style={styles.rowButton}
                  onPress={() => promptForSharedLocation(index)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Use a shared location for person ${index + 1}`}>
                  <Text style={styles.rowButtonEmoji}>📡</Text>
                </Pressable>
              )}
              {participant && (
                <Pressable
                  style={styles.rowButton}
                  onPress={() => onClearParticipant(index)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Clear person ${index + 1}`}>
                  <Text style={[styles.rowButtonLabel, { color: colors.textSecondary }]}>✕</Text>
                </Pressable>
              )}
              {index >= MIN_PARTICIPANTS && (
                <Pressable
                  style={styles.rowButton}
                  onPress={() => onRemoveParticipant(index)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove person ${index + 1}`}>
                  <Text style={[styles.rowButtonLabel, { color: colors.textSecondary }]}>🗑</Text>
                </Pressable>
              )}
            </View>
          </View>
        ))}

        {participants.length < MAX_PARTICIPANTS && (
          <Pressable
            style={styles.addRow}
            onPress={onAddParticipant}
            accessibilityRole="button"
            accessibilityLabel="Add person">
            <Text style={[styles.addLabel, { color: colors.accent }]}>+ Add person</Text>
          </Pressable>
        )}

        <Pressable
          style={[styles.findButton, { backgroundColor: colors.textPrimary }, !canFind && styles.findButtonDisabled]}
          onPress={onFindMeetupPoint}
          disabled={!canFind}
          accessibilityRole="button"
          accessibilityLabel="Find a fair place to meet">
          {finding ? (
            <ActivityIndicator size="small" color={colors.onTextPrimary} />
          ) : (
            <Text style={[styles.findLabel, { color: colors.onTextPrimary }]}>Find a fair place to meet</Text>
          )}
        </Pressable>
      </View>

      {filledCount < MIN_PARTICIPANTS && (
        <Text style={[styles.hint, { color: colors.textPrimary }]}>Add at least 2 people — search, use current location, or tap the map</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 60,
    left: 12,
    right: 12,
    zIndex: 10,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
  },
  title: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#3a3226',
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f0ede4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeLabel: {
    fontSize: 13,
    color: '#3a3226',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e5e1d6',
    marginLeft: 20,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
  },
  fieldRowActive: {
    backgroundColor: '#f7f5ef',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  liveBadge: {
    fontSize: 10,
    fontWeight: '700',
    marginRight: 2,
  },
  sharedLocationError: {
    fontSize: 12,
    marginBottom: 6,
  },
  rowButton: {
    paddingHorizontal: 6,
  },
  rowButtonLabel: {
    fontSize: 13,
    color: '#8a8578',
  },
  rowButtonEmoji: {
    fontSize: 13,
  },
  addRow: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  addLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2b6cb0',
  },
  findButton: {
    marginTop: 6,
    backgroundColor: '#3a3226',
    borderRadius: 20,
    paddingVertical: 11,
    alignItems: 'center',
  },
  findButtonDisabled: {
    backgroundColor: '#c7c2b4',
  },
  findLabel: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  hint: {
    marginTop: 6,
    fontSize: 12,
    color: '#3a3226',
    backgroundColor: '#ffffffdd',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
});
