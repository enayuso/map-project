/**
 * Belize Map — Phase 1 (base map) + Phase 2 (search)
 * MapLibre Native map pointed at our own PostGIS + Martin tile backend,
 * with a search box backed by Nominatim (addresses/places) + Typesense
 * (POIs) — see src/search/.
 */

import React, { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Map, Camera, Marker, type CameraRef } from '@maplibre/maplibre-react-native';
import basicStyle from './src/styles/basic.json';
import SearchBox from './src/search/SearchBox';
import type { SearchResult } from './src/search/api';

// Belize City — one of the two locked pilot areas (see docs/PLAN.md).
// Ambergris Caye/San Pedro: [-87.9614, 17.9146]
const BELIZE_CITY: [number, number] = [-88.19, 17.4995];

function App(): React.JSX.Element {
  const cameraRef = useRef<CameraRef>(null);
  const [pin, setPin] = useState<SearchResult | null>(null);

  const handleSelect = (result: SearchResult) => {
    setPin(result);
    cameraRef.current?.flyTo({
      center: [result.lon, result.lat],
      zoom: 16,
      duration: 1200,
    });
  };

  return (
    <View style={styles.container}>
      <Map style={styles.map} mapStyle={basicStyle as any}>
        <Camera ref={cameraRef} initialViewState={{ center: BELIZE_CITY, zoom: 13 }} />
        {pin && (
          <Marker lngLat={[pin.lon, pin.lat]}>
            <View style={styles.pin} />
          </Marker>
        )}
      </Map>
      <SearchBox onSelect={handleSelect} />
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
});

export default App;
