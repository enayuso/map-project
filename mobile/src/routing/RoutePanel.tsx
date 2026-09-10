import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { Costing, RouteResult } from './api';

export const COSTING_LABELS: Record<Costing, string> = {
  auto: '🚗 Drive',
  pedestrian: '🚶 Walk',
  bicycle: '🚲 Bike',
};

// A real drag-to-expand bottom sheet, not a fixed box — matching Kakao/
// Naver's own route panel, which opens collapsed to just the essentials
// (distance/time/Start) and only shows the full turn list once you
// deliberately drag it up. Two snap points, height-animated (not
// translateY): PEEK_HEIGHT is exported so App.tsx's route auto-fit
// (Camera.fitBounds's bottom padding) always reserves exactly the space
// this panel actually occupies at rest, rather than an independent guess
// that can drift out of sync with this file's own layout.
export const PEEK_HEIGHT = 210;
const EXPANDED_FRACTION = 0.68; // of screen height, for the dragged-open state
// Past the halfway point between the two heights (or a fast enough upward
// flick), a release snaps to expanded rather than back to peek.
const VELOCITY_FLICK_THRESHOLD = 0.5;

type Props = {
  visible: boolean;
  loading: boolean;
  error: string | null;
  route: RouteResult | null;
  costing: Costing;
  onChangeCosting: (c: Costing) => void;
  onClear: () => void;
  onStartNavigation: () => void;
  onSearchAlongRoute: () => void;
};

export default function RoutePanel({
  visible,
  loading,
  error,
  route,
  costing,
  onChangeCosting,
  onClear,
  onStartNavigation,
  onSearchAlongRoute,
}: Props) {
  const expandedHeight = Dimensions.get('window').height * EXPANDED_FRACTION;
  const midpoint = (PEEK_HEIGHT + expandedHeight) / 2;

  const heightAnim = useRef(new Animated.Value(PEEK_HEIGHT)).current;
  const isExpandedRef = useRef(false);
  const dragStartHeightRef = useRef(PEEK_HEIGHT);

  const snapTo = (height: number) => {
    isExpandedRef.current = height > PEEK_HEIGHT;
    Animated.spring(heightAnim, {
      toValue: height,
      useNativeDriver: false, // animating a layout property (height), not transform/opacity
      bounciness: 4,
    }).start();
  };

  // A new route (including a costing-switch refetch) always reopens at
  // peek — staying expanded from whatever the *previous* route was left at
  // would be a surprising, not-actually-requested state.
  useEffect(() => {
    if (route) snapTo(PEEK_HEIGHT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      // Only claims the gesture once it's clearly a vertical drag — a plain
      // tap on a costing button underneath this handle area still reaches
      // that button untouched, since PanResponder hasn't claimed anything
      // until movement past this threshold actually happens.
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 6,
      onPanResponderGrant: () => {
        dragStartHeightRef.current = isExpandedRef.current ? expandedHeight : PEEK_HEIGHT;
      },
      onPanResponderMove: (_, gesture) => {
        // Dragging up (negative dy) grows the sheet; clamp to the two snap
        // points as bounds rather than letting it overshoot either end.
        const next = dragStartHeightRef.current - gesture.dy;
        heightAnim.setValue(Math.max(PEEK_HEIGHT, Math.min(expandedHeight, next)));
      },
      onPanResponderRelease: (_, gesture) => {
        const current = dragStartHeightRef.current - gesture.dy;
        const shouldExpand =
          gesture.vy < -VELOCITY_FLICK_THRESHOLD ||
          (gesture.vy <= VELOCITY_FLICK_THRESHOLD && current > midpoint);
        snapTo(shouldExpand ? expandedHeight : PEEK_HEIGHT);
      },
    }),
  ).current;

  return (
    // Rendered in a Modal, not a plain overlay View — a native MapView
    // sibling can swallow touches meant for an absolutely-positioned RN
    // overlay (facebook/react-native#35612); see src/search/SearchBox.tsx
    // for the first time we hit this and mobile/README.md issue 6.
    <Modal transparent visible={visible} animationType="slide">
      <View style={styles.backdrop} pointerEvents="box-none">
        <Animated.View style={[styles.panel, { height: heightAnim }]}>
          {/* Drag handle + header are the only pan-responder surface — the
           * scrollable maneuver list below keeps its own native scroll
           * gesture once expanded, rather than fighting this one. */}
          <View {...panResponder.panHandlers}>
            <View style={styles.dragHandle} />
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
                <View style={styles.actionRow}>
                  <Pressable style={styles.startButton} onPress={onStartNavigation}>
                    <Text style={styles.startLabel}>▶ Start</Text>
                  </Pressable>
                  <Pressable style={styles.alongRouteButton} onPress={onSearchAlongRoute}>
                    <Text style={styles.alongRouteLabel}>🔍</Text>
                  </Pressable>
                </View>
                <Text style={styles.dragHint}>▲ Drag up for full directions</Text>
              </>
            )}
          </View>

          {route && !loading && (
            <ScrollView style={styles.maneuverList} keyboardShouldPersistTaps="handled">
              {route.maneuvers.map((m, i) => (
                <View key={i} style={styles.maneuverRow}>
                  <Text style={styles.maneuverText}>{m.instruction}</Text>
                </View>
              ))}
            </ScrollView>
          )}
        </Animated.View>
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
    paddingTop: 8,
    paddingHorizontal: 14,
    paddingBottom: 16,
    overflow: 'hidden', // critical: clips the maneuver list to whatever height is currently animated, rather than letting it visually spill out below the peek height
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
    elevation: 6,
  },
  dragHandle: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#e5e1d6',
    alignSelf: 'center',
    marginBottom: 10,
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
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  startButton: {
    flex: 1,
    backgroundColor: '#2f9e44',
    borderRadius: 20,
    paddingVertical: 10,
    alignItems: 'center',
  },
  startLabel: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  alongRouteButton: {
    marginLeft: 8,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f0ede4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  alongRouteLabel: {
    fontSize: 16,
  },
  dragHint: {
    textAlign: 'center',
    fontSize: 11,
    color: '#8a8578',
    marginTop: 8,
  },
  maneuverList: {
    flex: 1,
    marginTop: 8,
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
