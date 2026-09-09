import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { CATEGORIES } from './categories';

type Props = {
  active: string | null;
  onSelect: (key: string) => void;
};

/**
 * Horizontal row of category quick-filter chips under the search box — the
 * "browse nearby by category" interaction that's more central to daily
 * Kakao/Naver Map use than typed search. A plain absolutely-positioned
 * overlay (not a Modal): it's always-mounted and Pressable-based, the same
 * shape as App.tsx's "🧭 Directions" button, which has been confirmed
 * working as a plain overlay — the Modal workaround in mobile/README.md
 * issue 6 was specifically needed for a list that mounts/unmounts over the
 * map, not a static control like this one.
 */
export default function CategoryBar({ active, onSelect }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.container}
      contentContainerStyle={styles.content}>
      {CATEGORIES.map(cat => {
        const isActive = cat.key === active;
        return (
          <Pressable
            key={cat.key}
            style={[styles.chip, isActive && styles.chipActive]}
            onPress={() => onSelect(cat.key)}>
            <Text style={styles.chipEmoji}>{cat.emoji}</Text>
            <Text style={[styles.chipLabel, isActive && styles.chipLabelActive]}>
              {cat.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 112,
    left: 12,
    right: 0,
    zIndex: 9,
  },
  content: {
    paddingRight: 24,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 18,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 8,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  chipActive: {
    backgroundColor: '#3a3226',
  },
  chipEmoji: {
    fontSize: 14,
    marginRight: 5,
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3a3226',
  },
  chipLabelActive: {
    color: '#ffffff',
  },
});
