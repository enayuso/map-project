import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ALL_CATEGORIES } from './allCategories';
import { createPlace, updatePlace, type PlaceInput } from './placesApi';

export type EditTarget = {
  placeId: string; // places.id (UUID) — see placeIdFromSearchResultId
  name: string;
  category: string;
};

type Props = {
  visible: boolean;
  /** null = adding a brand-new place at `location`; set = editing an
   * existing one (form pre-fills from it). */
  editTarget: EditTarget | null;
  /** Where a new place gets created. Ignored when editing. */
  location: { lat: number; lon: number } | null;
  onClose: () => void;
  onSaved: () => void;
};

/**
 * The field-collection form — Phase 3 Track B's first concrete "the data
 * actually persists" flow (mobile/README.md). A Modal, not a plain overlay
 * — same reasoning as every other dynamically-appearing surface in this
 * app (facebook/react-native#35612, mobile/README.md issue 6).
 */
export default function AddEditPlaceModal({ visible, editTarget, location, onClose, onSaved }: Props) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('other');
  const [phone, setPhone] = useState('');
  const [hours, setHours] = useState('');
  const [website, setWebsite] = useState('');
  const [addressDescription, setAddressDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset the form each time it opens, pre-filling from editTarget if set.
  useEffect(() => {
    if (!visible) return;
    setName(editTarget?.name ?? '');
    setCategory(editTarget?.category ?? 'other');
    setPhone('');
    setHours('');
    setWebsite('');
    setAddressDescription('');
    setError(null);
  }, [visible, editTarget]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editTarget) {
        await updatePlace(editTarget.placeId, {
          name: name.trim(),
          category,
          phone: phone.trim(),
          hours: hours.trim(),
          website: website.trim(),
          addressDescription: addressDescription.trim(),
          // Editing a place in the field is itself a verification act.
          verificationStatus: 'field_verified',
        });
      } else {
        if (!location) throw new Error('No location to save this place at.');
        const input: PlaceInput = {
          name: name.trim(),
          category,
          lat: location.lat,
          lon: location.lon,
          phone: phone.trim(),
          hours: hours.trim(),
          website: website.trim(),
          addressDescription: addressDescription.trim(),
          verificationStatus: 'field_verified',
          source: 'Field collection (mobile app)',
        };
        await createPlace(input);
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Check the backend is running.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop} pointerEvents="box-none">
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{editTarget ? 'Edit Place' : 'Add Place'}</Text>
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeLabel}>✕</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.form} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Name *</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Place name" />

            <Text style={styles.label}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryRow}>
              {ALL_CATEGORIES.map(c => (
                <Pressable
                  key={c.key}
                  style={[styles.categoryChip, category === c.key && styles.categoryChipActive]}
                  onPress={() => setCategory(c.key)}>
                  <Text style={[styles.categoryChipLabel, category === c.key && styles.categoryChipLabelActive]}>
                    {c.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={styles.label}>Phone</Text>
            <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="Optional" keyboardType="phone-pad" />

            <Text style={styles.label}>Hours</Text>
            <TextInput style={styles.input} value={hours} onChangeText={setHours} placeholder="e.g. Mon-Sat 8am-6pm" />

            <Text style={styles.label}>Website</Text>
            <TextInput style={styles.input} value={website} onChangeText={setWebsite} placeholder="Optional" autoCapitalize="none" />

            <Text style={styles.label}>Landmark / informal address</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              value={addressDescription}
              onChangeText={setAddressDescription}
              placeholder="e.g. Across from the Texaco station"
              multiline
            />

            {error && <Text style={styles.errorText}>{error}</Text>}

            <Pressable style={styles.saveButton} onPress={handleSave} disabled={saving}>
              {saving ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.saveLabel}>{editTarget ? 'Save Changes' : 'Add Place'}</Text>
              )}
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 18,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
    elevation: 6,
  },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  title: { flex: 1, fontSize: 18, fontWeight: '700', color: '#3a3226' },
  closeButton: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: '#f0ede4',
    alignItems: 'center', justifyContent: 'center',
  },
  closeLabel: { fontSize: 14, color: '#3a3226' },
  form: { flexGrow: 0 },
  label: { fontSize: 12, fontWeight: '600', color: '#8a8578', marginTop: 12, marginBottom: 4 },
  input: {
    borderWidth: 1, borderColor: '#e0dccf', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#3a3226',
  },
  multiline: { minHeight: 60, textAlignVertical: 'top' },
  categoryRow: { flexDirection: 'row' },
  categoryChip: {
    backgroundColor: '#f0ede4', borderRadius: 16,
    paddingVertical: 7, paddingHorizontal: 12, marginRight: 6,
  },
  categoryChipActive: { backgroundColor: '#3a3226' },
  categoryChipLabel: { fontSize: 12, fontWeight: '600', color: '#3a3226' },
  categoryChipLabelActive: { color: '#ffffff' },
  errorText: { color: '#b3261e', marginTop: 12, fontSize: 13 },
  saveButton: {
    marginTop: 20, marginBottom: 8, backgroundColor: '#2f9e44',
    borderRadius: 20, paddingVertical: 12, alignItems: 'center',
  },
  saveLabel: { color: '#ffffff', fontWeight: '700', fontSize: 15 },
});
