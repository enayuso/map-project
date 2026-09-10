import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ListPlace, SharedList } from './api';

type Props = {
  visible: boolean;
  list: SharedList | null;
  onSelect: (place: ListPlace) => void;
  onClose: () => void;
};

export default function ListViewSheet({ visible, list, onSelect, onClose }: Props) {
  return (
    // Modal, not a plain overlay — same touch-swallowing reason as every
    // other mounts/unmounts-based list in this app (mobile/README.md
    // issue 6, src/search/SearchBox.tsx).
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop} pointerEvents="box-none">
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>
              {list?.label ?? 'Shared list'}
            </Text>
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeLabel}>✕</Text>
            </Pressable>
          </View>

          {list && list.places.length === 0 && <Text style={styles.empty}>This list is empty.</Text>}

          {list && list.places.length > 0 && (
            <ScrollView style={styles.list}>
              {list.places.map(place => (
                <Pressable key={place.id} style={styles.row} onPress={() => onSelect(place)}>
                  <Text style={styles.name}>{place.name}</Text>
                  <Text style={styles.subtitle} numberOfLines={1}>
                    {place.subtitle}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
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
  sheet: {
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
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
  empty: {
    color: '#8a8578',
    paddingVertical: 12,
  },
  list: {
    maxHeight: 320,
  },
  row: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0ede4',
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: '#3a3226',
  },
  subtitle: {
    fontSize: 12,
    color: '#8a8578',
    marginTop: 2,
  },
});
