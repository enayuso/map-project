/**
 * Belize Map — Phase 1
 * MapLibre Native map pointed at our own PostGIS + Martin tile backend.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Map, Camera } from '@maplibre/maplibre-react-native';
import basicStyle from './src/styles/basic.json';

// Belize City — one of the two locked pilot areas (see docs/PLAN.md).
// Ambergris Caye/San Pedro: [-87.9614, 17.9146]
const BELIZE_CITY: [number, number] = [-88.19, 17.4995];

function App(): React.JSX.Element {
  return (
    <View style={styles.container}>
      <Map style={styles.map} mapStyle={basicStyle as any}>
        <Camera initialViewState={{ center: BELIZE_CITY, zoom: 13 }} />
      </Map>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
});

export default App;
