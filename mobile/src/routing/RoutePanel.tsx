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
import type { Costing, RouteResult } from './api';

const COSTING_LABELS: Record<Costing, string> = {
  auto: '🚗 Drive',
  pedestrian: '🚶 Walk',
  bicycle: '🚲 Bike',
};

type Props = {
  visible: boolean;
  loading: boolean;
  error: string | null;
  route: RouteResult | null;
  costing: Costing;
  onChangeCosting: (c: Costing) => void;
  onClear: () => void;
};

export default function RoutePanel({
  visible,
  loading,
  error,
  route,
  costing,
  onChangeCosting,
  onClear,
}: Props) {
  return (
    // Rendered in a Modal, not a plain overlay View — a native MapView
    // sibling can swallow touches meant for an absolutely-positioned RN
    // overlay (facebook/react-native#35612); see src/search/SearchBox.tsx
    // for the first time we hit this and mobile/README.md issue 6.
    <Modal transparent visible={visible} animationType="slide">
      <View style={styles.backdrop} pointerEvents="box-none">
        <View style={styles.panel}>
          <View style={styles.costingRow}>
            {(Object.keys(COSTING_LABELS) as Costing[]).map(c => (
              <Pressable
                key={c}
                style={[styles.costingButton, costing === c && styles.costingButtonActive]}
                onPress={() => onChangeCosting(c)}>
                <Text
                  style={[
                    styles.costingLabel,
                    costing === c && styles.costingLabelActive,
                  ]}>
                  {COSTING_LABELS[c]}
                </Text>
              </Pressable>
            ))}
            <Pressable style={styles.clearButton} onPress={onClear}>
              <Text style={styles.clearLabel}>✕</Text>
            </Pressable>
          </View>

          {loading && (
            <View style={styles.centerRow}>
              <ActivityIndicator size="small" color="#8a8578" />
              <Text style={styles.loadingText}>Finding route…</Text>
            </View>
          )}

          {error && !loading && <Text style={styles.errorText}>{error}</Text>}

          {route && !loading && (
            <>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryText}>
                  {route.distanceKm.toFixed(1)} km · {Math.round(route.durationMin)} min
                </Text>
                {route.hasFerry && (
                  <Text style={styles.ferryBadge}>⛴ includes ferry</Text>
                )}
              </View>
              <ScrollView style={styles.maneuverList}>
                {route.maneuvers.map((m, i) => (
                  <View key={i} style={styles.maneuverRow}>
                    <Text style={styles.maneuverText}>{m.instruction}</Text>
                  </View>
                ))}
              </ScrollView>
            </>
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
  panel: {
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
  costingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  costingButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#f0ede4',
    marginRight: 8,
  },
  costingButtonActive: {
    backgroundColor: '#3a3226',
  },
  costingLabel: {
    fontSize: 13,
    color: '#3a3226',
    fontWeight: '600',
  },
  costingLabelActive: {
    color: '#ffffff',
  },
  clearButton: {
    marginLeft: 'auto',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f0ede4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearLabel: {
    fontSize: 15,
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
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#3a3226',
  },
  ferryBadge: {
    marginLeft: 10,
    fontSize: 12,
    color: '#2b6cb0',
  },
  maneuverList: {
    maxHeight: 220,
  },
  maneuverRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0ede4',
  },
  maneuverText: {
    fontSize: 14,
    color: '#3a3226',
  },
});
