import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { OfflinePackStatus } from '@maplibre/maplibre-react-native';
import type { PackMetadata } from './api';

export type PackListItem = {
  id: string;
  metadata: PackMetadata;
  sizeBytes: number;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  label: string;
  onChangeLabel: (label: string) => void;
  onDownloadCurrentArea: () => void;
  downloading: boolean;
  downloadStatus: OfflinePackStatus | null;
  downloadError: string | null;
  packs: PackListItem[];
  onDeletePack: (id: string) => void;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function OfflineMapsPanel({
  visible,
  onClose,
  label,
  onChangeLabel,
  onDownloadCurrentArea,
  downloading,
  downloadStatus,
  downloadError,
  packs,
  onDeletePack,
}: Props) {
  if (!visible) return null;

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.title}>⬇️ Offline maps</Text>
          <Pressable style={styles.closeButton} onPress={onClose} hitSlop={8}>
            <Text style={styles.closeLabel}>✕</Text>
          </Pressable>
        </View>

        <Text style={styles.hint}>
          Downloads what's currently on screen — pan/zoom to the area you want first, then
          download it. Works offline afterward, no signal needed.
        </Text>

        <View style={styles.downloadRow}>
          <TextInput
            style={styles.labelInput}
            placeholder="Name this area (optional)"
            placeholderTextColor="#8a8578"
            value={label}
            onChangeText={onChangeLabel}
            editable={!downloading}
          />
          <Pressable style={styles.downloadButton} onPress={onDownloadCurrentArea} disabled={downloading}>
            {downloading ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.downloadLabel}>Download</Text>
            )}
          </Pressable>
        </View>

        {downloading && downloadStatus && (
          <Text style={styles.progressText}>
            {downloadStatus.percentage.toFixed(0)}% — {formatBytes(downloadStatus.completedResourceSize)} so far
          </Text>
        )}
        {downloadError && <Text style={styles.errorText}>{downloadError}</Text>}

        {packs.length > 0 && (
          <>
            <View style={styles.divider} />
            <Text style={styles.sectionTitle}>Downloaded areas</Text>
            <ScrollView style={styles.list}>
              {packs.map(pack => (
                <View key={pack.id} style={styles.packRow}>
                  <View style={styles.packInfo}>
                    <Text style={styles.packLabel} numberOfLines={1}>
                      {pack.metadata.label || 'Unnamed area'}
                    </Text>
                    <Text style={styles.packSize}>{formatBytes(pack.sizeBytes)}</Text>
                  </View>
                  <Pressable style={styles.deleteButton} onPress={() => onDeletePack(pack.id)} hitSlop={8}>
                    <Text style={styles.deleteLabel}>Delete</Text>
                  </Pressable>
                </View>
              ))}
            </ScrollView>
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
    marginTop: 6,
    marginBottom: 10,
  },
  downloadRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  labelInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e5e1d6',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#3a3226',
    marginRight: 8,
  },
  downloadButton: {
    backgroundColor: '#3a3226',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadLabel: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  progressText: {
    marginTop: 8,
    fontSize: 12,
    color: '#2b6cb0',
    fontWeight: '600',
  },
  errorText: {
    marginTop: 8,
    fontSize: 12,
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
    marginBottom: 6,
  },
  list: {
    maxHeight: 200,
  },
  packRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0ede4',
  },
  packInfo: {
    flex: 1,
    marginRight: 8,
  },
  packLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3a3226',
  },
  packSize: {
    fontSize: 12,
    color: '#8a8578',
    marginTop: 2,
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
});
