import React from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { FerryRoute } from './api';
import { useTheme } from '../theme/ThemeContext';

// Bottom-sheet Modal, same pattern as src/lists/ListViewSheet.tsx. Content
// is deliberately upfront about being curated, not live — see api.ts's
// header comment — every route card shows "Last verified" and links out
// to the operator's own current page rather than pretending this app's
// copy is the source of truth.

type Props = {
  visible: boolean;
  loading: boolean;
  error: string | null;
  routes: FerryRoute[];
  onClose: () => void;
  // Fed to the underlying <Modal> — see src/modals/useModalCoordinator.ts's
  // header comment for why this app's Modal-based panels report their own
  // dismiss completion back rather than just driving `visible` directly.
  onDismiss?: () => void;
};

export default function FerryPanel({ visible, loading, error, routes, onClose, onDismiss }: Props) {
  const { colors } = useTheme();
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
            <Text style={[styles.title, { color: colors.textPrimary }]}>⛴️ Water taxis &amp; ferries</Text>
            <Pressable
              style={[styles.closeButton, { backgroundColor: colors.divider }]}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close">
              <Text style={[styles.closeLabel, { color: colors.textPrimary }]}>✕</Text>
            </Pressable>
          </View>

          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            Curated from operators' own published schedules, not a live feed — always confirm times
            directly before traveling.
          </Text>

          {loading && (
            <View style={styles.centerRow}>
              <ActivityIndicator size="small" color={colors.textSecondary} />
              <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading routes…</Text>
            </View>
          )}
          {error && !loading && <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>}

          {!loading && !error && (
            <ScrollView style={styles.list}>
              {routes.map(route => (
                <View key={route.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={[styles.routeName, { color: colors.textPrimary }]}>{route.name}</Text>
                    {route.isInternational && (
                      <View style={[styles.intlBadge, { backgroundColor: colors.accent }]}>
                        <Text style={styles.intlBadgeText}>International</Text>
                      </View>
                    )}
                  </View>

                  {route.operators.map(op => (
                    <Pressable
                      key={op.name}
                      style={styles.operatorRow}
                      onPress={() => op.url && Linking.openURL(op.url)}
                      disabled={!op.url}
                      accessibilityRole="button"
                      accessibilityLabel={op.url ? `Open ${op.name} website` : op.name}>
                      <Text style={[styles.operatorName, { color: colors.accent }]}>
                        {op.name}
                        {op.url ? '  ↗' : ''}
                      </Text>
                      {op.phone && <Text style={[styles.operatorPhone, { color: colors.textSecondary }]}>{op.phone}</Text>}
                      {op.contactNote && (
                        <Text style={[styles.operatorNote, { color: colors.textSecondary }]}>{op.contactNote}</Text>
                      )}
                    </Pressable>
                  ))}

                  {route.sampleDepartures.length > 0 && (
                    <View style={styles.departuresBlock}>
                      {route.sampleDepartures.map(d => (
                        <Text key={d.from} style={[styles.departureLine, { color: colors.textPrimary }]}>
                          From {d.from}: {d.times.join(', ')}
                        </Text>
                      ))}
                    </View>
                  )}

                  <Text style={[styles.routeNotes, { color: colors.textSecondary }]}>{route.notes}</Text>
                  <Text style={styles.lastVerified}>Last verified {route.lastVerifiedAt}</Text>
                </View>
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
    marginBottom: 6,
  },
  routeName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#3a3226',
  },
  intlBadge: {
    backgroundColor: '#2b6cb0',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  intlBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  operatorRow: {
    marginBottom: 4,
  },
  operatorName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2b6cb0',
  },
  operatorPhone: {
    fontSize: 12,
    color: '#8a8578',
  },
  operatorNote: {
    fontSize: 11,
    color: '#8a8578',
    fontStyle: 'italic',
    marginTop: 2,
  },
  departuresBlock: {
    marginTop: 6,
    marginBottom: 4,
  },
  departureLine: {
    fontSize: 12,
    color: '#3a3226',
  },
  routeNotes: {
    fontSize: 12,
    color: '#8a8578',
    marginTop: 6,
  },
  lastVerified: {
    fontSize: 11,
    color: '#a39d8c',
    marginTop: 8,
  },
});
