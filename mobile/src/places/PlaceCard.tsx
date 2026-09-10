import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { SearchResult } from '../search/api';

export type TravelPreview =
  | { status: 'unavailable' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; distanceKm: number; durationMin: number };

type Props = {
  place: SearchResult | null;
  travelPreview: TravelPreview;
  isFavorite: boolean;
  onClose: () => void;
  onDirections: () => void;
  onToggleFavorite: () => void;
  onReportIssue: () => void;
};

export default function PlaceCard({
  place,
  travelPreview,
  isFavorite,
  onClose,
  onDirections,
  onToggleFavorite,
  onReportIssue,
}: Props) {
  // Corrections only make sense for our own Typesense-backed POIs (see
  // docs/research/11-kakao-naver-poi-data-sourcing.md) — not Nominatim
  // addresses, a dropped pin, "my location," or a meetup candidate, none
  // of which are rows this app could actually patch.
  const isCorrectablePOI = place?.kind === 'poi' && place.id.startsWith('poi-');
  return (
    <Modal transparent visible={!!place} animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop} pointerEvents="box-none">
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        {place && (
          <View style={styles.card}>
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={styles.name}>{place.name}</Text>
                <Text style={styles.subtitle} numberOfLines={2}>
                  {place.subtitle}
                </Text>
              </View>
              <Pressable style={styles.favoriteButton} onPress={onToggleFavorite}>
                <Text style={[styles.favoriteLabel, isFavorite && styles.favoriteLabelActive]}>
                  {isFavorite ? '★' : '☆'}
                </Text>
              </Pressable>
              <Pressable style={styles.closeButton} onPress={onClose}>
                <Text style={styles.closeLabel}>✕</Text>
              </Pressable>
            </View>

            {travelPreview.status === 'loading' && (
              <Text style={styles.travelText}>Finding travel time…</Text>
            )}
            {travelPreview.status === 'ready' && (
              <Text style={styles.travelText}>
                🚗 {Math.round(travelPreview.durationMin)} min ({travelPreview.distanceKm.toFixed(1)} km) from you
              </Text>
            )}
            {travelPreview.status === 'unavailable' && (
              <Text style={styles.travelHint}>Tap 📍 to enable location for travel-time previews</Text>
            )}

            <Pressable style={styles.directionsButton} onPress={onDirections}>
              <Text style={styles.directionsLabel}>🧭 Directions</Text>
            </Pressable>

            {isCorrectablePOI && (
              <Pressable style={styles.reportButton} onPress={onReportIssue}>
                <Text style={styles.reportLabel}>⚠️ Report an issue with this place</Text>
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
