import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import SearchBox from '../search/SearchBox';
import type { SearchResult } from '../search/api';
import { useTheme } from '../theme/ThemeContext';

// The explicit "departure / destination" card Kakao/Naver use for
// directions, replacing this app's earlier flow of implicitly reusing the
// main search box (first pick = origin, second = destination, with only a
// small hint text saying which) — the two are now independently visible,
// independently searchable, and independently tappable, same as both apps.
// Tapping the map to set a point (still supported — see App.tsx's
// handleMapPress) fills whichever field is currently `activeField`.

const DROPDOWN_TOP = 172; // just below this whole card, for both rows' dropdowns

// This panel's own real height from its container's top (2 field rows +
// divider + the close-button row below the card; the hint text is not
// counted since it only shows before both fields are set, i.e. never at
// the moment a route — and App.tsx's camera auto-fit — actually exists).
// Exported so App.tsx's route auto-fit (Camera.fitBounds's top padding)
// reserves exactly this much space rather than an independent guess that
// can drift out of sync with this file's own layout.
export const PANEL_HEIGHT = 130;
export const PANEL_TOP = 60; // matches container's own `top` below

type Props = {
  origin: SearchResult | null;
  destination: SearchResult | null;
  activeField: 'origin' | 'destination';
  onFocusField: (field: 'origin' | 'destination') => void;
  onSelectOrigin: (result: SearchResult) => void;
  onSelectDestination: (result: SearchResult) => void;
  onClearOrigin: () => void;
  onClearDestination: () => void;
  onSwap: () => void;
  onUseCurrentLocation: () => void;
  onPickOnMap: (field: 'origin' | 'destination') => void;
  onClose: () => void;
  recentSearches: SearchResult[];
  favorites: SearchResult[];
};

export default function DirectionsSearchPanel({
  origin,
  destination,
  activeField,
  onFocusField,
  onSelectOrigin,
  onSelectDestination,
  onClearOrigin,
  onClearDestination,
  onSwap,
  onUseCurrentLocation,
  onPickOnMap,
  onClose,
  recentSearches,
  favorites,
}: Props) {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <View style={styles.fieldsColumn}>
          <View style={[styles.fieldRow, activeField === 'origin' && styles.fieldRowActive]}>
            <View style={[styles.dot, styles.originDot]} />
            <SearchBox
              id="directions:origin"
              embedded
              clearOnSelect={false}
              placeholder="Choose starting point"
              dropdownTop={DROPDOWN_TOP}
              value={origin?.name ?? ''}
              onFocus={() => onFocusField('origin')}
              onSelect={onSelectOrigin}
              recentSearches={recentSearches}
              favorites={favorites}
              extraShortcuts={[
                { label: '📍 Use current location', onPress: onUseCurrentLocation },
                { label: '🗺️ Select on map', onPress: () => onPickOnMap('origin') },
              ]}
            />
            {origin && (
              <Pressable
                style={styles.clearButton}
                onPress={onClearOrigin}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Clear starting point">
                <Text style={[styles.clearLabel, { color: colors.textSecondary }]}>✕</Text>
              </Pressable>
            )}
          </View>

          <View style={[styles.divider, { backgroundColor: colors.dividerStrong }]} />

          <View style={[styles.fieldRow, activeField === 'destination' && styles.fieldRowActive]}>
            <View style={[styles.dot, styles.destinationDot]} />
            <SearchBox
              id="directions:destination"
              embedded
              clearOnSelect={false}
              placeholder="Choose destination"
              dropdownTop={DROPDOWN_TOP}
              value={destination?.name ?? ''}
              onFocus={() => onFocusField('destination')}
              onSelect={onSelectDestination}
              recentSearches={recentSearches}
              favorites={favorites}
              extraShortcuts={[{ label: '🗺️ Select on map', onPress: () => onPickOnMap('destination') }]}
            />
            {destination && (
              <Pressable
                style={styles.clearButton}
                onPress={onClearDestination}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Clear destination">
                <Text style={[styles.clearLabel, { color: colors.textSecondary }]}>✕</Text>
              </Pressable>
            )}
          </View>
        </View>

        <Pressable
          style={[styles.swapButton, { backgroundColor: colors.divider }]}
          onPress={onSwap}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Swap origin and destination">
          <Text style={[styles.swapLabel, { color: colors.textPrimary }]}>⇅</Text>
        </Pressable>
      </View>

      <Pressable
        style={styles.closeButton}
        onPress={onClose}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Cancel">
        <Text style={[styles.closeLabel, { color: colors.textPrimary }]}>✕ Cancel</Text>
      </Pressable>

      {/* Both fields' dropdowns share this hint about the other input method — shown only while genuinely useful, i.e. something's still unset. */}
      {(!origin || !destination) && (
        <Text style={[styles.hint, { color: colors.textPrimary }]}>You can also tap a point directly on the map</Text>
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
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingLeft: 14,
    paddingRight: 40,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  fieldsColumn: {
    flex: 1,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 46,
  },
  // Whichever field a map tap (or "use current location") would fill right
  // now — the same idea as a focused-input outline, but driven by
  // activeField rather than actual TextInput focus, since tapping the map
  // itself never focuses either input.
  fieldRowActive: {
    backgroundColor: '#f7f5ef',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  originDot: {
    backgroundColor: '#2f9e44',
  },
  destinationDot: {
    backgroundColor: '#d9534f',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e5e1d6',
    marginLeft: 20, // aligns with the text start, past the dot
  },
  clearButton: {
    paddingHorizontal: 6,
  },
  clearLabel: {
    fontSize: 14,
    color: '#8a8578',
  },
  swapButton: {
    position: 'absolute',
    right: 6,
    top: '50%',
    marginTop: -14,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f0ede4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swapLabel: {
    fontSize: 15,
    color: '#3a3226',
  },
  closeButton: {
    alignSelf: 'flex-end',
    marginTop: 8,
    backgroundColor: '#ffffffdd',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  closeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3a3226',
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
