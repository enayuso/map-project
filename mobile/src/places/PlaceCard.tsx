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
  onClose: () => void;
  onDirections: () => void;
};

export default function PlaceCard({ place, travelPreview, onClose, onDirections }: Props) {
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
});
