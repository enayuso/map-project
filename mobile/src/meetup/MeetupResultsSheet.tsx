import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { PARTICIPANT_COLORS } from './MeetupPanel';
import type { MeetupCandidate } from './api';
import { useTheme } from '../theme/ThemeContext';

type Props = {
  visible: boolean;
  loading: boolean;
  error: string | null;
  candidates: MeetupCandidate[];
  onSelect: (candidate: MeetupCandidate) => void;
  onClose: () => void;
};

export default function MeetupResultsSheet({
  visible,
  loading,
  error,
  candidates,
  onSelect,
  onClose,
}: Props) {
  const { colors } = useTheme();

  return (
    // Modal, not a plain overlay — same touch-swallowing reason as every
    // other mounts/unmounts-based list in this app (mobile/README.md
    // issue 6, src/search/SearchBox.tsx).
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop} pointerEvents="box-none">
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <View style={[styles.sheet, { backgroundColor: colors.card }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Fairest places to meet</Text>
            <Pressable
              style={[styles.closeButton, { backgroundColor: colors.divider }]}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close">
              <Text style={[styles.closeLabel, { color: colors.textPrimary }]}>✕</Text>
            </Pressable>
          </View>

          {loading && (
            <View style={styles.centerRow}>
              <ActivityIndicator size="small" color={colors.textSecondary} />
              <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Comparing travel times…</Text>
            </View>
          )}

          {error && !loading && <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>}

          {!loading && !error && candidates.length === 0 && (
            <Text style={[styles.empty, { color: colors.textSecondary }]}>
              Nothing reachable by everyone nearby — try adding people closer together, or a
              wider area.
            </Text>
          )}

          {!loading && candidates.length > 0 && (
            <ScrollView style={styles.list}>
              {candidates.map((c, i) => (
                <Pressable
                  key={c.place.id}
                  style={[styles.row, { borderBottomColor: colors.divider }]}
                  onPress={() => onSelect(c)}
                  accessibilityRole="button"
                  accessibilityLabel={c.place.name}>
                  <View style={styles.rowHeader}>
                    <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
                      {i === 0 ? '🏆 ' : ''}
                      {c.place.name}
                    </Text>
                    <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{c.place.subtitle}</Text>
                  </View>
                  <View style={styles.timesRow}>
                    {c.travelTimesMin.map((t, personIndex) => (
                      <View
                        key={personIndex}
                        style={[styles.timeChip, { backgroundColor: PARTICIPANT_COLORS[personIndex] }]}>
                        <Text style={styles.timeChipLabel}>{t == null ? '—' : `${Math.round(t)} min`}</Text>
                      </View>
                    ))}
                  </View>
                </Pressable>
              ))}
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
    maxHeight: '60%',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
    elevation: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
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
  empty: {
    color: '#8a8578',
    paddingVertical: 12,
  },
  list: {
    maxHeight: 380,
  },
  row: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0ede4',
  },
  rowHeader: {
    marginBottom: 6,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: '#3a3226',
  },
  subtitle: {
    fontSize: 12,
    color: '#8a8578',
    marginTop: 2,
  },
  timesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  timeChip: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginRight: 6,
    marginBottom: 4,
  },
  timeChipLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ffffff',
  },
});
