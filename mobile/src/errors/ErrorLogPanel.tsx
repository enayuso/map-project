/**
 * Views/shares the local error log (./logger.ts) — reached via More >
 * 🐞 Error log. The whole point of persisting errors locally instead of
 * just console.error-ing them: a solo dev can ask a beta tester "open
 * More, tap Error log, tap Share" and get a real report back over
 * Messages/email/whatever, without needing their device in hand. Uses
 * React Native's own built-in Share API — no new dependency.
 */
import React from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import type { LoggedError } from './logger';
import { useTheme } from '../theme/ThemeContext';

type Props = {
  visible: boolean;
  onClose: () => void;
  entries: LoggedError[];
  onClear: () => void;
};

export default function ErrorLogPanel({ visible, onClose, entries, onClear }: Props) {
  const { colors } = useTheme();
  if (!visible) return null;

  const handleShare = () => {
    if (entries.length === 0) return;
    const text = entries
      .map(e => `[${e.timestamp}] ${e.scope}: ${e.message}${e.stack ? `\n${e.stack}` : ''}`)
      .join('\n\n');
    // The share sheet itself caps message size on some targets (Messages
    // in particular); keeping this well under any of those limits matters
    // more than including literally every one of up to 100 entries.
    Share.share({ message: text.slice(0, 20000) });
  };

  return (
    <View style={styles.container}>
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Error log</Text>
          <Pressable
            style={[styles.closeButton, { backgroundColor: colors.divider }]}
            onPress={onClose}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close">
            <Text style={[styles.closeLabel, { color: colors.textPrimary }]}>✕</Text>
          </Pressable>
        </View>

        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {entries.length === 0
            ? 'Nothing logged this session — good sign.'
            : `${entries.length} error${entries.length === 1 ? '' : 's'} logged on this device, most recent first.`}
        </Text>

        {entries.length > 0 && (
          <ScrollView style={styles.list} nestedScrollEnabled showsVerticalScrollIndicator={false}>
            {entries.map((e, i) => (
              <View
                key={`${e.timestamp}-${i}`}
                style={[styles.row, { borderBottomColor: colors.divider }, i === entries.length - 1 && styles.rowLast]}>
                <View style={styles.rowTop}>
                  <Text style={[styles.rowScope, { color: colors.danger }]}>{e.scope}</Text>
                  <Text style={[styles.rowTime, { color: colors.textSecondary }]}>
                    {new Date(e.timestamp).toLocaleTimeString()}
                  </Text>
                </View>
                <Text style={[styles.rowMessage, { color: colors.textPrimary }]} numberOfLines={2}>
                  {e.message}
                </Text>
              </View>
            ))}
          </ScrollView>
        )}

        {entries.length > 0 && (
          <View style={styles.actions}>
            <Pressable
              style={[styles.actionButton, { backgroundColor: colors.textPrimary }]}
              onPress={handleShare}
              accessibilityRole="button"
              accessibilityLabel="Share error log">
              <Text style={[styles.actionButtonText, { color: colors.onTextPrimary }]}>Share log</Text>
            </Pressable>
            <Pressable
              style={[styles.actionButton, { backgroundColor: colors.divider }]}
              onPress={onClear}
              accessibilityRole="button"
              accessibilityLabel="Clear error log">
              <Text style={[styles.actionButtonText, { color: colors.textPrimary }]}>Clear</Text>
            </Pressable>
          </View>
        )}
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
    padding: 14,
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
  subtitle: {
    fontSize: 12,
    color: '#8a8578',
    marginTop: 4,
    marginBottom: 8,
  },
  list: {
    maxHeight: 280,
  },
  row: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0ede4',
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  rowScope: {
    fontSize: 12,
    fontWeight: '700',
    color: '#b3261e',
  },
  rowTime: {
    fontSize: 11,
    color: '#8a8578',
  },
  rowMessage: {
    fontSize: 13,
    color: '#3a3226',
  },
  actions: {
    flexDirection: 'row',
    marginTop: 10,
    gap: 8,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#3a3226',
    borderRadius: 16,
    paddingVertical: 9,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 13,
  },
});
