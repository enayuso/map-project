/**
 * Belize Map — Phase 1 (base map) + Phase 2 (search) + Phase 4 (routing)
 * MapLibre Native map pointed at our own PostGIS + Martin tile backend,
 * with a search box (Nominatim + Typesense, see src/search/), turn-by-turn
 * directions (Valhalla, see src/routing/), and tap-to-view place details
 * for both search results and POIs rendered directly on the map (see
 * src/places/).
 *
 * Coverage: all four backend services (tiles, geocoding, POI search,
 * routing) were built from the full-country OSM extract, not just the
 * Belize City/Ambergris Caye pilot bboxes — confirmed working nationwide
 * (Belmopan, Corozal, Punta Gorda) — so the whole of Belize is already
 * usable, not just the two areas we happened to test most during Phases 1-4.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type NativeSyntheticEvent } from 'react-native';
import {
  Map,
  Camera,
  Marker,
  GeoJSONSource,
  Layer,
  NativeUserLocation,
  useCurrentPosition,
  type CameraRef,
  type MapRef,
  type PressEvent,
} from '@maplibre/maplibre-react-native';
import basicStyle from './src/styles/basic.json';
import hybridStyle from './src/styles/hybrid.json';
import SearchBox from './src/search/SearchBox';
import { searchNearby, type SearchResult } from './src/search/api';
import { fetchRoute, type Costing, type LatLon, type RouteResult } from './src/routing/api';
import RoutePanel from './src/routing/RoutePanel';
import PlaceCard, { type TravelPreview } from './src/places/PlaceCard';
import CategoryBar from './src/categories/CategoryBar';
import CategoryResultsSheet from './src/categories/CategoryResultsSheet';
import { categoryLabel, haversineKm, type NearbyResult } from './src/categories/categories';
import {
  addFavorite,
  addRecentSearch,
  getFavorites,
  getRecentSearches,
  removeFavorite,
} from './src/places/favorites';

// Belize City — the app's initial view. The user can pan/search anywhere in
// the country from here; see the coverage note above.
const BELIZE_CITY: [number, number] = [-88.19, 17.4995];
const INITIAL_ZOOM = 13;

// Zoom bounds — applied to both the +/- buttons AND pinch/double-tap zoom
// (via <Camera minZoom/maxZoom> below). Unlike Kakao/Naver we don't have
// global basemap coverage, just Belize's own OSM extract, so zooming out
// indefinitely would eventually show a hard, ugly edge where our data (and
// the "sea" polygon backing styles/basic.json's water fix) just stops. 9
// is calibrated, not arbitrary: the visible viewport at zoom 9 on this
// screen size (~2.3° tall) fits comfortably inside the sea layer's own
// ~2.85°-tall extent when centered anywhere near the initial view or the
// middle of the country — which covers ordinary browsing. It's not an
// absolute guarantee: panning all the way to the far north (near Corozal)
// or south (near Punta Gorda) while *also* fully zoomed out can still peek
// past the edge slightly, since MAX_BOUNDS below deliberately stays wide
// enough to keep those real towns reachable rather than shrinking the pan
// range just to close that last sliver. 19 is building-level, past which
// our vector tiles (maxzoom 16) just get upscaled with no new detail — the
// same tradeoffs Kakao/Naver's own zoom limits make, just calibrated to
// our smaller data footprint.
const MIN_ZOOM = 9;
const MAX_ZOOM = 19;

// Matches the "sea" layer's real data extent (see scripts/import_water_
// polygons.sh) — restricts panning so the map center can't wander into the
// "outside our coverage" void beyond it. Deliberately NOT shrunk tighter
// than that (e.g. to fully guarantee no edge at MIN_ZOOM): every real town
// we've tested navigation to — including Corozal and Punta Gorda at the
// country's northern/southern extremes — needs to stay reachable.
// [west, south, east, north].
const MAX_BOUNDS: [number, number, number, number] = [-89.35, 15.75, -86.75, 18.6];

/** Turns a tapped "poi-circles" vector-tile feature into a SearchResult-
 * shaped place, so it can flow through the same PlaceCard/Directions path
 * as a search result. Point geometry only — that's all this layer renders. */
function placeFromFeature(feature: GeoJSON.Feature): SearchResult | null {
  if (feature.geometry.type !== 'Point') return null;
  const [lon, lat] = feature.geometry.coordinates as [number, number];
  const props = feature.properties ?? {};
  const category = props.amenity || props.shop || props.tourism || 'place';
  return {
    id: `poi-${props.osm_id ?? `${lon},${lat}`}`,
    name: props.name || String(category).replace(/_/g, ' '),
    subtitle: String(category).replace(/_/g, ' '),
    lat,
    lon,
    kind: 'poi',
  };
}

function App(): React.JSX.Element {
  const cameraRef = useRef<CameraRef>(null);
  const mapRef = useRef<MapRef>(null);
  const [selectedPlace, setSelectedPlace] = useState<SearchResult | null>(null);

  // --- Basemap toggle (satellite/hybrid) ---
  // Swaps the whole mapStyle object rather than toggling individual layers'
  // visibility — MapLibre Native reloads sources/layers on a style change
  // but keeps the current camera position, so this is simpler than managing
  // per-layer visibility state ourselves for the same result.
  const [showSatellite, setShowSatellite] = useState(false);

  // --- Favorites + recent searches ---
  // Persisted locally (see src/places/favorites.ts) — loaded once on mount,
  // then kept in sync here so SearchBox's shortcut list and PlaceCard's ★
  // button always reflect the same state without each reading storage
  // independently.
  const [favorites, setFavorites] = useState<SearchResult[]>([]);
  const [recentSearches, setRecentSearches] = useState<SearchResult[]>([]);

  useEffect(() => {
    getFavorites().then(setFavorites);
    getRecentSearches().then(setRecentSearches);
  }, []);

  const recordRecentSearch = (place: SearchResult) => {
    addRecentSearch(place).then(setRecentSearches);
  };

  const isSelectedPlaceFavorite = !!selectedPlace && favorites.some(f => f.id === selectedPlace.id);

  const handleToggleFavorite = () => {
    if (!selectedPlace) return;
    if (isSelectedPlaceFavorite) {
      removeFavorite(selectedPlace.id).then(setFavorites);
    } else {
      addFavorite(selectedPlace).then(setFavorites);
    }
  };

  // --- Zoom control ---
  // Tracks the live zoom level (kept in sync via onRegionDidChange below, so
  // it reflects pinch-zooms and every flyTo/easeTo elsewhere in the app, not
  // just these buttons) so the +/- buttons can clamp at the bounds and grey
  // themselves out there, the way Kakao/Naver's own zoom control does.
  const [currentZoom, setCurrentZoom] = useState(INITIAL_ZOOM);

  const handleZoomIn = () => {
    cameraRef.current?.zoomTo(Math.min(currentZoom + 1, MAX_ZOOM), { duration: 250 });
  };
  const handleZoomOut = () => {
    cameraRef.current?.zoomTo(Math.max(currentZoom - 1, MIN_ZOOM), { duration: 250 });
  };

  // --- Location state ---
  // Deferred until the user actually taps "locate me", so we don't prompt
  // for location permission before it's needed.
  const [locationEnabled, setLocationEnabled] = useState(false);
  const currentPosition = useCurrentPosition({ enabled: locationEnabled });
  const [flyToLocationPending, setFlyToLocationPending] = useState(false);

  useEffect(() => {
    if (flyToLocationPending && currentPosition) {
      cameraRef.current?.flyTo({
        center: [currentPosition.coords.longitude, currentPosition.coords.latitude],
        zoom: 15,
        duration: 1000,
      });
      setFlyToLocationPending(false);
    }
  }, [flyToLocationPending, currentPosition]);

  const handleLocateMe = () => {
    if (!locationEnabled) setLocationEnabled(true);
    setFlyToLocationPending(true);
  };

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

  // --- Place card travel-time preview ---
  // Kakao/Naver show "X min away" the moment you open a place card. We can
  // only do that once the user has enabled location at least once — no
  // silent fallback to a fixed point, since that would misrepresent an
  // actual live estimate.
  const [travelPreview, setTravelPreview] = useState<TravelPreview>({ status: 'unavailable' });

  useEffect(() => {
    if (!selectedPlace) return;
    if (!currentPosition) {
      setTravelPreview({ status: 'unavailable' });
      return;
    }
    setTravelPreview({ status: 'loading' });
    fetchRoute(
      { lat: currentPosition.coords.latitude, lon: currentPosition.coords.longitude },
      { lat: selectedPlace.lat, lon: selectedPlace.lon },
      'auto',
    )
      .then(r => setTravelPreview({ status: 'ready', distanceKm: r.distanceKm, durationMin: r.durationMin }))
      .catch(() => setTravelPreview({ status: 'error' }));
  }, [selectedPlace, currentPosition]);

  // --- Category browsing (Kakao/Naver-style quick-filter chips) ---
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [categoryResults, setCategoryResults] = useState<NearbyResult[]>([]);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  const handleSelectCategory = async (key: string) => {
    if (activeCategory === key) {
      // Tapping the already-active chip again turns category browsing off.
      setActiveCategory(null);
      setCategoryResults([]);
      setCategoryError(null);
      return;
    }
    setActiveCategory(key);
    setSelectedPlace(null); // don't show a stale card over the new results
    setCategoryLoading(true);
    setCategoryError(null);
    try {
      // Search around what the user is currently looking at, not their GPS
      // position — the same "search this area" behavior Kakao/Naver use,
      // since you're often browsing somewhere other than where you are.
      const center = await mapRef.current?.getCenter();
      if (!center) throw new Error('no map center');
      const [lon, lat] = center;
      const nearby = await searchNearby(key, { lat, lon });
      setCategoryResults(
        nearby.map(r => ({ ...r, distanceKm: haversineKm({ lat, lon }, { lat: r.lat, lon: r.lon }) })),
      );
    } catch {
      setCategoryResults([]);
      setCategoryError('Could not load nearby places.');
    } finally {
      setCategoryLoading(false);
    }
  };

  const handleSelectCategoryResult = (result: NearbyResult) => {
    setSelectedPlace(result);
    recordRecentSearch(result);
    cameraRef.current?.flyTo({ center: [result.lon, result.lat], zoom: 17, duration: 800 });
  };

  const closeCategoryBrowsing = () => {
    setActiveCategory(null);
    setCategoryResults([]);
    setCategoryError(null);
  };

  const handleSelect = (result: SearchResult) => {
    if (routingActive) {
      if (!origin) {
        setOrigin({ lat: result.lat, lon: result.lon });
      } else {
        setDestination({ lat: result.lat, lon: result.lon });
      }
      return;
    }
    setSelectedPlace(result);
    recordRecentSearch(result);
    cameraRef.current?.flyTo({ center: [result.lon, result.lat], zoom: 16, duration: 1200 });
  };

  const handleMapPress = async (event: NativeSyntheticEvent<PressEvent>) => {
    if (routingActive) {
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
      return;
    }

    // Not routing: see if the user tapped a POI dot rendered on the map
    // itself (not just a search result) — the other half of "tap a place,
    // see its details" that Kakao/Naver rely on constantly.
    const features = await mapRef.current?.queryRenderedFeatures(event.nativeEvent.point, {
      layers: ['poi-circles'],
    });
    const place = features && features.length > 0 ? placeFromFeature(features[0]) : null;
    setSelectedPlace(place);
    if (place) recordRecentSearch(place);
  };

  const startDirectionsTo = (place: SearchResult) => {
    setSelectedPlace(null);
    setRoutingActive(true);
    setOrigin(null);
    setDestination({ lat: place.lat, lon: place.lon });
  };

  const toggleRouting = () => {
    if (routingActive) {
      setRoutingActive(false);
      clearRoute();
    } else {
      setRoutingActive(true);
      closeCategoryBrowsing(); // category chips don't mean anything mid-directions
      // If a place is already selected (from search or a map tap), use it
      // as the destination right away — the common "look at a place, then
      // get directions to it" flow.
      if (selectedPlace) {
        setDestination({ lat: selectedPlace.lat, lon: selectedPlace.lon });
        setSelectedPlace(null);
      }
    }
  };

  const clearRoute = () => {
    setOrigin(null);
    setDestination(null);
    setRoute(null);
    setRouteError(null);
  };

  const showRoutePanel = routingActive && (routeLoading || !!route || !!routeError);

  return (
    <View style={styles.container}>
      <Map
        ref={mapRef}
        style={styles.map}
        mapStyle={(showSatellite ? hybridStyle : basicStyle) as any}
        onPress={handleMapPress}
        onRegionDidChange={e => setCurrentZoom(e.nativeEvent.zoom)}
        // Native compass control: appears when the map is rotated away from
        // north, hides itself when facing north again, and resets bearing
        // to north when tapped — all built into MapLibre Native, no custom
        // touch handling needed (and none of the RN-overlay-vs-native-map
        // touch issues from src/search/SearchBox.tsx apply, since this is a
        // native map ornament, not an RN sibling view).
        compass
        compassHiddenFacingNorth
        compassPosition={{ top: 60, right: 12 }}>
        <Camera
          ref={cameraRef}
          initialViewState={{ center: BELIZE_CITY, zoom: INITIAL_ZOOM }}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          maxBounds={MAX_BOUNDS}
        />

        {locationEnabled && <NativeUserLocation mode="heading" />}

        {selectedPlace && !routingActive && (
          <Marker lngLat={[selectedPlace.lon, selectedPlace.lat]}>
            <View style={styles.pin} />
          </Marker>
        )}

        {activeCategory && !routingActive && categoryResults.map(r => (
          <Marker key={r.id} lngLat={[r.lon, r.lat]} onPress={() => handleSelectCategoryResult(r)}>
            <View style={styles.categoryDot} />
          </Marker>
        ))}

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

      <SearchBox onSelect={handleSelect} recentSearches={recentSearches} favorites={favorites} />

      {!routingActive && (
        <CategoryBar active={activeCategory} onSelect={handleSelectCategory} />
      )}

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

      {/*
       * Zoom control: a stacked +/- pill on the right edge, same shape as
       * Kakao/Naver's own zoom buttons. Pinch-to-zoom and double-tap-zoom
       * already work natively (MapLibre's touchZoom/doubleTapZoom defaults)
       * — this is the explicit-tap alternative both apps also offer
       * alongside gestures, not a replacement for them.
       */}
      <View style={styles.zoomControl}>
        <Pressable
          style={[styles.zoomButton, currentZoom >= MAX_ZOOM && styles.zoomButtonDisabled]}
          onPress={handleZoomIn}
          disabled={currentZoom >= MAX_ZOOM}>
          <Text style={styles.zoomButtonText}>＋</Text>
        </Pressable>
        <View style={styles.zoomDivider} />
        <Pressable
          style={[styles.zoomButton, currentZoom <= MIN_ZOOM && styles.zoomButtonDisabled]}
          onPress={handleZoomOut}
          disabled={currentZoom <= MIN_ZOOM}>
          <Text style={styles.zoomButtonText}>－</Text>
        </Pressable>
      </View>

      <Pressable style={styles.locateButton} onPress={handleLocateMe}>
        <Text style={styles.locateButtonText}>📍</Text>
      </Pressable>

      {/*
       * Basemap toggle: satellite imagery + roads/labels overlaid on top
       * ("hybrid", matching Kakao's 스카이뷰/Naver's satellite view) vs. our
       * normal vector map. See backend/martin-config.yaml's "satellite"
       * source and scripts/build_satellite_mosaic.sh for where the imagery
       * comes from.
       */}
      <Pressable style={styles.satelliteButton} onPress={() => setShowSatellite(v => !v)}>
        <Text style={styles.satelliteButtonText}>{showSatellite ? '🗺️' : '🛰️'}</Text>
      </Pressable>

      <PlaceCard
        place={routingActive ? null : selectedPlace}
        travelPreview={travelPreview}
        isFavorite={isSelectedPlaceFavorite}
        onClose={() => setSelectedPlace(null)}
        onDirections={() => selectedPlace && startDirectionsTo(selectedPlace)}
        onToggleFavorite={handleToggleFavorite}
      />

      <CategoryResultsSheet
        visible={!!activeCategory && !routingActive && !selectedPlace}
        loading={categoryLoading}
        error={categoryError}
        categoryLabel={activeCategory ? categoryLabel(activeCategory) : ''}
        results={categoryResults}
        onSelect={handleSelectCategoryResult}
        onClose={closeCategoryBrowsing}
      />

      <RoutePanel
        visible={showRoutePanel}
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
  categoryDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#2f7d6c',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  directionsButtonWrap: {
    position: 'absolute',
    top: 164,
    left: 12,
    zIndex: 8,
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
  zoomControl: {
    position: 'absolute',
    bottom: 92,
    right: 16,
    width: 48,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  zoomButton: {
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomButtonDisabled: {
    opacity: 0.35,
  },
  zoomButtonText: {
    fontSize: 22,
    fontWeight: '600',
    color: '#3a3226',
  },
  zoomDivider: {
    height: 1,
    backgroundColor: '#f0ede4',
  },
  locateButton: {
    position: 'absolute',
    bottom: 32,
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  locateButtonText: {
    fontSize: 22,
  },
  satelliteButton: {
    position: 'absolute',
    bottom: 197,
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  satelliteButtonText: {
    fontSize: 20,
  },
});

export default App;
