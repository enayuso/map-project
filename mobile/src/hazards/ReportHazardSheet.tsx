import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { HAZARD_TYPE_LABELS, type HazardType } from './api';
import { useTheme } from '../theme/ThemeContext';

// Same "quick, dismissable utility overlay" pattern as src/sharing/
// SharingPanel.tsx — a plain top-anchored card, not a Modal (this app's
// touch-swallowing workaround only applies to panels that need to sit over
// the map's own gesture area, e.g. RoutePanel's bottom sheet).

const HAZARD_TYPES: HazardType[] = ['flooding', 'washout', 'checkpoint', 'crash', 'hazard'];

// Plain-text (no emoji) equivalents of HAZARD_TYPE_LABELS, for VoiceOver —
// accessibilityLabel should never speak the literal emoji glyph.
const HAZARD_TYPE_ACCESSIBLE_LABELS: Record<HazardType, string> = {
  flooding: 'Flooding',
  washout: 'Washed-out road',
  checkpoint: 'Checkpoint',
  crash: 'Crash',
  hazard: 'Other hazard',
};

type Props = {
  visible: boolean;
  onClose: () => void;
  locationLabel: string; // "at your current location" or "at map center" — set by App.tsx depending on GPS availability
  submitting: boolean;
  error: string | null;
  onSubmit: (type: HazardType, note: string) => void;
};

export default function ReportHazardSheet({
  visible,
  onClose,
  locationLabel,
  submitting,
  error,
  onSubmit,
}: Props) {
  const { colors } = useTheme();
  const [type, setType] = useState<HazardType>('hazard');
  const [note, setNote] = useState('');

  if (!visible) return null;

  const handleSubmit = () => {
    onSubmit(type, note.trim());
    setNote('');
    setType('hazard');
  };

  return (
    <View style={styles.container}>
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>🚧 Report a hazard</Text>
          <Pressable
            style={[styles.closeButton, { backgroundColor: colors.divider }]}
            onPress={onClose}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close">
            <Text style={[styles.closeLabel, { color: colors.textPrimary }]}>✕</Text>
          </Pressable>
        </View>

        <Text style={[styles.hint, { color: colors.textSecondary }]}>Reporting {locationLabel}. Visible to nearby drivers for a few hours.</Text>

        <View style={styles.typeGrid}>
          {HAZARD_TYPES.map(t => (
            <Pressable
              key={t}
              style={[
                styles.typeChip,
                type === t && styles.typeChipActive,
                { backgroundColor: type === t ? colors.textPrimary : colors.divider },
              ]}
              onPress={() => setType(t)}
              accessibilityRole="button"
              accessibilityLabel={HAZARD_TYPE_ACCESSIBLE_LABELS[t]}
              accessibilityState={{ selected: type === t }}>
              <Text
                style={[
                  styles.typeLabel,
                  type === t && styles.typeLabelActive,
                  { color: type === t ? colors.onTextPrimary : colors.textPrimary },
                ]}>
                {HAZARD_TYPE_LABELS[t]}
              </Text>
            </Pressable>
          ))}
        </View>

        <TextInput
          style={[styles.noteInput, { borderColor: colors.dividerStrong, color: colors.textPrimary }]}
          placeholder={'Optional note (e.g. "blocking both lanes")'}
          placeholderTextColor={colors.textSecondary}
          maxLength={140}
          value={note}
          onChangeText={setNote}
        />

        <Pressable
          style={[styles.submitButton, { backgroundColor: colors.danger }]}
          onPress={handleSubmit}
          disabled={submitting}
          accessibilityRole="button"
          accessibilityLabel="Submit report">
          {submitting ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={styles.submitLabel}>Submit report</Text>
          )}
        </Pressable>
        {error && <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>}
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
    fontSize: 15,
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
  hint: {
    fontSize: 12,
    color: '#8a8578',
    marginBottom: 10,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  typeChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#f0ede4',
    marginRight: 8,
    marginBottom: 8,
  },
  typeChipActive: {
    backgroundColor: '#3a3226',
  },
  typeLabel: {
    fontSize: 13,
    color: '#3a3226',
    fontWeight: '600',
  },
  typeLabelActive: {
    color: '#ffffff',
  },
  noteInput: {
    borderWidth: 1,
    borderColor: '#e5e1d6',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#3a3226',
    marginBottom: 10,
  },
  submitButton: {
    backgroundColor: '#b3261e',
    borderRadius: 20,
    paddingVertical: 10,
    alignItems: 'center',
  },
  submitLabel: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  errorText: {
    color: '#b3261e',
    fontSize: 12,
    marginTop: 8,
  },
});
