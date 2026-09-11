import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { weatherCodeInfo } from './weatherCodes';
import { formatTemp, type CurrentWeather, type TempUnit } from './api';
import { useTheme } from '../theme/ThemeContext';

type Props = {
  visible: boolean;
  onClose: () => void;
  loading: boolean;
  weather: CurrentWeather | null;
  error: string | null;
  onRefresh: () => void;
  unit: TempUnit;
  onToggleUnit: () => void;
};

export default function WeatherWidget({
  visible,
  onClose,
  loading,
  weather,
  error,
  onRefresh,
  unit,
  onToggleUnit,
}: Props) {
  const { colors } = useTheme();
  if (!visible) return null;

  const info = weather ? weatherCodeInfo(weather.weatherCode) : null;

  return (
    <View style={styles.container}>
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Weather here</Text>
          {/* Its own pressable, deliberately outside weatherRow below —
           * that whole row is tap-to-refresh, and this shouldn't also
           * trigger a refetch just for switching units (formatTemp is a
           * pure display conversion, no new request needed). */}
          <Pressable
            style={[styles.unitToggle, { backgroundColor: colors.divider }]}
            onPress={onToggleUnit}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={unit === 'C' ? 'Switch to Fahrenheit' : 'Switch to Celsius'}>
            <Text
              style={[
                styles.unitLabel,
                unit === 'C' && styles.unitLabelActive,
                { color: unit === 'C' ? colors.textPrimary : colors.textSecondary },
              ]}>
              °C
            </Text>
            <Text style={styles.unitSeparator}>/</Text>
            <Text
              style={[
                styles.unitLabel,
                unit === 'F' && styles.unitLabelActive,
                { color: unit === 'F' ? colors.textPrimary : colors.textSecondary },
              ]}>
              °F
            </Text>
          </Pressable>
          <Pressable
            style={[styles.closeButton, { backgroundColor: colors.divider }]}
            onPress={onClose}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close">
            <Text style={[styles.closeLabel, { color: colors.textPrimary }]}>✕</Text>
          </Pressable>
        </View>

        {loading && (
          <View style={styles.centerRow}>
            <ActivityIndicator size="small" color={colors.textSecondary} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Checking conditions…</Text>
          </View>
        )}

        {error && !loading && <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>}

        {weather && info && !loading && (
          <Pressable
            style={styles.weatherRow}
            onPress={onRefresh}
            accessibilityRole="button"
            accessibilityLabel="Refresh weather">
            <Text style={styles.emoji}>{info.emoji}</Text>
            <View style={styles.details}>
              <Text style={[styles.temp, { color: colors.textPrimary }]}>{formatTemp(weather.tempC, unit)}</Text>
              <Text style={[styles.label, { color: colors.textPrimary }]}>{info.label}</Text>
              <Text style={[styles.meta, { color: colors.textSecondary }]}>
                💧 {weather.humidityPct}% · 💨 {Math.round(weather.windKmh)} km/h
              </Text>
            </View>
            <Text style={[styles.refreshHint, { color: colors.textSecondary }]}>↻</Text>
          </Pressable>
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
    fontSize: 14,
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
  unitToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0ede4',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginRight: 8,
  },
  unitLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8a8578',
  },
  unitLabelActive: {
    color: '#3a3226',
  },
  unitSeparator: {
    fontSize: 12,
    color: '#c7c2b4',
    marginHorizontal: 3,
  },
  centerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  loadingText: {
    marginLeft: 8,
    color: '#8a8578',
  },
  errorText: {
    color: '#b3261e',
    fontSize: 12,
    paddingVertical: 8,
  },
  weatherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 4,
  },
  emoji: {
    fontSize: 36,
    marginRight: 12,
  },
  details: {
    flex: 1,
  },
  temp: {
    fontSize: 22,
    fontWeight: '800',
    color: '#3a3226',
  },
  label: {
    fontSize: 13,
    color: '#3a3226',
    marginTop: 2,
  },
  meta: {
    fontSize: 12,
    color: '#8a8578',
    marginTop: 4,
  },
  refreshHint: {
    fontSize: 18,
    color: '#8a8578',
  },
});
