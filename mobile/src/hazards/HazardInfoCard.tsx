import React from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { HAZARD_REPORT_REASON_LABELS, HAZARD_TYPE_LABELS, type HazardReport, type HazardReportReason } from './api';
import { useTheme } from '../theme/ThemeContext';

// Same bottom-sheet Modal pattern as src/places/PlaceCard.tsx — a marker
// tap opens this over the map, so it needs the Modal wrapper (facebook/
// react-native#35612), unlike the top-anchored utility panels.

function timeAgo(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

type Props = {
  // Whether this card is actually allowed to be presented right now — see
  // src/modals/useModalCoordinator.ts's header comment. Independent of
  // `hazard`: can be false while `hazard` is still non-null (another
  // Modal currently has the floor).
  visible: boolean;
  hazard: HazardReport | null;
  isMine: boolean;
  confirming: boolean;
  deleting: boolean;
  reportingIssue: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onDelete: () => void;
  onReportIssue: (reason: HazardReportReason) => void;
  // Fed to the underlying <Modal> — reports back once its dismiss
  // *animation* has actually finished, which the coordinator needs to
  // know before it's safe to present whatever's next.
  onDismiss?: () => void;
};

export default function HazardInfoCard({
  visible,
  hazard,
  isMine,
  confirming,
  deleting,
  reportingIssue,
  onClose,
  onConfirm,
  onDelete,
  onReportIssue,
  onDismiss,
}: Props) {
  const { colors } = useTheme();

  // A plain native action sheet, same pattern as App.tsx's own
  // openLegalDocs — this is a rarely-tapped safety-net action, not
  // worth a whole custom picker UI. Confirms success back to the user
  // (App Store Guideline 1.2 wants a real reporting *mechanism*, and a
  // report that visibly goes nowhere reads as broken, not just quiet).
  const confirmReportIssue = () => {
    const reasons = Object.entries(HAZARD_REPORT_REASON_LABELS) as [HazardReportReason, string][];
    Alert.alert('Report this hazard report', 'Why are you reporting it?', [
      ...reasons.map(([reason, label]) => ({
        text: label,
        onPress: () => {
          onReportIssue(reason);
          Alert.alert('Thanks', "We'll take a look.");
        },
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose} onDismiss={onDismiss}>
      <View style={styles.backdrop} pointerEvents="box-none">
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        {hazard && (
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <View style={styles.header}>
              <Text style={[styles.title, { color: colors.textPrimary }]}>{HAZARD_TYPE_LABELS[hazard.type]}</Text>
              <Pressable
                style={[styles.closeButton, { backgroundColor: colors.divider }]}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close">
                <Text style={[styles.closeLabel, { color: colors.textPrimary }]}>✕</Text>
              </Pressable>
            </View>

            {hazard.note && <Text style={[styles.note, { color: colors.textPrimary }]}>{hazard.note}</Text>}

            <Text style={[styles.meta, { color: colors.textSecondary }]}>
              Reported {timeAgo(hazard.reportedAt)}
              {hazard.confirmCount > 0 &&
                ` · confirmed still there ${hazard.confirmCount} time${hazard.confirmCount === 1 ? '' : 's'}`}
            </Text>

            <Pressable
              style={styles.confirmButton}
              onPress={onConfirm}
              disabled={confirming}
              accessibilityRole="button"
              accessibilityLabel="Still here">
              <Text style={styles.confirmLabel}>{confirming ? 'Confirming…' : '✓ Still here'}</Text>
            </Pressable>

            {isMine && (
              <Pressable
                style={[styles.deleteButton, { backgroundColor: colors.divider }]}
                onPress={onDelete}
                disabled={deleting}
                accessibilityRole="button"
                accessibilityLabel="Remove my report">
                <Text style={[styles.deleteLabel, { color: colors.danger }]}>{deleting ? 'Removing…' : 'Remove my report'}</Text>
              </Pressable>
            )}

            <Pressable
              onPress={confirmReportIssue}
              disabled={reportingIssue}
              accessibilityRole="button"
              accessibilityLabel="Report this hazard report"
              hitSlop={4}>
              <Text style={[styles.reportLabel, { color: colors.textSecondary }]}>🚩 Report this</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  card: {
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
    fontSize: 18,
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
  note: {
    marginTop: 10,
    fontSize: 14,
    color: '#3a3226',
  },
  meta: {
    marginTop: 8,
    fontSize: 12,
    color: '#8a8578',
  },
  confirmButton: {
    marginTop: 16,
    backgroundColor: '#2f9e44',
    borderRadius: 20,
    paddingVertical: 10,
    alignItems: 'center',
  },
  confirmLabel: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  deleteButton: {
    marginTop: 10,
    backgroundColor: '#f0ede4',
    borderRadius: 20,
    paddingVertical: 10,
    alignItems: 'center',
  },
  deleteLabel: {
    color: '#b3261e',
    fontWeight: '700',
    fontSize: 14,
  },
  reportLabel: {
    marginTop: 12,
    fontSize: 12,
    textAlign: 'center',
  },
});
