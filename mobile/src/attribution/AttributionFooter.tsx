import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

const OSM_COPYRIGHT_URL = 'https://www.openstreetmap.org/copyright';
const COPERNICUS_URL = 'https://www.copernicus.eu/en';

type Props = {
  /** Only true while the satellite/hybrid basemap is showing — Sentinel
   * imagery isn't on screen otherwise, so its credit doesn't apply. */
  showSatelliteCredit: boolean;
};

/**
 * Data-source attribution, required by the licenses of the data this app is
 * actually built on: OpenStreetMap's ODbL requires visible credit (OSMF's
 * own Attribution Guidelines: a "suitably clear and prominent link" from the
 * map view is sufficient — this is exactly that, not a buried Settings/About
 * screen), and Copernicus/Sentinel data likewise requires "Contains modified
 * Copernicus Sentinel data [year]" wherever it's displayed. See docs/PLAN.md
 * Locked Decision 4.
 *
 * Deliberately a plain React Native component using Linking.openURL, NOT
 * MapLibre Native's built-in attribution button (the `attribution` prop on
 * <Map>, disabled below) — that control works by parsing HTML anchor tags
 * out of each style source's own `attribution` string on the native side,
 * which MapLibre Native's own issue tracker documents as having caused
 * "cryptic crashes" on iOS historically. This sidesteps that entirely: the
 * text and links are ordinary RN code we can read, test, and reason about
 * directly, not opaque native HTML parsing.
 */
export default function AttributionFooter({ showSatelliteCredit }: Props) {
  const { colors } = useTheme();
  return (
    <View style={styles.container} pointerEvents="box-none">
      <Pressable
        onPress={() => Linking.openURL(OSM_COPYRIGHT_URL)}
        accessibilityRole="button"
        accessibilityLabel="Open OpenStreetMap copyright page">
        <Text style={[styles.text, { color: colors.textPrimary }]}>© OpenStreetMap contributors</Text>
      </Pressable>
      {showSatelliteCredit && (
        <Pressable
          onPress={() => Linking.openURL(COPERNICUS_URL)}
          accessibilityRole="button"
          accessibilityLabel="Open Copernicus Sentinel data information page">
          <Text style={[styles.text, { color: colors.textPrimary }]}>
            Contains modified Copernicus Sentinel data 2025-2026
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 4,
    left: 66,
    right: 8,
    zIndex: 1,
  },
  text: {
    fontSize: 9,
    lineHeight: 12,
    color: '#3a3226',
    backgroundColor: '#ffffffcc',
    textDecorationLine: 'underline',
    alignSelf: 'flex-start',
  },
});
