import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { SearchResult } from '../search/api';
import { useTheme } from '../theme/ThemeContext';

export type TravelPreview =
  | { status: 'unavailable' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; distanceKm: number; durationMin: number };

type Props = {
  // Whether this card is actually allowed to be presented right now — see
  // src/modals/useModalCoordinator.ts's header comment. Independent of
  // `place`: this can be false while `place` is still non-null (another
  // Modal currently has the floor), in which case the card just stays
  // hidden with its data intact, ready to reappear once it's this
  // coordinator slot's turn again.
  visible: boolean;
  place: SearchResult | null;
  travelPreview: TravelPreview;
  isFavorite: boolean;
  onClose: () => void;
  onDirections: () => void;
  onToggleFavorite: () => void;
  onReportIssue: () => void;
  // Fed to the underlying <Modal> — reports back once its dismiss
  // *animation* has actually finished, which the coordinator needs to
  // know before it's safe to present whatever's next.
  onDismiss?: () => void;
};

export default function PlaceCard({
  visible,
  place,
  travelPreview,
  isFavorite,
  onClose,
  onDirections,
  onToggleFavorite,
  onReportIssue,
  onDismiss,
}: Props) {
  const { colors } = useTheme();
  // Corrections only make sense for our own Typesense-backed POIs (see
  // docs/research/11-kakao-naver-poi-data-sourcing.md) — not Nominatim
  // addresses, a dropped pin, "my location," or a meetup candidate, none
  // of which are rows this app could actually patch.
  const isCorrectablePOI = place?.kind === 'poi' && place.id.startsWith('poi-');
  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose} onDismiss={onDismiss}>
      <View style={styles.backdrop} pointerEvents="box-none">
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        {place && (
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={[styles.name, { color: colors.textPrimary }]}>{place.name}</Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={2}>
                  {place.subtitle}
                </Text>
              </View>
              <Pressable
                style={[styles.favoriteButton, { backgroundColor: colors.divider }]}
                onPress={onToggleFavorite}
                accessibilityRole="button"
                accessibilityLabel={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                accessibilityState={{ selected: isFavorite }}>
                <Text
                  style={[
                    styles.favoriteLabel,
                    { color: colors.textSecondary },
                    isFavorite && styles.favoriteLabelActive,
                  ]}>
                  {isFavorite ? '★' : '☆'}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.closeButton, { backgroundColor: colors.divider }]}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close">
                <Text style={[styles.closeLabel, { color: colors.textPrimary }]}>✕</Text>
              </Pressable>
            </View>

            {travelPreview.status === 'loading' && (
              <Text style={[styles.travelText, { color: colors.accent }]}>Finding travel time…</Text>
            )}
            {travelPreview.status === 'ready' && (
              <Text style={[styles.travelText, { color: colors.accent }]}>
                🚗 {Math.round(travelPreview.durationMin)} min ({travelPreview.distanceKm.toFixed(1)} km) from you
              </Text>
            )}
            {travelPreview.status === 'unavailable' && (
              <Text style={[styles.travelHint, { color: colors.textSecondary }]}>Tap 📍 to enable location for travel-time previews</Text>
            )}

            <Pressable
              style={[styles.directionsButton, { backgroundColor: colors.textPrimary }]}
              onPress={onDirections}
              accessibilityRole="button"
              accessibilityLabel="Directions">
              <Text style={[styles.directionsLabel, { color: colors.onTextPrimary }]}>🧭 Directions</Text>
            </Pressable>

            {isCorrectablePOI && (
              <Pressable
                style={styles.reportButton}
                onPress={onReportIssue}
                accessibilityRole="button"
                accessibilityLabel="Report an issue with this place">
                <Text style={[styles.reportLabel, { color: colors.textSecondary }]}>⚠️ Report an issue with this place</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 18,
    paddingBottom: 28,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
    elevation: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  headerText: {
    flex: 1,
  },
  name: {
    fontSize: 18,
    fontWeight: '700',
    color: '#3a3226',
  },
  subtitle: {
    fontSize: 13,
    color: '#8a8578',
    marginTop: 4,
  },
  favoriteButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#f0ede4',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  favoriteLabel: {
    fontSize: 17,
    color: '#8a8578',
  },
  favoriteLabelActive: {
    color: '#d9a441',
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#f0ede4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeLabel: {
    fontSize: 14,
    color: '#3a3226',
  },
  travelText: {
    marginTop: 12,
    fontSize: 14,
    color: '#2b6cb0',
    fontWeight: '600',
  },
  travelHint: {
    marginTop: 12,
    fontSize: 12,
    color: '#8a8578',
  },
  directionsButton: {
    marginTop: 16,
    backgroundColor: '#3a3226',
    borderRadius: 20,
    paddingVertical: 10,
    alignItems: 'center',
  },
  directionsLabel: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14,
  },
  reportButton: {
    marginTop: 10,
    alignItems: 'center',
    paddingVertical: 6,
  },
  reportLabel: {
    color: '#8a8578',
    fontSize: 12,
    fontWeight: '600',
  },
});
