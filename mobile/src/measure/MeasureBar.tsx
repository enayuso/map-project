import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

export type MeasureMode = 'distance' | 'area';

type Props = {
  mode: MeasureMode;
  onChangeMode: (mode: MeasureMode) => void;
  pointCount: number;
  totalLabel: string;
  onUndo: () => void;
  onClear: () => void;
  onClose: () => void;
};

export default function MeasureBar({
  mode,
  onChangeMode,
  pointCount,
  totalLabel,
  onUndo,
  onClear,
  onClose,
}: Props) {
  const { colors } = useTheme();
  return (
    <View style={styles.container}>
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <View style={styles.topRow}>
          <View style={[styles.modeToggle, { backgroundColor: colors.divider }]}>
            <Pressable
              style={[
                styles.modeButton,
                mode === 'distance' && styles.modeButtonActive,
                mode === 'distance' && { backgroundColor: colors.textPrimary },
              ]}
              onPress={() => onChangeMode('distance')}
              accessibilityRole="button"
              accessibilityLabel="Distance"
              accessibilityState={{ selected: mode === 'distance' }}>
              <Text
                style={[
                  styles.modeLabel,
                  { color: colors.textPrimary },
                  mode === 'distance' && styles.modeLabelActive,
                  mode === 'distance' && { color: colors.onTextPrimary },
                ]}>
                📏 Distance
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.modeButton,
                mode === 'area' && styles.modeButtonActive,
                mode === 'area' && { backgroundColor: colors.textPrimary },
              ]}
              onPress={() => onChangeMode('area')}
              accessibilityRole="button"
              accessibilityLabel="Area"
              accessibilityState={{ selected: mode === 'area' }}>
              <Text
                style={[
                  styles.modeLabel,
                  { color: colors.textPrimary },
                  mode === 'area' && styles.modeLabelActive,
                  mode === 'area' && { color: colors.onTextPrimary },
                ]}>
                ⬜ Area
              </Text>
            </Pressable>
          </View>
          <Pressable
            style={styles.closeButton}
            onPress={onClose}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Done">
            <Text style={[styles.closeLabel, { color: colors.textPrimary }]}>✕ Done</Text>
          </Pressable>
        </View>

        <View style={styles.bottomRow}>
          <Text style={[styles.total, { color: colors.accent }]}>
            {pointCount === 0
              ? 'Tap the map to start'
              : mode === 'area' && pointCount < 3
                ? `${totalLabel} — add ${3 - pointCount} more point${3 - pointCount > 1 ? 's' : ''}`
                : totalLabel}
          </Text>
          <View style={styles.actions}>
            <Pressable
              style={styles.smallButton}
              onPress={onUndo}
              disabled={pointCount === 0}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Undo">
              <Text
                style={[
                  styles.smallButtonLabel,
                  { color: colors.textPrimary },
                  pointCount === 0 && styles.smallButtonLabelDisabled,
                ]}>
                ↺ Undo
              </Text>
            </Pressable>
            {/* Kakao's own mobile tool uses a single red X for this — see
             * geometry.ts's header comment on the research finding that its
             * exact scope (clear one point vs. the whole path vs. exit
             * measuring) was never confirmed. Splitting it into two clearly
             * distinct actions (this one clears the shape but stays in
             * measuring mode; "✕ Done" above fully exits) resolves that
             * ambiguity instead of guessing at Kakao's real behavior. */}
            <Pressable
              style={styles.smallButton}
              onPress={onClear}
              disabled={pointCount === 0}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Clear measurement">
              <Text
                style={[
                  styles.smallButtonLabel,
                  { color: colors.textPrimary },
                  styles.clearLabel,
                  { color: colors.danger },
                  pointCount === 0 && styles.smallButtonLabelDisabled,
                ]}>
                ✕ Clear
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 60,
    left: 12,
    right: 12,
    zIndex: 10,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  modeToggle: {
    flexDirection: 'row',
    flex: 1,
    backgroundColor: '#f0ede4',
    borderRadius: 18,
    padding: 3,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 15,
    alignItems: 'center',
  },
  modeButtonActive: {
    backgroundColor: '#3a3226',
  },
  modeLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3a3226',
  },
  modeLabelActive: {
    color: '#ffffff',
  },
  closeButton: {
    marginLeft: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  closeLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3a3226',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  total: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#2b6cb0',
  },
  actions: {
    flexDirection: 'row',
  },
  smallButton: {
    marginLeft: 12,
  },
  smallButtonLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3a3226',
  },
  smallButtonLabelDisabled: {
    color: '#c7c2b4',
  },
  clearLabel: {
    color: '#b3261e',
  },
});
