import React from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CATEGORIES } from '../categories/categories';
import type { AlongRouteResult } from './searchAlongRoute';
import { useTheme } from '../theme/ThemeContext';

// Same bottom-sheet Modal pattern as src/lists/ListViewSheet.tsx. Category
// chips reuse the app's existing category taxonomy (src/categories/) rather
// than inventing a separate "along route" category list — gas/food/ATM are
// already in there.

const ALONG_ROUTE_CATEGORIES = ['fuel', 'restaurant', 'bank_atm', 'cafe'];

type Props = {
  visible: boolean;
  activeCategory: string | null;
  loading: boolean;
  error: string | null;
  results: AlongRouteResult[];
  onSelectCategory: (key: string) => void;
  onSelectResult: (result: AlongRouteResult) => void;
  onClose: () => void;
  // Fires once this Modal's own dismiss animation has actually finished —
  // see useAlongRoute.ts's header comment for why: RoutePanel's own Modal
  // waits for this before re-presenting itself, since two <Modal>s can't
  // both be presented at once from the same view controller.
  onDismiss?: () => void;
};

export default function AlongRouteSheet({
  visible,
  activeCategory,
  loading,
  error,
  results,
  onSelectCategory,
  onSelectResult,
  onClose,
  onDismiss,
}: Props) {
  const { colors } = useTheme();
  const categories = CATEGORIES.filter(c => ALONG_ROUTE_CATEGORIES.includes(c.key));

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose} onDismiss={onDismiss}>
      <View style={styles.backdrop} pointerEvents="box-none">
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <View style={[styles.sheet, { backgroundColor: colors.card }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>🔍 Search along route</Text>
            <Pressable
              style={[styles.closeButton, { backgroundColor: colors.divider }]}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close">
              <Text style={[styles.closeLabel, { color: colors.textPrimary }]}>✕</Text>
            </Pressable>
          </View>

          <View style={styles.chipRow}>
            {categories.map(c => (
              <Pressable
                key={c.key}
                style={[
                  styles.chip,
                  activeCategory === c.key && styles.chipActive,
                  { backgroundColor: activeCategory === c.key ? colors.textPrimary : colors.divider },
                ]}
                onPress={() => onSelectCategory(c.key)}
                accessibilityRole="button"
                accessibilityLabel={c.label}
                accessibilityState={{ selected: activeCategory === c.key }}>
                <Text
                  style={[
                    styles.chipLabel,
                    activeCategory === c.key && styles.chipLabelActive,
                    { color: activeCategory === c.key ? colors.onTextPrimary : colors.textPrimary },
                  ]}>
                  {c.emoji} {c.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {loading && (
            <View style={styles.centerRow}>
              <ActivityIndicator size="small" color={colors.textSecondary} />
              <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Searching along your route…</Text>
            </View>
          )}

          {error && !loading && <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>}

          {!loading && !error && activeCategory && results.length === 0 && (
            <Text style={[styles.empty, { color: colors.textSecondary }]}>Nothing found within 3km of your route.</Text>
          )}

          {!loading && results.length > 0 && (
            <ScrollView style={styles.list}>
              {results.map(r => (
                <Pressable
                  key={r.id}
                  style={[styles.row, { borderBottomColor: colors.divider }]}
                  onPress={() => onSelectResult(r)}
                  accessibilityRole="button"
                  accessibilityLabel={r.name}>
                  <Text style={[styles.name, { color: colors.textPrimary }]}>{r.name}</Text>
                  <Text style={[styles.meta, { color: colors.textSecondary }]}>
                    {r.progressKm.toFixed(0)} km ahead · {r.detourKm < 0.1 ? 'right on your route' : `${r.detourKm.toFixed(1)} km off route`}
                  </Text>
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
    marginBottom: 10,
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
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#f0ede4',
    marginRight: 8,
    marginBottom: 8,
  },
  chipActive: {
    backgroundColor: '#3a3226',
  },
  chipLabel: {
    fontSize: 13,
    color: '#3a3226',
    fontWeight: '600',
  },
  chipLabelActive: {
    color: '#ffffff',
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
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0ede4',
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: '#3a3226',
  },
  meta: {
    fontSize: 12,
    color: '#8a8578',
    marginTop: 2,
  },
});
