import React from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { DIFFICULTY_LABELS, formatDepth, POSITION_SOURCE_LABELS, type DiveSite } from './api';

// Bottom-sheet Modal, same pattern as src/ferries/FerryPanel.tsx. Every
// card is upfront about how confident its position is (see api.ts's
// POSITION_SOURCE_LABELS) rather than presenting all 13 sites as equally
// precise, since several are only positioned at their reserve's centroid.

type Props = {
  visible: boolean;
  loading: boolean;
  error: string | null;
  sites: DiveSite[];
  onClose: () => void;
  onDirections: (site: DiveSite) => void;
};

export default function DiveSitesPanel({ visible, loading, error, sites, onClose, onDirections }: Props) {
  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop} pointerEvents="box-none">
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>🤿 Dive sites</Text>
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeLabel}>✕</Text>
            </Pressable>
          </View>

          <Text style={styles.hint}>
            Curated from PADI, Belize Audubon Society, and reserve boundary data — not a live or
            official database. Positions vary in precision; see each site's own note.
          </Text>

          {loading && (
            <View style={styles.centerRow}>
              <ActivityIndicator size="small" color="#8a8578" />
              <Text style={styles.loadingText}>Loading dive sites…</Text>
            </View>
          )}
          {error && !loading && <Text style={styles.errorText}>{error}</Text>}

          {!loading && !error && (
            <ScrollView style={styles.list}>
              {sites.map(site => {
                const depth = formatDepth(site);
                return (
                  <View key={site.id} style={styles.card}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.siteName}>{site.name}</Text>
                      {site.difficulty && (
                        <Text style={styles.difficultyBadge}>{DIFFICULTY_LABELS[site.difficulty]}</Text>
                      )}
                    </View>
                    <Text style={styles.reserve}>{site.reserve}</Text>
                    {depth && <Text style={styles.depth}>Depth: {depth}</Text>}
                    <Text style={styles.description}>{site.description}</Text>
                    <Text style={styles.positionNote}>{POSITION_SOURCE_LABELS[site.positionSource]}</Text>
                    <View style={styles.actionRow}>
                      <Pressable style={styles.directionsButton} onPress={() => onDirections(site)}>
                        <Text style={styles.directionsLabel}>🧭 Directions</Text>
                      </Pressable>
                      <Text style={styles.lastVerified}>Verified {site.lastVerifiedAt}</Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 14,
    paddingHorizontal: 14,
    paddingBottom: 24,
    maxHeight: '75%',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
    elevation: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {
    flex: 1,
    fontSize: 16,
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
  hint: {
    fontSize: 12,
    color: '#8a8578',
    marginBottom: 10,
  },
  centerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  loadingText: {
    marginLeft: 8,
    color: '#8a8578',
  },
  errorText: {
    color: '#b3261e',
    paddingVertical: 12,
  },
  list: {
    maxHeight: 460,
  },
  card: {
    backgroundColor: '#f7f5ef',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  siteName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#3a3226',
  },
  difficultyBadge: {
    fontSize: 11,
    fontWeight: '600',
    color: '#3a3226',
  },
  reserve: {
    fontSize: 12,
    color: '#2f7d6c',
    fontWeight: '600',
    marginTop: 2,
  },
  depth: {
    fontSize: 12,
    color: '#3a3226',
    marginTop: 2,
  },
  description: {
    fontSize: 12,
    color: '#3a3226',
    marginTop: 6,
  },
  positionNote: {
    fontSize: 11,
    color: '#8a8578',
    fontStyle: 'italic',
    marginTop: 6,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  directionsButton: {
    backgroundColor: '#3a3226',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  directionsLabel: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 12,
  },
  lastVerified: {
    marginLeft: 'auto',
    fontSize: 11,
    color: '#a39d8c',
  },
});
