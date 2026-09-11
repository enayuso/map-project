/**
 * The "More" menu — one button opening a list, instead of a right-edge
 * column of icon buttons.
 *
 * Why: this app had grown a standalone floating button for every utility
 * feature (weather, saved lists, offline maps, live-location sharing,
 * road hazards, ferry schedules, dive sites) — seven of them, stacked
 * vertically down the right edge on top of the locate/satellite/zoom
 * controls. Real Kakao Map and Naver Map screenshots (checked directly,
 * not assumed) both keep that edge to just 3-4 buttons — Kakao: road-view,
 * a single "레이어" (layers) button, current-location; Naver: layers,
 * favorites, a pin toggle, current-location — and move everything else
 * either into a horizontal chip row under the search box (Kakao) or
 * behind a single expandable "More" button (an actual NAVER Map iOS SDK
 * changelog entry: "a More button was added to expand the map area and
 * display hidden buttons"). This component is that button's menu.
 *
 * Deliberately generic (an `items` array, not one named prop per feature)
 * since unlike every other panel in this app, this component's whole job
 * is to be a plain list — it doesn't know or care what each row does.
 * Each row's `onPress` is one of the app's existing toggle*() functions,
 * unchanged — this only changes how they're reached, not what they do.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

export type MoreMenuItem = {
  key: string;
  icon: string;
  label: string;
  onPress: () => void;
  /** Shows an "On" pill — for persistent map-layer toggles (hazards, dive
   * sites), not one-shot panel openers (weather, lists, offline, sharing,
   * ferry), which have nothing meaningful to show as "on/off". */
  active?: boolean;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  items: MoreMenuItem[];
};

export default function MoreMenu({ visible, onClose, items }: Props) {
  const { colors } = useTheme();
  if (!visible) return null;

  return (
    <View style={styles.container}>
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>More</Text>
          <Pressable
            style={[styles.closeButton, { backgroundColor: colors.divider }]}
            onPress={onClose}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close">
            <Text style={[styles.closeLabel, { color: colors.textPrimary }]}>✕</Text>
          </Pressable>
        </View>

        {items.map((item, i) => (
          <Pressable
            key={item.key}
            style={[
              styles.row,
              { borderBottomColor: colors.divider },
              i === items.length - 1 && styles.rowLast,
            ]}
            onPress={item.onPress}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            accessibilityState={item.active !== undefined ? { selected: item.active } : undefined}>
            <Text style={styles.icon}>{item.icon}</Text>
            <Text style={[styles.label, { color: colors.textPrimary }]}>{item.label}</Text>
            {item.active && (
              <View style={styles.activePill}>
                <Text style={styles.activePillText}>On</Text>
              </View>
            )}
          </Pressable>
        ))}
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
    paddingHorizontal: 14,
    paddingTop: 14,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#3a3226',
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f0ede4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeLabel: {
    fontSize: 13,
    color: '#3a3226',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0ede4',
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  icon: {
    fontSize: 20,
    width: 30,
  },
  label: {
    flex: 1,
    fontSize: 15,
    color: '#3a3226',
  },
  activePill: {
    backgroundColor: '#e3f0ec',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  activePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2c6e5e',
  },
});
