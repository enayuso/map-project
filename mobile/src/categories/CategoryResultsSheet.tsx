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
import { formatDistanceKm, type NearbyResult } from './categories';
import { useTheme } from '../theme/ThemeContext';

type Props = {
  visible: boolean;
  loading: boolean;
  error: string | null;
  categoryLabel: string;
  results: NearbyResult[];
  onSelect: (result: NearbyResult) => void;
  onClose: () => void;
};

export default function CategoryResultsSheet({
  visible,
  loading,
  error,
  categoryLabel,
  results,
  onSelect,
  onClose,
}: Props) {
  const { colors } = useTheme();
  return (
    // Modal, not a plain overlay — this list mounts/unmounts based on
    // state, the exact shape of overlay that facebook/react-native#35612
    // affects (see src/search/SearchBox.tsx and mobile/README.md issue 6).
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
            <Text style={[styles.title, { color: colors.textPrimary }]}>{categoryLabel} nearby</Text>
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
              <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Looking nearby…</Text>
            </View>
          )}

          {error && !loading && <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>}

          {!loading && !error && results.length === 0 && (
            <Text style={[styles.empty, { color: colors.textSecondary }]}>
              Nothing found within 8 km — try panning the map first.
            </Text>
          )}

          {!loading && results.length > 0 && (
            <ScrollView style={styles.list}>
              {results.map(r => (
                <Pressable
                  key={r.id}
                  style={[styles.row, { borderBottomColor: colors.divider }]}
                  onPress={() => onSelect(r)}
                  accessibilityRole="button"
                  accessibilityLabel={r.name}>
                  <View style={styles.rowText}>
                    <Text style={[styles.name, { color: colors.textPrimary }]}>{r.name}</Text>
                    <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                      {r.subtitle}
                    </Text>
                  </View>
                  <Text style={[styles.distance, { color: colors.accent }]}>{formatDistanceKm(r.distanceKm)}</Text>
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
    maxHeight: '55%',
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
    maxHeight: 320,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0ede4',
  },
  rowText: {
    flex: 1,
    marginRight: 8,
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
  distance: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2b6cb0',
  },
});
