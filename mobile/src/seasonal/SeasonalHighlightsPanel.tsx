import React from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { SeasonalHighlight } from './api';
import { seasonStatus, type SeasonStatus } from './seasonalStatus';
import { useTheme } from '../theme/ThemeContext';

// Bottom-sheet Modal, same pattern as src/ferries/FerryPanel.tsx and
// src/dive-sites/DiveSitesPanel.tsx. Belize's analog of Kakao Map's own
// seasonal cherry-blossom layer (see docs/research/13-belize-seasonal-
// highlights-sourcing.md) — real, curated fishery/wildlife seasons, each
// shown with its own honestly-varying confidence level rather than
// presenting every entry with the same authority.

const STATUS_LABEL: Record<SeasonStatus, string> = {
  active: 'In season now',
  upcoming: 'Starting soon',
  'off-season': 'Not in season',
};

function statusColor(status: SeasonStatus, colors: ReturnType<typeof useTheme>['colors']): string {
  if (status === 'active') return '#2f9e44';
  if (status === 'upcoming') return '#d9a441';
  return colors.textSecondary;
}

// Active first, then upcoming, then everything else — the entries worth
// seeing right now belong at the top, same reasoning as any other
// freshness-sorted list in this app.
const STATUS_ORDER: Record<SeasonStatus, number> = { active: 0, upcoming: 1, 'off-season': 2 };

type Props = {
  visible: boolean;
  loading: boolean;
  error: string | null;
  highlights: SeasonalHighlight[];
  onClose: () => void;
  // Fed to the underlying <Modal> — see src/modals/useModalCoordinator.ts's
  // header comment for why this app's Modal-based panels report their own
  // dismiss completion back rather than just driving `visible` directly.
  onDismiss?: () => void;
};

export default function SeasonalHighlightsPanel({ visible, loading, error, highlights, onClose, onDismiss }: Props) {
  const { colors } = useTheme();
  const sorted = [...highlights].sort(
    (a, b) => STATUS_ORDER[seasonStatus(a.activeWindow)] - STATUS_ORDER[seasonStatus(b.activeWindow)],
  );

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
            <Text style={[styles.title, { color: colors.textPrimary }]}>🌴 Seasonal highlights</Text>
            <Pressable
              style={[styles.closeButton, { backgroundColor: colors.divider }]}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close">
              <Text style={[styles.closeLabel, { color: colors.textPrimary }]}>✕</Text>
            </Pressable>
          </View>

          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            Curated from official and conservation sources, not a live feed — see each entry's own source and
            confidence before relying on it (especially conch, which can close earlier than shown).
          </Text>

          {loading && (
            <View style={styles.centerRow}>
              <ActivityIndicator size="small" color={colors.textSecondary} />
              <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading highlights…</Text>
            </View>
          )}
          {error && !loading && <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>}

          {!loading && !error && (
            <ScrollView style={styles.list}>
              {sorted.map(h => {
                const status = seasonStatus(h.activeWindow);
                return (
                  <View key={h.id} style={styles.card}>
                    <View style={styles.cardHeader}>
                      <Text style={[styles.highlightName, { color: colors.textPrimary }]}>
                        {h.emoji} {h.name}
                      </Text>
                      <View style={[styles.statusBadge, { backgroundColor: statusColor(status, colors) }]}>
                        <Text style={styles.statusBadgeText}>{STATUS_LABEL[status]}</Text>
                      </View>
                    </View>

                    <Text style={[styles.description, { color: colors.textPrimary }]}>{h.description}</Text>
                    <Text style={[styles.meta, { color: colors.textSecondary }]}>Source: {h.source}</Text>
                    <Text style={[styles.meta, { color: colors.textSecondary }]}>Confidence: {h.confidence}</Text>
                    <Text style={styles.lastVerified}>Last verified {h.lastVerifiedAt}</Text>
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
    marginBottom: 6,
  },
  highlightName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#3a3226',
  },
  statusBadge: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  description: {
    fontSize: 12,
    marginBottom: 6,
  },
  meta: {
    fontSize: 11,
    marginTop: 2,
  },
  lastVerified: {
    fontSize: 11,
    color: '#a39d8c',
    marginTop: 8,
  },
});
