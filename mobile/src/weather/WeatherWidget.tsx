import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { weatherCodeInfo } from './weatherCodes';
import type { CurrentWeather } from './api';

type Props = {
  visible: boolean;
  onClose: () => void;
  loading: boolean;
  weather: CurrentWeather | null;
  error: string | null;
  onRefresh: () => void;
};

export default function WeatherWidget({ visible, onClose, loading, weather, error, onRefresh }: Props) {
  if (!visible) return null;

  const info = weather ? weatherCodeInfo(weather.weatherCode) : null;

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.title}>Weather here</Text>
          <Pressable style={styles.closeButton} onPress={onClose} hitSlop={8}>
            <Text style={styles.closeLabel}>✕</Text>
          </Pressable>
        </View>

        {loading && (
          <View style={styles.centerRow}>
            <ActivityIndicator size="small" color="#8a8578" />
            <Text style={styles.loadingText}>Checking conditions…</Text>
          </View>
        )}

        {error && !loading && <Text style={styles.errorText}>{error}</Text>}

        {weather && info && !loading && (
          <Pressable style={styles.weatherRow} onPress={onRefresh}>
            <Text style={styles.emoji}>{info.emoji}</Text>
            <View style={styles.details}>
              <Text style={styles.temp}>{Math.round(weather.tempC)}°C</Text>
              <Text style={styles.label}>{info.label}</Text>
              <Text style={styles.meta}>
                💧 {weather.humidityPct}% · 💨 {Math.round(weather.windKmh)} km/h
              </Text>
            </View>
            <Text style={styles.refreshHint}>↻</Text>
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
