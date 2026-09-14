import React, { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CATEGORIES } from '../categories/categories';
import type { CorrectionField } from './api';
import { useTheme } from '../theme/ThemeContext';

// Bottom-sheet Modal, same pattern as src/places/PlaceCard.tsx — this
// opens right after PlaceCard closes (see App.tsx's handleOpenCorrection),
// so it's the same "replaces the previous bottom sheet" interaction.

const FIELD_LABELS: Record<CorrectionField, string> = {
  name: '✏️ Wrong name',
  category: '🏷️ Wrong category',
  closed: '🚫 Permanently closed',
  other: '💬 Something else',
};

// VoiceOver reads these instead of FIELD_LABELS above — same options, minus
// the leading emoji glyph.
const FIELD_ACCESSIBILITY_LABELS: Record<CorrectionField, string> = {
  name: 'Wrong name',
  category: 'Wrong category',
  closed: 'Permanently closed',
  other: 'Something else',
};

type Props = {
  visible: boolean;
  placeName: string;
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (field: CorrectionField, suggestedValue: string, note: string) => void;
};

export default function ReportCorrectionSheet({
  visible,
  placeName,
  submitting,
  error,
  onClose,
  onSubmit,
}: Props) {
  const { colors } = useTheme();
  const [field, setField] = useState<CorrectionField>('name');
  const [nameInput, setNameInput] = useState('');
  const [categoryKey, setCategoryKey] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const reset = () => {
    setField('name');
    setNameInput('');
    setCategoryKey(null);
    setNote('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const canSubmit =
    field === 'name' ? nameInput.trim().length > 0 : field === 'category' ? !!categoryKey : true;

  const handleSubmit = () => {
    const suggestedValue = field === 'name' ? nameInput.trim() : field === 'category' ? categoryKey! : '';
    onSubmit(field, suggestedValue, note.trim());
    reset();
  };

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={styles.backdrop} pointerEvents="box-none">
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        <View style={[styles.sheet, { backgroundColor: colors.card }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
              Report an issue — {placeName}
            </Text>
            <Pressable
              style={[styles.closeButton, { backgroundColor: colors.divider }]}
              onPress={handleClose}
              accessibilityRole="button"
              accessibilityLabel="Close">
              <Text style={[styles.closeLabel, { color: colors.textPrimary }]}>✕</Text>
            </Pressable>
          </View>

          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            Reviewed by a person before it changes anything — not published instantly.
          </Text>

          <View style={styles.fieldGrid}>
            {(Object.keys(FIELD_LABELS) as CorrectionField[]).map(f => (
              <Pressable
                key={f}
                style={[
                  styles.fieldChip,
                  { backgroundColor: colors.divider },
                  field === f && styles.fieldChipActive,
                  field === f && { backgroundColor: colors.textPrimary },
                ]}
                onPress={() => setField(f)}
                accessibilityRole="button"
                accessibilityLabel={FIELD_ACCESSIBILITY_LABELS[f]}
                accessibilityState={{ selected: field === f }}>
                <Text
                  style={[
                    styles.fieldLabel,
                    { color: colors.textPrimary },
                    field === f && styles.fieldLabelActive,
                    field === f && { color: colors.onTextPrimary },
                  ]}>
                  {FIELD_LABELS[f]}
                </Text>
              </Pressable>
            ))}
          </View>

          {field === 'name' && (
            <TextInput
              style={[styles.textInput, { color: colors.textPrimary, borderColor: colors.dividerStrong }]}
              placeholder="What should it be called?"
              placeholderTextColor={colors.textSecondary}
              value={nameInput}
              onChangeText={setNameInput}
              maxLength={200}
            />
          )}

          {field === 'category' && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
              {CATEGORIES.map(c => (
                <Pressable
                  key={c.key}
                  style={[
                    styles.categoryChip,
                    { backgroundColor: colors.divider },
                    categoryKey === c.key && styles.fieldChipActive,
                    categoryKey === c.key && { backgroundColor: colors.textPrimary },
                  ]}
                  onPress={() => setCategoryKey(c.key)}
                  accessibilityRole="button"
                  accessibilityLabel={c.label}
                  accessibilityState={{ selected: categoryKey === c.key }}>
                  <Text
                    style={[
                      styles.fieldLabel,
                      { color: colors.textPrimary },
                      categoryKey === c.key && styles.fieldLabelActive,
                      categoryKey === c.key && { color: colors.onTextPrimary },
                    ]}>
                    {c.emoji} {c.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          <TextInput
            style={[styles.textInput, { color: colors.textPrimary, borderColor: colors.dividerStrong }]}
            placeholder={
              field === 'closed'
                ? 'Optional: what did you see there instead?'
                : field === 'other'
                  ? "What's wrong? (required)"
                  : 'Optional note'
            }
            placeholderTextColor={colors.textSecondary}
            maxLength={200}
            value={note}
            onChangeText={setNote}
          />

          <Pressable
            style={[styles.submitButton, { backgroundColor: colors.textPrimary }, !canSubmit && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit || submitting}
            accessibilityRole="button"
            accessibilityLabel="Submit">
            {submitting ? (
              <ActivityIndicator size="small" color={colors.onTextPrimary} />
            ) : (
              <Text style={[styles.submitLabel, { color: colors.onTextPrimary }]}>Submit</Text>
            )}
          </Pressable>
          {error && <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>}
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
    padding: 18,
    paddingBottom: 28,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
    elevation: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
    marginTop: 8,
    marginBottom: 12,
  },
  fieldGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  fieldChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#f0ede4',
    marginRight: 8,
    marginBottom: 8,
  },
  fieldChipActive: {
    backgroundColor: '#3a3226',
  },
  fieldLabel: {
    fontSize: 13,
    color: '#3a3226',
    fontWeight: '600',
  },
  fieldLabelActive: {
    color: '#ffffff',
  },
  categoryScroll: {
    marginBottom: 10,
  },
  categoryChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#f0ede4',
    marginRight: 8,
  },
  textInput: {
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
    backgroundColor: '#3a3226',
    borderRadius: 20,
    paddingVertical: 10,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#c7c2b4',
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
