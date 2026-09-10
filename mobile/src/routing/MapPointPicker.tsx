import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { SearchResult } from '../search/api';

/**
 * "Pan the map to set a point" — Naver/Kakao's 지도에서 선택 ("select on the
 * map") flow: a pin stays fixed at the exact screen center, the *map* pans
 * underneath it, and whatever's under the pin at rest gets reverse-geocoded
 * and shown in a bottom sheet with a confirm button. This is a genuinely
 * different interaction from the existing "tap a point" (App.tsx's
 * handleMapPress sets a point exactly where you tapped, finger and all) —
 * panning first lets you align precisely on something a fingertip would
 * cover, which matters more here than it does for browsing/POI-tapping.
 *
 * Deliberately not a separate screen/second <Map> — this app has no
 * navigation stack, and mounting a second native MapLibre view would be
 * wasteful. It's an overlay mode on the SAME map App.tsx already renders;
 * that map's own onRegionDidChange is what drives `preview`/`loading` here.
 * The pin itself is purely decorative (pointerEvents="none" throughout) —
 * it never intercepts the pan gesture, which the map handles natively.
 */

const FIELD_LABEL: Record<'origin' | 'destination', string> = {
  origin: 'Choose starting point',
  destination: 'Choose destination',
};

const PIN_COLOR: Record<'origin' | 'destination', string> = {
  origin: '#2f9e44',
  destination: '#d9534f',
};

type Props = {
  field: 'origin' | 'destination';
  preview: SearchResult | null;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function MapPointPicker({ field, preview, loading, onCancel, onConfirm }: Props) {
  return (
    <>
      <View style={styles.topBar} pointerEvents="box-none">
        <Pressable style={styles.backButton} onPress={onCancel} hitSlop={8}>
          <Text style={styles.backLabel}>‹</Text>
        </Pressable>
        <Text style={styles.title}>{FIELD_LABEL[field]}</Text>
      </View>
      <Text style={styles.instruction} pointerEvents="none">
        Move the map to set the location
      </Text>

      {/* Fixed at the exact screen center regardless of scroll/safe-area —
       * this is the whole point: whatever's under it is the candidate
       * point, so it can't drift with any other layout. */}
      <View style={styles.pinWrap} pointerEvents="none">
        <View style={[styles.pin, { backgroundColor: PIN_COLOR[field] }]} />
      </View>

      <View style={styles.bottomSheet}>
        {loading && (
          <View style={styles.row}>
            <ActivityIndicator size="small" color="#8a8578" />
            <Text style={styles.loadingText}>Finding address…</Text>
          </View>
        )}
        {!loading && preview && (
          <>
            <Text style={styles.addressName}>{preview.name}</Text>
            <Text style={styles.addressSubtitle} numberOfLines={2}>
              {preview.subtitle}
            </Text>
          </>
        )}
        {!loading && !preview && <Text style={styles.addressSubtitle}>Could not find an address here.</Text>}

        <Pressable
          style={[styles.confirmButton, (loading || !preview) && styles.confirmButtonDisabled]}
          onPress={onConfirm}
          disabled={loading || !preview}>
          <Text style={styles.confirmLabel}>Confirm</Text>
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  topBar: {
    position: 'absolute',
    top: 50,
    left: 12,
    right: 12,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    height: 46,
    paddingHorizontal: 6,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backLabel: {
    fontSize: 24,
    color: '#3a3226',
    marginTop: -2,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#3a3226',
  },
  instruction: {
    position: 'absolute',
    top: 104,
    left: 12,
    right: 12,
    zIndex: 10,
    textAlign: 'center',
    fontSize: 12,
    color: '#3a3226',
    backgroundColor: '#ffffffdd',
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'center',
    paddingHorizontal: 10,
  },
  pinWrap: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -9,
    marginLeft: -9,
    zIndex: 9,
  },
  pin: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#ffffff',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 5,
  },
  bottomSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 28,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
    elevation: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  loadingText: {
    marginLeft: 8,
    color: '#8a8578',
  },
  addressName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#3a3226',
  },
  addressSubtitle: {
    fontSize: 13,
    color: '#8a8578',
    marginTop: 4,
  },
  confirmButton: {
    marginTop: 14,
    backgroundColor: '#3a3226',
    borderRadius: 20,
    paddingVertical: 12,
    alignItems: 'center',
  },
  confirmButtonDisabled: {
    backgroundColor: '#c7c2b4',
  },
  confirmLabel: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
});
