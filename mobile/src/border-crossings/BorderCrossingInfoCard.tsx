import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { BorderCrossing } from './api';

// Bottom-sheet Modal, same pattern as src/places/PlaceCard.tsx and
// src/hazards/HazardInfoCard.tsx — opens from tapping one of the two
// always-visible 🛂 markers on the map (see App.tsx; no toggle button of
// its own, since there are only ever two of these, fixed).

const POSITION_SOURCE_LABELS: Record<BorderCrossing['positionSource'], string> = {
  'border-crossing-point': 'Position: a dedicated border-crossing reference point, not independently surveyed',
  'town-centroid-approximate': "Position: approximate — the border town's centroid, not the exact checkpoint",
};

type Props = {
  crossing: BorderCrossing | null;
  onClose: () => void;
  onDirections: (crossing: BorderCrossing) => void;
};

export default function BorderCrossingInfoCard({ crossing, onClose, onDirections }: Props) {
  return (
    <Modal transparent visible={!!crossing} animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop} pointerEvents="box-none">
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        {crossing && (
          <View style={styles.card}>
            <View style={styles.header}>
              <Text style={styles.title}>🛂 {crossing.name}</Text>
              <Pressable style={styles.closeButton} onPress={onClose}>
                <Text style={styles.closeLabel}>✕</Text>
              </Pressable>
            </View>

            <ScrollView style={styles.body}>
              <Text style={styles.sectionLabel}>Hours</Text>
              <Text style={styles.sectionText}>{crossing.hours}</Text>

              <Text style={styles.sectionLabel}>Documents needed</Text>
              <Text style={styles.sectionText}>{crossing.documentsNeeded}</Text>

              <Text style={styles.sectionLabel}>Fees</Text>
              <Text style={styles.sectionText}>{crossing.fees}</Text>

              <Text style={styles.sectionLabel}>⚠️ Common scams</Text>
              <Text style={styles.sectionText}>{crossing.scamWarnings}</Text>

              <Text style={styles.positionNote}>{POSITION_SOURCE_LABELS[crossing.positionSource]}</Text>
              <Text style={styles.lastVerified}>Last verified {crossing.lastVerifiedAt}</Text>
            </ScrollView>

            <Pressable style={styles.directionsButton} onPress={() => onDirections(crossing)}>
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
    maxHeight: '75%',
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
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#3a3226',
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
  body: {
    marginTop: 10,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2f7d6c',
    marginTop: 10,
  },
  sectionText: {
    fontSize: 13,
    color: '#3a3226',
    marginTop: 2,
    lineHeight: 18,
  },
  positionNote: {
    fontSize: 11,
    color: '#8a8578',
    fontStyle: 'italic',
    marginTop: 12,
  },
  lastVerified: {
    fontSize: 11,
    color: '#a39d8c',
    marginTop: 4,
    marginBottom: 4,
  },
  directionsButton: {
    marginTop: 12,
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
