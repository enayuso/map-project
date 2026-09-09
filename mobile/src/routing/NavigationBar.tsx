import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { maneuverIcon } from './navigation';

type Props = {
  visible: boolean;
  arrived: boolean;
  icon: number;
  instruction: string;
  distanceToManeuverKm: number;
  remainingDistanceKm: number;
  remainingDurationMin: number;
  onEnd: () => void;
};

/**
 * Persistent top banner + bottom bar shown during live navigation, replacing
 * the search box/category bar/RoutePanel for the duration. A plain overlay,
 * not a Modal — like the "Directions" button and CategoryBar, this is a
 * single always-mounted control while `visible`, not a list that
 * mounts/unmounts on its own, so it isn't subject to the native-map-
 * touch-swallowing bug that Modal works around elsewhere (see
 * mobile/README.md issue 6).
 */
export default function NavigationBar({
  visible,
  arrived,
  icon,
  instruction,
  distanceToManeuverKm,
  remainingDistanceKm,
  remainingDurationMin,
  onEnd,
}: Props) {
  if (!visible) return null;

  return (
    <>
      <View style={styles.topBanner}>
        <Text style={styles.icon}>{arrived ? '🏁' : maneuverIcon(icon)}</Text>
        <View style={styles.instructionText}>
          <Text style={styles.instruction} numberOfLines={2}>
            {arrived ? "You've arrived" : instruction}
          </Text>
          {!arrived && (
            <Text style={styles.distance}>
              {distanceToManeuverKm < 1
                ? `${Math.round(distanceToManeuverKm * 1000)} m`
                : `${distanceToManeuverKm.toFixed(1)} km`}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.bottomBar}>
        <Text style={styles.summary}>
          {arrived
            ? 'Trip complete'
            : `🚗 ${Math.round(remainingDurationMin)} min · ${remainingDistanceKm.toFixed(1)} km remaining`}
        </Text>
        <Pressable style={styles.endButton} onPress={onEnd}>
          <Text style={styles.endLabel}>✕ End</Text>
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  topBanner: {
    position: 'absolute',
    top: 60,
    left: 12,
    right: 12,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3a3226',
    borderRadius: 14,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  icon: {
    fontSize: 32,
    color: '#ffffff',
    marginRight: 14,
    width: 40,
    textAlign: 'center',
  },
  instructionText: {
    flex: 1,
  },
  instruction: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  distance: {
    fontSize: 13,
    color: '#e8a23d',
    fontWeight: '600',
    marginTop: 2,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 32,
    left: 12,
    right: 76, // stay clear of the locate/zoom/satellite buttons on the right
    zIndex: 9,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 24,
    paddingVertical: 10,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  summary: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#3a3226',
  },
  endButton: {
    backgroundColor: '#c0392b',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginLeft: 8,
  },
  endLabel: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 12,
  },
});
