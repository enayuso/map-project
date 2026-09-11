import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
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
  activeIndex: number;
  onFocusParticipant: (index: number) => void;
  onSelectParticipant: (index: number, result: SearchResult) => void;
  onClearParticipant: (index: number) => void;
  onUseCurrentLocation: (index: number) => void;
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
  activeIndex,
  onFocusParticipant,
  onSelectParticipant,
  onClearParticipant,
  onUseCurrentLocation,
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

        {participants.map((participant, index) => (
          <View key={index}>
            {index > 0 && <View style={[styles.divider, { backgroundColor: colors.dividerStrong }]} />}
            <View style={[styles.fieldRow, activeIndex === index && styles.fieldRowActive]}>
              <View style={[styles.dot, { backgroundColor: PARTICIPANT_COLORS[index] }]} />
              <SearchBox
                embedded
                clearOnSelect={false}
                placeholder={`Person ${index + 1}`}
                dropdownTop={DROPDOWN_TOP}
                value={participant?.name ?? ''}
                onFocus={() => onFocusParticipant(index)}
                onSelect={result => onSelectParticipant(index, result)}
                recentSearches={recentSearches}
                favorites={favorites}
                extraShortcuts={[
                  { label: '📍 Use current location', onPress: () => onUseCurrentLocation(index) },
                ]}
              />
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
  rowButton: {
    paddingHorizontal: 6,
  },
  rowButtonLabel: {
    fontSize: 13,
    color: '#8a8578',
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
