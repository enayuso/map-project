import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

// Naver/Kakao both have live location sharing (Kakao's own "친구위치" just
// had its time limit removed entirely, Nov 2025 — see docs/research/
// 09-kakao-naver-feature-audit.md) — this is the same idea at hobby scale:
// no accounts/friend graph, just a short code (see sharing/README.md for
// the full access-model reasoning). The code itself uses <Text selectable>
// for native long-press-to-copy rather than pulling in a clipboard
// library — one less new native dependency/rebuild for a v1.

type Props = {
  visible: boolean;
  onClose: () => void;
  // Sharing (me -> someone else)
  myCode: string | null;
  sharingBusy: boolean;
  sharingError: string | null;
  onStartSharing: () => void;
  onStopSharing: () => void;
  // Viewing (someone else -> me)
  viewedLabel: string | null;
  viewingBusy: boolean;
  viewingError: string | null;
  onStartViewing: (code: string) => void;
  onStopViewing: () => void;
};

export default function SharingPanel({
  visible,
  onClose,
  myCode,
  sharingBusy,
  sharingError,
  onStartSharing,
  onStopSharing,
  viewedLabel,
  viewingBusy,
  viewingError,
  onStartViewing,
  onStopViewing,
}: Props) {
  const [codeInput, setCodeInput] = useState('');

  if (!visible) return null;

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.title}>📡 Location sharing</Text>
          <Pressable style={styles.closeButton} onPress={onClose} hitSlop={8}>
            <Text style={styles.closeLabel}>✕</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Share my location</Text>
          {myCode ? (
            <>
              <Text style={styles.hint}>Give this code to whoever should see you:</Text>
              <Text style={styles.code} selectable>
                {myCode}
              </Text>
              <Pressable style={styles.stopButton} onPress={onStopSharing}>
                <Text style={styles.stopLabel}>Stop sharing</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable style={styles.actionButton} onPress={onStartSharing} disabled={sharingBusy}>
                {sharingBusy ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.actionLabel}>Start sharing</Text>
                )}
              </Pressable>
              {sharingError && <Text style={styles.errorText}>{sharingError}</Text>}
            </>
          )}
        </View>

        <View style={styles.divider} />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>View someone's location</Text>
          {viewedLabel ? (
            <>
              <Text style={styles.hint}>Now watching: {viewedLabel}</Text>
              <Pressable style={styles.stopButton} onPress={onStopViewing}>
                <Text style={styles.stopLabel}>Stop viewing</Text>
              </Pressable>
            </>
          ) : (
            <>
              <View style={styles.codeInputRow}>
                <TextInput
                  style={styles.codeInput}
                  placeholder="Enter code"
                  placeholderTextColor="#8a8578"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  value={codeInput}
                  onChangeText={setCodeInput}
                />
                <Pressable
                  style={[styles.actionButton, styles.viewButton, !codeInput.trim() && styles.actionButtonDisabled]}
                  onPress={() => onStartViewing(codeInput)}
                  disabled={!codeInput.trim() || viewingBusy}>
                  {viewingBusy ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.actionLabel}>View</Text>
                  )}
                </Pressable>
              </View>
              {viewingError && <Text style={styles.errorText}>{viewingError}</Text>}
            </>
          )}
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
  section: {
    paddingVertical: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3a3226',
    marginBottom: 8,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e5e1d6',
  },
  hint: {
    fontSize: 12,
    color: '#8a8578',
    marginBottom: 8,
  },
  code: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 4,
    color: '#3a3226',
    textAlign: 'center',
    backgroundColor: '#f7f5ef',
    borderRadius: 8,
    paddingVertical: 10,
    marginBottom: 10,
  },
  actionButton: {
    backgroundColor: '#3a3226',
    borderRadius: 20,
    paddingVertical: 10,
    alignItems: 'center',
  },
  actionButtonDisabled: {
    backgroundColor: '#c7c2b4',
  },
  actionLabel: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  stopButton: {
    backgroundColor: '#f0ede4',
    borderRadius: 20,
    paddingVertical: 10,
    alignItems: 'center',
  },
  stopLabel: {
    color: '#b3261e',
    fontWeight: '700',
    fontSize: 14,
  },
  codeInputRow: {
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
    paddingHorizontal: 20,
  },
  errorText: {
    color: '#b3261e',
    fontSize: 12,
    marginTop: 8,
  },
});
