/**
 * Belize Map — Phase 1 (base map) + Phase 2 (search) + Phase 4 (routing)
 * MapLibre Native map pointed at our own PostGIS + Martin tile backend,
 * with a search box (Nominatim + Typesense, see src/search/) and turn-by-
 * turn directions (Valhalla, see src/routing/).
 */

import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type NativeSyntheticEvent } from 'react-native';
import {
  Map,
  Camera,
  Marker,
  GeoJSONSource,
  Layer,
  type CameraRef,
  type PressEvent,
} from '@maplibre/maplibre-react-native';
import basicStyle from './src/styles/basic.json';
import SearchBox from './src/search/SearchBox';
import type { SearchResult } from './src/search/api';
import { fetchRoute, type Costing, type LatLon, type RouteResult } from './src/routing/api';
import RoutePanel from './src/routing/RoutePanel';

// Belize City — one of the two locked pilot areas (see docs/PLAN.md).
// Ambergris Caye/San Pedro: [-87.9614, 17.9146]
const BELIZE_CITY: [number, number] = [-88.19, 17.4995];

function App(): React.JSX.Element {
  const cameraRef = useRef<CameraRef>(null);
  const [pin, setPin] = useState<SearchResult | null>(null);

  // --- Routing state ---
  const [routingActive, setRoutingActive] = useState(false);
  const [origin, setOrigin] = useState<LatLon | null>(null);
  const [destination, setDestination] = useState<LatLon | null>(null);
  const [costing, setCosting] = useState<Costing>('auto');
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  useEffect(() => {
    if (!origin || !destination) return;
    setRouteLoading(true);
    setRouteError(null);
    fetchRoute(origin, destination, costing)
      .then(setRoute)
      .catch(e => {
        setRoute(null);
        setRouteError(e.message === 'Valhalla 400' ? 'No route found between these points.' : 'Could not fetch route.');
      })
      .finally(() => setRouteLoading(false));
  }, [origin, destination, costing]);

  const handleSelect = (result: SearchResult) => {
    if (routingActive) {
      if (!origin) {
        setOrigin({ lat: result.lat, lon: result.lon });
      } else {
        setDestination({ lat: result.lat, lon: result.lon });
      }
      return;
    }
    setPin(result);
    cameraRef.current?.flyTo({ center: [result.lon, result.lat], zoom: 16, duration: 1200 });
  };

  const handleMapPress = (event: NativeSyntheticEvent<PressEvent>) => {
    if (!routingActive) return;
    const [lon, lat] = event.nativeEvent.lngLat;
    if (!origin) {
      setOrigin({ lat, lon });
    } else if (!destination) {
      setDestination({ lat, lon });
    } else {
      // Both already set — a new tap starts a fresh route.
      setOrigin({ lat, lon });
      setDestination(null);
      setRoute(null);
    }
  };

  const toggleRouting = () => {
    if (routingActive) {
      setRoutingActive(false);
      clearRoute();
    } else {
      setRoutingActive(true);
      // If a place is already pinned from search, use it as the
      // destination right away — the common "search, then get
      // directions to it" flow.
      if (pin) {
        setDestination({ lat: pin.lat, lon: pin.lon });
      }
    }
  };

  const clearRoute = () => {
    setOrigin(null);
    setDestination(null);
    setRoute(null);
    setRouteError(null);
  };

  const showPanel = routingActive && (routeLoading || !!route || !!routeError);

  return (
    <View style={styles.container}>
      <Map style={styles.map} mapStyle={basicStyle as any} onPress={handleMapPress}>
        <Camera ref={cameraRef} initialViewState={{ center: BELIZE_CITY, zoom: 13 }} />

        {pin && !routingActive && (
          <Marker lngLat={[pin.lon, pin.lat]}>
            <View style={styles.pin} />
          </Marker>
        )}

        {origin && (
          <Marker lngLat={[origin.lon, origin.lat]}>
            <View style={[styles.pin, styles.originPin]} />
          </Marker>
        )}
        {destination && (
          <Marker lngLat={[destination.lon, destination.lat]}>
            <View style={styles.pin} />
          </Marker>
        )}

        {route && (
          <GeoJSONSource id="route" data={route.geometry}>
            <Layer
              id="route-line"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': '#2b6cb0', 'line-width': 5, 'line-opacity': 0.85 }}
            />
          </GeoJSONSource>
        )}
      </Map>

      <SearchBox onSelect={handleSelect} />

      <View style={styles.directionsButtonWrap}>
        <Pressable style={styles.directionsButton} onPress={toggleRouting}>
          <Text style={styles.directionsButtonText}>
            {routingActive ? '✕ Cancel directions' : '🧭 Directions'}
          </Text>
        </Pressable>
        {routingActive && !origin && (
          <Text style={styles.hint}>Tap the map or search to set your start point</Text>
        )}
        {routingActive && origin && !destination && (
          <Text style={styles.hint}>Now tap the map or search for your destination</Text>
        )}
      </View>

      <RoutePanel
        visible={showPanel}
        loading={routeLoading}
        error={routeError}
        route={route}
        costing={costing}
        onChangeCosting={setCosting}
        onClear={() => {
          clearRoute();
          setRoutingActive(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  pin: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#d9534f',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  originPin: {
    backgroundColor: '#2f9e44',
  },
  directionsButtonWrap: {
    position: 'absolute',
    top: 116,
    left: 12,
    zIndex: 9,
  },
  directionsButton: {
    backgroundColor: '#3a3226',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  directionsButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 13,
  },
  hint: {
    marginTop: 6,
    fontSize: 12,
    color: '#3a3226',
    backgroundColor: '#ffffffdd',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
});

export default App;
