import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { SearchResult } from '../search/api';
import type { LocalList } from './localLists';
import { useTheme } from '../theme/ThemeContext';

// Naver Map's own Dec 2022 favorites upgrade: named, shareable folders
// instead of one flat list — see docs/research/09-kakao-naver-feature-
// audit.md. Deliberately additive, not a replacement: the existing ★
// favorites flow (favorites.ts, SearchBox's shortcuts) is untouched; this
// is a separate "package some of my favorites into a named, shareable
// list" flow built on top of it.

type Mode = 'menu' | 'select';

type Props = {
  visible: boolean;
  onClose: () => void;
  favorites: SearchResult[];
  localLists: LocalList[];
  creating: boolean;
  onCreateList: (label: string, placeIds: string[]) => void;
  onDeleteList: (code: string) => void;
  viewCodeInput: string;
  onChangeViewCodeInput: (code: string) => void;
  onViewCode: () => void;
  viewingBusy: boolean;
  viewingError: string | null;
};

export default function ListsManagerPanel({
  visible,
  onClose,
  favorites,
  localLists,
  creating,
  onCreateList,
  onDeleteList,
  viewCodeInput,
  onChangeViewCodeInput,
  onViewCode,
  viewingBusy,
  viewingError,
}: Props) {
  const { colors } = useTheme();
  const [mode, setMode] = useState<Mode>('menu');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  if (!visible) return null;

  const toggleSelected = (id: string) => {
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const startSelecting = () => {
    setSelectedIds([]);
    setMode('select');
  };

  const confirmSelection = () => {
    // Alert.prompt is iOS-only (this app is iOS-first/iOS-only for now) —
    // a native text-input dialog, so this doesn't need its own inline
    // name-input UI just for this one step.
    Alert.prompt('Name this list', undefined, name => {
      const label = (name || '').trim();
      if (!label) return;
      onCreateList(label, selectedIds);
      setMode('menu');
    });
  };

  return (
    <View style={styles.container}>
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            {mode === 'menu' ? '📋 Shared lists' : 'Choose places'}
          </Text>
          <Pressable
            style={[styles.closeButton, { backgroundColor: colors.divider }]}
            onPress={mode === 'select' ? () => setMode('menu') : onClose}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={mode === 'select' ? 'Back' : 'Close'}>
            <Text style={[styles.closeLabel, { color: colors.textPrimary }]}>{mode === 'select' ? '‹' : '✕'}</Text>
          </Pressable>
        </View>

        {mode === 'menu' ? (
          <>
            {favorites.length === 0 ? (
              <Text style={[styles.hint, { color: colors.textSecondary }]}>Save some places (★) first — a list is a named subset of those.</Text>
            ) : (
              <Pressable
                style={[styles.actionButton, { backgroundColor: colors.textPrimary }]}
                onPress={startSelecting}
                disabled={creating}
                accessibilityRole="button"
                accessibilityLabel="Create list from favorites">
                <Text style={[styles.actionLabel, { color: colors.onTextPrimary }]}>+ Create list from favorites</Text>
              </Pressable>
            )}

            {localLists.length > 0 && (
              <ScrollView style={styles.list}>
                {localLists.map(l => (
                  <View key={l.code} style={[styles.listRow, { borderBottomColor: colors.divider }]}>
                    <View style={styles.listInfo}>
                      <Text style={[styles.listLabel, { color: colors.textPrimary }]}>{l.label}</Text>
                      <Text style={[styles.listCode, { color: colors.textSecondary }]} selectable>
                        {l.code}
                      </Text>
                    </View>
                    <Pressable
                      style={[styles.deleteButton, { backgroundColor: colors.divider }]}
                      onPress={() => onDeleteList(l.code)}
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel="Delete list">
                      <Text style={[styles.deleteLabel, { color: colors.danger }]}>Delete</Text>
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            )}

            <View style={[styles.divider, { backgroundColor: colors.dividerStrong }]} />

            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>View someone's list</Text>
            <View style={styles.viewRow}>
              <TextInput
                style={[styles.codeInput, { color: colors.textPrimary, borderColor: colors.dividerStrong }]}
                placeholder="Enter code"
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="characters"
                autoCorrect={false}
                value={viewCodeInput}
                onChangeText={onChangeViewCodeInput}
              />
              <Pressable
                style={[
                  styles.actionButton,
                  { backgroundColor: colors.textPrimary },
                  styles.viewButton,
                  !viewCodeInput.trim() && styles.actionButtonDisabled,
                ]}
                onPress={onViewCode}
                disabled={!viewCodeInput.trim() || viewingBusy}
                accessibilityRole="button"
                accessibilityLabel="View list">
                <Text style={[styles.actionLabel, { color: colors.onTextPrimary }]}>{viewingBusy ? '…' : 'View'}</Text>
              </Pressable>
            </View>
            {viewingError && <Text style={[styles.errorText, { color: colors.danger }]}>{viewingError}</Text>}
          </>
        ) : (
          <>
            <ScrollView style={styles.list}>
              {favorites.map(f => {
                const selected = selectedIds.includes(f.id);
                return (
                  <Pressable
                    key={f.id}
                    style={[styles.selectRow, { borderBottomColor: colors.divider }]}
                    onPress={() => toggleSelected(f.id)}
                    accessibilityRole="button"
                    accessibilityLabel={f.name}
                    accessibilityState={{ selected }}>
                    <View
                      style={[
                        styles.checkbox,
                        selected && styles.checkboxChecked,
                        selected && { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
                      ]}>
                      {selected && <Text style={[styles.checkmark, { color: colors.onTextPrimary }]}>✓</Text>}
                    </View>
                    <Text style={[styles.selectLabel, { color: colors.textPrimary }]} numberOfLines={1}>
                      {f.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable
              style={[
                styles.actionButton,
                { backgroundColor: colors.textPrimary },
                selectedIds.length === 0 && styles.actionButtonDisabled,
              ]}
              onPress={confirmSelection}
              disabled={selectedIds.length === 0 || creating}
              accessibilityRole="button"
              accessibilityLabel="Create list">
              <Text style={[styles.actionLabel, { color: colors.onTextPrimary }]}>
                {creating ? 'Creating…' : `Create with ${selectedIds.length} place${selectedIds.length === 1 ? '' : 's'}`}
              </Text>
            </Pressable>
          </>
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
    marginBottom: 8,
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
    fontSize: 15,
    color: '#3a3226',
  },
  hint: {
    fontSize: 12,
    color: '#8a8578',
    paddingVertical: 8,
  },
  actionButton: {
    backgroundColor: '#3a3226',
    borderRadius: 20,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 8,
  },
  actionButtonDisabled: {
    backgroundColor: '#c7c2b4',
  },
  actionLabel: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  list: {
    maxHeight: 240,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0ede4',
  },
  listInfo: {
    flex: 1,
    marginRight: 8,
  },
  listLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3a3226',
  },
  listCode: {
    fontSize: 12,
    color: '#8a8578',
    marginTop: 2,
    letterSpacing: 1,
  },
  deleteButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#f0ede4',
    borderRadius: 14,
  },
  deleteLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#b3261e',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e5e1d6',
    marginVertical: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3a3226',
    marginBottom: 8,
  },
  viewRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  codeInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e5e1d6',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    letterSpacing: 2,
    color: '#3a3226',
    marginRight: 8,
  },
  viewButton: {
    marginBottom: 0,
    paddingHorizontal: 20,
  },
  errorText: {
    color: '#b3261e',
    fontSize: 12,
    marginTop: 8,
  },
  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0ede4',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#c7c2b4',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  checkboxChecked: {
    backgroundColor: '#3a3226',
    borderColor: '#3a3226',
  },
  checkmark: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  selectLabel: {
    flex: 1,
    fontSize: 14,
    color: '#3a3226',
  },
});
