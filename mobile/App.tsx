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

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View, type NativeSyntheticEvent } from 'react-native';
import {
  Map,
  Camera,
  Marker,
  GeoJSONSource,
  Layer,
  NativeUserLocation,
  useCurrentPosition,
  type CameraRef,
  type LngLatBounds,
  type MapRef,
  type PressEvent,
  type ViewStateChangeEvent,
} from '@maplibre/maplibre-react-native';
import basicStyle from './src/styles/basic.json';
import basicDarkStyle from './src/styles/basic-dark.json';
import hybridStyle from './src/styles/hybrid.json';
import SearchBox from './src/search/SearchBox';
import { reverseGeocode, searchNearby, type SearchResult } from './src/search/api';
import { fetchRoute, type Costing, type RouteResult } from './src/routing/api';
import RoutePanel, { PEEK_HEIGHT as ROUTE_PANEL_PEEK_HEIGHT } from './src/routing/RoutePanel';
import DirectionsSearchPanel, {
  PANEL_HEIGHT as DIRECTIONS_PANEL_HEIGHT,
  PANEL_TOP as DIRECTIONS_PANEL_TOP,
} from './src/routing/DirectionsSearchPanel';
import MapPointPicker from './src/routing/MapPointPicker';
import NavigationBar from './src/routing/NavigationBar';
import { getRemainingTrip, getUpcomingManeuver, MANEUVER_ARRIVAL_THRESHOLD_KM } from './src/routing/navigation';
import { useLiveActivity } from './src/routing/useLiveActivity';
import PlaceCard, { type TravelPreview } from './src/places/PlaceCard';
import AttributionFooter from './src/attribution/AttributionFooter';
import CategoryBar from './src/categories/CategoryBar';
import CategoryResultsSheet from './src/categories/CategoryResultsSheet';
import { categoryLabel, haversineKm, type NearbyResult } from './src/categories/categories';
import MeetupPanel, { PARTICIPANT_COLORS } from './src/meetup/MeetupPanel';
import MeetupResultsSheet from './src/meetup/MeetupResultsSheet';
import type { MeetupCandidate } from './src/meetup/api';
import { useMeetup } from './src/meetup/useMeetup';
import SharingPanel from './src/sharing/SharingPanel';
import { useSharing } from './src/sharing/useSharing';
import MeasureBar from './src/measure/MeasureBar';
import { toClosedRing } from './src/measure/geometry';
import { useMeasure } from './src/measure/useMeasure';
import OfflineMapsPanel from './src/offline/OfflineMapsPanel';
import { useOfflineMaps } from './src/offline/useOfflineMaps';
import ListsManagerPanel from './src/lists/ListsManagerPanel';
import ListViewSheet from './src/lists/ListViewSheet';
import type { ListPlace } from './src/lists/api';
import { useLists } from './src/lists/useLists';
import WeatherWidget from './src/weather/WeatherWidget';
import { useWeather } from './src/weather/useWeather';
import {
  addFavorite,
  addRecentSearch,
  getFavorites,
  getRecentSearches,
  removeFavorite,
} from './src/places/favorites';
import AlongRouteSheet from './src/routing/AlongRouteSheet';
import type { AlongRouteResult } from './src/routing/searchAlongRoute';
import { useAlongRoute } from './src/routing/useAlongRoute';
import ReportHazardSheet from './src/hazards/ReportHazardSheet';
import HazardInfoCard from './src/hazards/HazardInfoCard';
import { HAZARD_TYPE_EMOJI } from './src/hazards/api';
import { useHazards } from './src/hazards/useHazards';
import { useSpotlight } from './src/spotlight/useSpotlight';
import ReportCorrectionSheet from './src/poi-corrections/ReportCorrectionSheet';
import { submitPOICorrection, type CorrectionField } from './src/poi-corrections/api';
import FerryPanel from './src/ferries/FerryPanel';
import { useFerries } from './src/ferries/useFerries';
import DiveSitesPanel from './src/dive-sites/DiveSitesPanel';
import type { DiveSite } from './src/dive-sites/api';
import { useDiveSites } from './src/dive-sites/useDiveSites';
import BorderCrossingInfoCard from './src/border-crossings/BorderCrossingInfoCard';
import type { BorderCrossing } from './src/border-crossings/api';
import { useBorderCrossings } from './src/border-crossings/useBorderCrossings';
import { updateWidgetData } from './src/widget/api';
import { weatherCodeInfo } from './src/weather/weatherCodes';
import MoreMenu, { type MoreMenuItem } from './src/menu/MoreMenu';
import { useMoreMenu } from './src/menu/useMoreMenu';
import ErrorLogPanel from './src/errors/ErrorLogPanel';
import { logError } from './src/errors/logger';
import { useErrorLog } from './src/errors/useErrorLog';
import { useTheme } from './src/theme/ThemeContext';
import { formatTemp } from './src/weather/api';

// Belize City — the app's initial view. The user can pan/search anywhere in
// the country from here; see the coverage note above.
const BELIZE_CITY: [number, number] = [-88.19, 17.4995];
const INITIAL_ZOOM = 13;

// Zoom bounds — applied to both the +/- buttons AND pinch/double-tap zoom
// (via <Camera minZoom/maxZoom> below). Unlike Kakao/Naver we don't have
// global basemap coverage, just Belize's own OSM extract, so zooming out
// indefinitely would eventually show a hard, ugly edge where our data (and
// the "sea" polygon backing styles/basic.json's water fix) just stops.
// MAX_BOUNDS below is a real MapLibre `maxBounds` — it constrains the
// rendered viewport itself, not just the pan center, so it's what actually
// stops zooming out from ever revealing the void past our data; MIN_ZOOM
// just needs to not be tighter than what's actually useful.
// 7, not 9: you asked for the zoomed-out view to show the whole country,
// not just "however far out feels safe." Checked against MAX_BOUNDS' own
// extent (2.6° wide x 2.85° tall) with this screen's real viewport-size-
// per-zoom math (accounting for Mercator's cos(latitude) stretch at
// Belize's ~17°N): the full width only fits from zoom 7 down — zoom 8
// still crops the east/west edges. Confirmed visually in the simulator,
// not just by the math: zoomed all the way out at 7, Corozal down to
// Punta Gorda and the offshore reef are all on screen together with
// margin to spare, no dead void beyond the coastline. 19 is building-level,
// past which our vector tiles (maxzoom 16) just get upscaled with no new
// detail — the same tradeoffs Kakao/Naver's own zoom limits make, just
// calibrated to our smaller data footprint.
const MIN_ZOOM = 7;
const MAX_ZOOM = 19;

// Matches the "sea" layer's real data extent (see scripts/import_water_
// polygons.sh) — restricts panning so the map center can't wander into the
// "outside our coverage" void beyond it. Deliberately NOT shrunk tighter
// than that (e.g. to fully guarantee no edge at MIN_ZOOM): every real town
// we've tested navigation to — including Corozal and Punta Gorda at the
// country's northern/southern extremes — needs to stay reachable.
// [west, south, east, north].
const MAX_BOUNDS: [number, number, number, number] = [-89.35, 15.75, -86.75, 18.6];

// Screen-space padding for the auto-fit-route camera move below — keeps the
// route (both endpoints included) clear of the UI actually covering the map
// at that moment. Derived directly from DirectionsSearchPanel's and
// RoutePanel's own exported height constants (not independently guessed —
// an earlier version of this padding was too small on both edges, letting
// part of the route render underneath one panel or the other) plus a small
// breathing-room buffer on each. RoutePanel is a draggable sheet — this
// only needs to clear its resting (peek) height, not its dragged-open one,
// since fitting around the fully expanded sheet would leave hardly any map
// visible at all.
const ROUTE_FIT_PADDING = {
  top: DIRECTIONS_PANEL_TOP + DIRECTIONS_PANEL_HEIGHT + 20,
  right: 40,
  bottom: ROUTE_PANEL_PEEK_HEIGHT + 20,
  left: 40,
};

/** [west, south, east, north] enclosing every coordinate along the route's
 * actual road geometry — not just origin/destination, since a real route
 * regularly bows out well past a straight line between the two (a detour
 * around a river, a highway that isn't direct) and a bounds fit from just
 * the two endpoints would clip it. Used to auto-fit the camera once a
 * route comes back, so the whole thing is visible without a manual pan. */
function boundsFromRouteCoordinates(coordinates: GeoJSON.Position[]): LngLatBounds {
  let west = coordinates[0][0];
  let east = coordinates[0][0];
  let south = coordinates[0][1];
  let north = coordinates[0][1];
  for (const [lon, lat] of coordinates) {
    if (lon < west) west = lon;
    if (lon > east) east = lon;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }
  return [west, south, east, north];
}

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
  const { colors, scheme, preference, cyclePreference } = useTheme();
  const cameraRef = useRef<CameraRef>(null);
  const mapRef = useRef<MapRef>(null);

  // These are quick, dismissable utility overlays (unlike Directions/Meet
  // Up/Measure's full "modes") — sharing this one helper keeps them from
  // ever rendering on top of each other or the plain search box, which
  // they'd otherwise do since each has its own independent button.
  // Defined early (before any of the panel hooks below, several of which
  // take it as a constructor argument) — safe to reference those hooks'
  // own close() methods here regardless, since this function's *body*
  // only actually runs later, by which point every hook below has
  // already been called during this same render.
  const closeUtilityPanels = () => {
    hazards.closeReport();
    sharing.close();
    offlineMaps.close();
    lists.closeManager();
    weatherFeature.close();
    ferries.close();
    diveSites.close();
    moreMenu.close();
    errorLog.close();
  };

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

  // --- Border-crossing info cards (2026-09-11) ---
  // Per docs/research/12-ferry-dive-site-data-sourcing.md's same "curated,
  // not live" pattern as ferries/dive sites — only ever 2 of these
  // (fixed, real-world locations), so they're just always-visible map
  // markers rather than needing their own toggle button/panel; fetched
  // once on mount like favorites/recentSearches above.
  const borderCrossings = useBorderCrossings();

  const handleBorderCrossingDirections = (crossing: BorderCrossing) => {
    borderCrossings.select(null);
    startDirectionsTo({
      id: `border-${crossing.id}`,
      name: crossing.name,
      subtitle: crossing.countries.join(' / '),
      lat: crossing.lat,
      lon: crossing.lon,
      kind: 'poi',
    });
  };

  // useCallback'd — a stable identity so useSpotlight's selection-listener
  // effect (which takes this as a parameter, not a local closure) doesn't
  // need to resubscribe on every render just because this got a new
  // reference; setRecentSearches is itself stable and addRecentSearch is a
  // module-level import, so an empty deps array is safe here.
  const recordRecentSearch = useCallback((place: SearchResult) => {
    addRecentSearch(place).then(setRecentSearches);
  }, []);

  // --- iOS Spotlight search integration ---
  useSpotlight(favorites, recentSearches, setSelectedPlace, recordRecentSearch, cameraRef);

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

  // --- Live location sharing (see sharing/README.md) ---
  const sharing = useSharing(locationEnabled, setLocationEnabled, currentPosition, closeUtilityPanels);

  // --- Routing state ---
  // origin/destination carry a display name (not just LatLon) so
  // DirectionsSearchPanel's two fields have something to show — a search
  // selection has a real name; a map tap gets a generic placeholder one
  // (see handleMapPress). fetchRoute below only reads .lat/.lon off these,
  // same as it always did.
  const [routingActive, setRoutingActive] = useState(false);
  const [origin, setOrigin] = useState<SearchResult | null>(null);
  const [destination, setDestination] = useState<SearchResult | null>(null);
  // Which field the next map tap (handleMapPress) or "use current location"
  // shortcut should fill — tracks whichever field the user last focused in
  // DirectionsSearchPanel, defaulting to origin whenever routing mode starts.
  const [activeRouteField, setActiveRouteField] = useState<'origin' | 'destination'>('origin');

  // --- "Select on map" (Naver/Kakao's 지도에서 선택) ---
  // A pin fixed at the exact screen center; the map pans underneath it
  // (native gesture, untouched) and whatever's at rest under the pin gets
  // reverse-geocoded — see src/routing/MapPointPicker.tsx's own header
  // comment for why this is a distinct interaction from a plain map tap.
  const [pickingMapPointFor, setPickingMapPointFor] = useState<'origin' | 'destination' | null>(null);
  const [mapPickPreview, setMapPickPreview] = useState<SearchResult | null>(null);
  const [mapPickLoading, setMapPickLoading] = useState(false);
  // Guards against a slow reverse-geocode response from an earlier pan
  // overwriting the preview for a later one that already resolved —
  // incremented on every lookup, applied only if still current on return.
  const pickRequestIdRef = useRef(0);
  const pickDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lookUpMapPickCenter = (lat: number, lon: number) => {
    const requestId = ++pickRequestIdRef.current;
    setMapPickLoading(true);
    reverseGeocode(lat, lon)
      .then(result => {
        if (pickRequestIdRef.current === requestId) setMapPickPreview(result);
      })
      .catch(() => {
        if (pickRequestIdRef.current === requestId) setMapPickPreview(null);
      })
      .finally(() => {
        if (pickRequestIdRef.current === requestId) setMapPickLoading(false);
      });
  };

  const handlePickOnMap = async (field: 'origin' | 'destination') => {
    setPickingMapPointFor(field);
    setMapPickPreview(null);
    const center = await mapRef.current?.getCenter();
    if (center) lookUpMapPickCenter(center[1], center[0]);
  };

  const handleCancelMapPick = () => {
    setPickingMapPointFor(null);
    setMapPickPreview(null);
  };

  const handleConfirmMapPick = () => {
    if (!mapPickPreview || !pickingMapPointFor) return;
    if (pickingMapPointFor === 'origin') handleSelectOrigin(mapPickPreview);
    else handleSelectDestination(mapPickPreview);
    setPickingMapPointFor(null);
    setMapPickPreview(null);
  };

  // A short debounce here (same idea, same duration as SearchBox's own
  // search debounce) coalesces a flurry of small pans into one lookup
  // rather than firing a reverse-geocode request after every single one.
  const handleRegionDidChange = (e: NativeSyntheticEvent<ViewStateChangeEvent>) => {
    setCurrentZoom(e.nativeEvent.zoom);
    hazards.notifyRegionChanged();

    if (!pickingMapPointFor) return;
    if (pickDebounceRef.current) clearTimeout(pickDebounceRef.current);
    const [lon, lat] = e.nativeEvent.center;
    pickDebounceRef.current = setTimeout(() => lookUpMapPickCenter(lat, lon), 300);
  };

  const [costing, setCosting] = useState<Costing>('auto');
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  useEffect(() => {
    if (!origin || !destination) return;
    setRouteLoading(true);
    setRouteError(null);
    fetchRoute(origin, destination, costing)
      .then(result => {
        setRoute(result);
        // Fit the whole route in view — up to now the camera's just wherever
        // the last search/map-tap/pick left it (often centered on only the
        // destination), which is why only one end tended to show. Re-fits on
        // every successful fetch, including a costing-switch refetch, since
        // a walk/bike/drive route can trace a meaningfully different path.
        cameraRef.current?.fitBounds(boundsFromRouteCoordinates(result.geometry.coordinates), {
          padding: ROUTE_FIT_PADDING,
          duration: 800,
        });
      })
      .catch(e => {
        setRoute(null);
        setRouteError(e.message === 'Valhalla 400' ? 'No route found between these points.' : 'Could not fetch route.');
      })
      .finally(() => setRouteLoading(false));
  }, [origin, destination, costing]);

  // --- Search along route ---
  // Per docs/research/10-remaining-feature-gaps.md: no new backend, just
  // src/routing/searchAlongRoute.ts sampling the existing route geometry
  // and reusing src/search/api.ts's searchNearby per sample.
  const alongRoute = useAlongRoute(route);

  const handleSelectAlongRouteResult = (result: AlongRouteResult) => {
    // Replaces the destination and lets the existing route-fetch effect
    // reroute — this app doesn't support multi-stop routes, so "search
    // along the way, then reroute to stop there" is the natural fit rather
    // than inserting a waypoint into the existing leg.
    alongRoute.close();
    setDestination(result);
    recordRecentSearch(result);
  };

  // --- Live turn-by-turn navigation ---
  // No map-matching — distance-to-next-turn is straight-line from the live
  // GPS fix to the upcoming maneuver's coordinate (see src/routing/
  // navigation.ts for why, and what that trades away: real off-route
  // detection would need actual path-projection, which this doesn't do).
  const [navigationActive, setNavigationActive] = useState(false);
  const [currentManeuverIndex, setCurrentManeuverIndex] = useState(0);

  const upcomingManeuver =
    navigationActive && route && currentPosition
      ? getUpcomingManeuver(route, currentManeuverIndex, {
          lat: currentPosition.coords.latitude,
          lon: currentPosition.coords.longitude,
        })
      : null;
  const navigationArrived = navigationActive && !upcomingManeuver;

  useEffect(() => {
    if (!upcomingManeuver) return;
    if (upcomingManeuver.distanceToManeuverKm <= MANEUVER_ARRIVAL_THRESHOLD_KM) {
      setCurrentManeuverIndex(upcomingManeuver.index);
    }
  }, [upcomingManeuver]);

  const handleStartNavigation = () => {
    if (!locationEnabled) setLocationEnabled(true);
    setCurrentManeuverIndex(0);
    setNavigationActive(true);
    cameraRef.current?.zoomTo(17, { duration: 500 });
  };

  const handleEndNavigation = () => {
    setNavigationActive(false);
  };

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
    } catch (e) {
      logError('category:nearby', e, { category: key });
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

  // --- Fair meeting-point calculator ---
  const meetup = useMeetup(locationEnabled, setLocationEnabled, currentPosition, recordRecentSearch);

  const toggleMeetup = () => {
    if (meetup.active) {
      meetup.reset();
    } else {
      meetup.activate();
      closeCategoryBrowsing();
      if (routingActive) toggleRouting(); // mutually exclusive top-level modes
      if (measure.active) toggleMeasure();
      setSelectedPlace(null); // a stale card from earlier browsing shouldn't linger over this
    }
  };

  const handleSelectMeetupCandidate = (candidate: MeetupCandidate) => {
    // Picking a result ends meetup mode — the natural next step is the
    // place's own card (Directions from here, etc.), not more comparing.
    meetup.reset();
    setSelectedPlace(candidate.place);
    cameraRef.current?.flyTo({ center: [candidate.place.lon, candidate.place.lat], zoom: 16, duration: 1200 });
  };

  // --- Distance/area measurement tool ---
  // Confirmed against live Kakao Map research (see src/measure/geometry.ts's
  // header comment): their mobile app only has distance (tap points,
  // cumulative straight-line total, an X to end/clear) — area/radius are
  // PC-only there. Built here anyway per the original request, following
  // the same tap-to-place interaction for both modes since there's no
  // mobile reference for area to diverge from.
  const measure = useMeasure();

  const toggleMeasure = () => {
    if (measure.active) {
      measure.deactivate();
    } else {
      measure.activate();
      closeCategoryBrowsing();
      if (routingActive) toggleRouting(); // mutually exclusive top-level modes
      if (meetup.active) toggleMeetup();
    }
  };

  // --- Offline maps (Phase 5) ---
  // See src/offline/api.ts's header comment for why this is just a thin
  // download-management UI over MapLibre Native's own built-in offline
  // pack system, not custom online/offline-switching logic — once a pack
  // covers the current view, the native SDK serves from it automatically
  // whenever a live tile request fails.
  const offlineMaps = useOfflineMaps(mapRef, closeUtilityPanels, showSatellite, MIN_ZOOM, INITIAL_ZOOM);

  // --- Shareable saved-place lists (Naver's Dec 2022 favorites-folder upgrade) ---
  // Additive on top of the existing flat favorites (favorites.ts) — a list
  // is a named, shareable subset of your favorites, not a replacement for
  // the ★ flow. Same short-code backend as location sharing (sharing/),
  // different resource (src/lists/api.ts).
  const lists = useLists(favorites, closeUtilityPanels);

  const handleSelectListPlace = (place: ListPlace) => {
    lists.closeViewSheet();
    setSelectedPlace({ ...place, kind: 'poi' });
    cameraRef.current?.flyTo({ center: [place.lon, place.lat], zoom: 16, duration: 1200 });
  };

  // --- Weather (low-effort polish, not a functional gap — see
  // docs/research/09-kakao-naver-feature-audit.md) ---
  const weatherFeature = useWeather(mapRef, closeUtilityPanels);

  // --- iOS home screen widget (2026-09-11) ---
  // One-way mirror into a shared App Group store — see src/widget/api.ts's
  // header comment. Pushes a fresh copy whenever weather/tempUnit/
  // favorites change, same "just keep it in sync" approach as the
  // Spotlight indexing effect above.
  useEffect(() => {
    const info = weatherFeature.weather ? weatherCodeInfo(weatherFeature.weather.weatherCode) : null;
    updateWidgetData({
      weatherEmoji: info?.emoji,
      weatherLabel: info?.label,
      tempDisplay: weatherFeature.weather
        ? formatTemp(weatherFeature.weather.tempC, weatherFeature.tempUnit)
        : undefined,
      favorites: favorites.slice(0, 3).map(f => ({ name: f.name, subtitle: f.subtitle })),
    });
  }, [weatherFeature.weather, weatherFeature.tempUnit, favorites]);

  // --- Crowdsourced road hazard reporting (Waze's core idea) ---
  const hazards = useHazards(mapRef, currentPosition, closeUtilityPanels);

  // --- "More" menu (2026-09-11) ---
  // Consolidates what used to be seven separate floating buttons (weather,
  // saved lists, offline maps, live-location sharing, road hazards, ferry
  // schedules, dive sites) into one — see src/menu/MoreMenu.tsx's header
  // comment for why (real Kakao/Naver screenshots both keep the map's
  // right edge to 3-4 buttons, never seven-plus). Each row below just
  // calls the same toggle*() function its old standalone button used to.
  const moreMenu = useMoreMenu(closeUtilityPanels);

  // --- Error log (2026-09-11) ---
  // Reached from the More menu — see src/errors/useErrorLog.ts /
  // logger.ts's header comments for why this exists and why it's its own
  // hook now.
  const errorLog = useErrorLog(closeUtilityPanels);

  // --- Ferry/water-taxi schedules (2026-09-11) ---
  // Per docs/research/12-ferry-dive-site-data-sourcing.md: no API/feed
  // exists anywhere for this — sharing/data/ferry_routes.json is curated,
  // hand-maintained content, fetched once per app session and cached in
  // state rather than re-fetched on every open (it changes on a
  // months-long cadence, not per-use).
  const ferries = useFerries(closeUtilityPanels);

  // --- Dive sites (2026-09-11) ---
  // Same "no structured source exists, this is curated" situation as
  // ferries above — see the same research doc. One toggle controls both
  // the map markers and the list sheet together (unlike hazards, there's
  // no independent live layer here worth keeping open past the panel).
  const diveSites = useDiveSites(closeUtilityPanels);

  const handleDiveSiteDirections = (site: DiveSite) => {
    diveSites.close();
    startDirectionsTo({
      id: `dive-${site.id}`,
      name: site.name,
      subtitle: site.reserve,
      lat: site.lat,
      lon: site.lon,
      kind: 'poi',
    });
  };

  const handleSelect = (result: SearchResult) => {
    setSelectedPlace(result);
    recordRecentSearch(result);
    cameraRef.current?.flyTo({ center: [result.lon, result.lat], zoom: 16, duration: 1200 });
  };

  // --- DirectionsSearchPanel wiring ---
  // Each field is independently searchable/tappable now (Naver/Kakao-style),
  // not "first search picks origin, second picks destination" — see that
  // component's own header comment for why this replaced the old flow.
  const handleSelectOrigin = (result: SearchResult) => {
    setOrigin(result);
    recordRecentSearch(result);
    if (!destination) setActiveRouteField('destination'); // advance to the other empty field
  };

  const handleSelectDestination = (result: SearchResult) => {
    setDestination(result);
    recordRecentSearch(result);
    if (!origin) setActiveRouteField('origin');
  };

  const handleClearOrigin = () => {
    setOrigin(null);
    setActiveRouteField('origin');
  };

  const handleClearDestination = () => {
    setDestination(null);
    setActiveRouteField('destination');
  };

  const handleSwapRoutePoints = () => {
    setOrigin(destination);
    setDestination(origin);
  };

  const handleUseCurrentLocationAsOrigin = () => {
    if (!locationEnabled) setLocationEnabled(true);
    if (!currentPosition) return; // permission/fix not ready yet — nothing to fill in with
    setOrigin({
      id: 'current-location',
      name: 'My location',
      subtitle: 'Current position',
      lat: currentPosition.coords.latitude,
      lon: currentPosition.coords.longitude,
      kind: 'poi',
    });
    if (!destination) setActiveRouteField('destination');
  };

  const handleMapPress = async (event: NativeSyntheticEvent<PressEvent>) => {
    // "Select on map" mode owns the map entirely while active (pan-then-
    // confirm, not tap-to-set) — a stray tap shouldn't also set a point
    // behind its back via the plain-tap path below.
    if (pickingMapPointFor) return;

    if (measure.active) {
      const [lon, lat] = event.nativeEvent.lngLat;
      measure.addPoint(lat, lon);
      return;
    }

    if (routingActive) {
      const [lon, lat] = event.nativeEvent.lngLat;
      // Fills whichever field is currently focused (see DirectionsSearchPanel's
      // onFocusField) — not always "origin first" — a tapped point has no
      // real name, unlike a search pick, so it gets a generic placeholder.
      const tapped: SearchResult = {
        id: `tapped-${lat},${lon}`,
        name: 'Dropped pin',
        subtitle: 'Tapped on map',
        lat,
        lon,
        kind: 'poi',
      };
      if (activeRouteField === 'origin') {
        setOrigin(tapped);
        if (!destination) setActiveRouteField('destination');
      } else {
        setDestination(tapped);
        if (!origin) setActiveRouteField('origin');
      }
      return;
    }

    if (meetup.active) {
      const [lon, lat] = event.nativeEvent.lngLat;
      meetup.selectParticipant(meetup.activeParticipantIndex, {
        id: `tapped-${lat},${lon}`,
        name: 'Dropped pin',
        subtitle: 'Tapped on map',
        lat,
        lon,
        kind: 'poi',
      });
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
    setDestination(place);
    setActiveRouteField('origin');
  };

  // --- Report a POI correction (Tier 2 of docs/research/
  // 11-kakao-naver-poi-data-sourcing.md) ---
  // correctionTarget is a separate snapshot from selectedPlace, since
  // opening the sheet closes PlaceCard (same "one bottom sheet at a time"
  // pattern as startDirectionsTo above) — selectedPlace would already be
  // null by the time the sheet needs to know what it's reporting on.
  const [correctionTarget, setCorrectionTarget] = useState<SearchResult | null>(null);
  const [correctionSubmitting, setCorrectionSubmitting] = useState(false);
  const [correctionError, setCorrectionError] = useState<string | null>(null);

  const handleOpenCorrection = () => {
    if (!selectedPlace) return;
    setCorrectionTarget(selectedPlace);
    setSelectedPlace(null);
  };

  const handleSubmitCorrection = async (field: CorrectionField, suggestedValue: string, note: string) => {
    if (!correctionTarget) return;
    setCorrectionSubmitting(true);
    setCorrectionError(null);
    try {
      await submitPOICorrection({
        poiId: correctionTarget.id.replace(/^poi-/, ''),
        poiName: correctionTarget.name,
        field,
        currentValue: field === 'name' ? correctionTarget.name : undefined,
        suggestedValue: suggestedValue || undefined,
        note: note || undefined,
      });
      setCorrectionTarget(null);
      Alert.alert('Thanks!', "Your report was submitted — someone will review it before anything changes.");
    } catch (e) {
      logError('poiCorrection:submit', e, { field });
      setCorrectionError('Could not submit — try again.');
    } finally {
      setCorrectionSubmitting(false);
    }
  };

  const toggleRouting = () => {
    if (routingActive) {
      setRoutingActive(false);
      clearRoute();
    } else {
      setRoutingActive(true);
      closeCategoryBrowsing(); // category chips don't mean anything mid-directions
      if (meetup.active) toggleMeetup(); // mutually exclusive top-level modes
      if (measure.active) toggleMeasure();
      setActiveRouteField('origin');
      // If a place is already selected (from search or a map tap), use it
      // as the destination right away — the common "look at a place, then
      // get directions to it" flow.
      if (selectedPlace) {
        setDestination(selectedPlace);
        setSelectedPlace(null);
      }
    }
  };

  const clearRoute = () => {
    setOrigin(null);
    setDestination(null);
    setRoute(null);
    setRouteError(null);
    setNavigationActive(false);
    alongRoute.close();
  };

  const showRoutePanel =
    routingActive && !navigationActive && !pickingMapPointFor && (routeLoading || !!route || !!routeError);
  const remainingTrip = route ? getRemainingTrip(route, currentManeuverIndex) : null;

  // --- Live Activity / Dynamic Island (iOS only) ---
  useLiveActivity(navigationActive, navigationArrived, upcomingManeuver, remainingTrip, costing);

  // Quick, dismissable utility overlays (sharing/offline/lists/weather) —
  // unlike Directions/Meet Up/Measure's full "modes," each has its own
  // independent button, so without this they could otherwise render on
  // top of the plain search box or each other (closeUtilityPanels above
  // keeps at most one of these four open at a time; this keeps the
  // *other* top-of-screen UI out of their way too).
  const anyUtilityPanelOpen =
    sharing.panelVisible ||
    offlineMaps.visible ||
    lists.managerVisible ||
    weatherFeature.visible ||
    hazards.reportVisible ||
    ferries.visible ||
    diveSites.active ||
    moreMenu.visible ||
    errorLog.visible;

  const appearanceLabel = preference === 'system' ? 'System' : preference === 'light' ? 'Light' : 'Dark';

  const moreMenuItems: MoreMenuItem[] = [
    { key: 'appearance', icon: '🌓', label: `Appearance: ${appearanceLabel}`, onPress: cyclePreference },
    { key: 'weather', icon: '🌤️', label: 'Weather', onPress: weatherFeature.toggle },
    { key: 'lists', icon: '📋', label: 'Saved lists', onPress: lists.toggleManager },
    { key: 'offline', icon: '⬇️', label: 'Offline maps', onPress: offlineMaps.toggle },
    { key: 'sharing', icon: '📡', label: 'Share my location', onPress: sharing.toggle },
    {
      key: 'hazards',
      icon: '⚠️',
      label: 'Road hazards',
      onPress: hazards.toggleLayer,
      active: hazards.layerVisible,
    },
    { key: 'ferry', icon: '⛴️', label: 'Ferry schedules', onPress: ferries.toggle },
    {
      key: 'dive',
      icon: '🤿',
      label: 'Dive sites',
      onPress: diveSites.toggle,
      active: diveSites.active,
    },
    { key: 'errorLog', icon: '🐞', label: 'Error log', onPress: errorLog.toggle },
  ];

  return (
    <View style={styles.container}>
      <Map
        ref={mapRef}
        style={styles.map}
        mapStyle={
          // Satellite/hybrid has no dark variant — real satellite
          // photography doesn't change with system dark mode in any map
          // app (Google/Apple/Naver's satellite views don't either), so
          // only the vector "basic" style swaps for scheme.
          (showSatellite ? hybridStyle : scheme === 'dark' ? basicDarkStyle : basicStyle) as any
        }
        onPress={handleMapPress}
        onRegionDidChange={handleRegionDidChange}
        // Native compass control: appears when the map is rotated away from
        // north, hides itself when facing north again, and resets bearing
        // to north when tapped — all built into MapLibre Native, no custom
        // touch handling needed (and none of the RN-overlay-vs-native-map
        // touch issues from src/search/SearchBox.tsx apply, since this is a
        // native map ornament, not an RN sibling view).
        compass
        compassHiddenFacingNorth
        compassPosition={{ top: 60, right: 12 }}
        // Using our own AttributionFooter (below) instead of MapLibre
        // Native's built-in attribution button — see that component's own
        // comment for why (a documented history of native-side crashes
        // parsing HTML attribution strings out of style sources).
        attribution={false}>
        <Camera
          ref={cameraRef}
          initialViewState={{ center: BELIZE_CITY, zoom: INITIAL_ZOOM }}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          maxBounds={MAX_BOUNDS}
          // During navigation, MapLibre Native's own follow-camera takes
          // over centering + bearing (using GPS course — direction of
          // travel — rather than the compass, which is noisier in a moving
          // vehicle). Undefined the rest of the time, leaving the camera
          // fully manual as usual.
          trackUserLocation={navigationActive ? 'course' : undefined}
        />

        {locationEnabled && <NativeUserLocation mode={navigationActive ? 'course' : 'heading'} />}

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

        {sharing.viewedPosition && (
          <Marker lngLat={[sharing.viewedPosition.lon, sharing.viewedPosition.lat]}>
            <View style={styles.sharedLocationDot} />
          </Marker>
        )}

        {meetup.active &&
          meetup.participants.map(
            (p, i) =>
              p && (
                <Marker key={i} lngLat={[p.lon, p.lat]}>
                  <View style={[styles.pin, { backgroundColor: PARTICIPANT_COLORS[i] }]} />
                </Marker>
              ),
          )}
        {meetup.resultsVisible &&
          meetup.candidates.map((c, i) => (
            <Marker
              key={c.place.id}
              lngLat={[c.place.lon, c.place.lat]}
              onPress={() => handleSelectMeetupCandidate(c)}>
              <View style={[styles.categoryDot, i === 0 && styles.meetupTopPickDot]} />
            </Marker>
          ))}

        {measure.active && measure.mode === 'distance' && measure.points.length > 1 && (
          <GeoJSONSource
            id="measure-line"
            data={{ type: 'LineString', coordinates: measure.points.map(p => [p.lon, p.lat]) }}>
            <Layer
              id="measure-line-layer"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': '#d9773f', 'line-width': 4, 'line-dasharray': [2, 1.5] }}
            />
          </GeoJSONSource>
        )}

        {measure.active && measure.mode === 'area' && measure.points.length > 2 && (
          <GeoJSONSource
            id="measure-polygon"
            data={{ type: 'Polygon', coordinates: [toClosedRing(measure.points)] }}>
            <Layer id="measure-polygon-fill" type="fill" paint={{ 'fill-color': '#d9773f', 'fill-opacity': 0.25 }} />
            <Layer id="measure-polygon-outline" type="line" paint={{ 'line-color': '#d9773f', 'line-width': 3 }} />
          </GeoJSONSource>
        )}

        {measure.active &&
          measure.points.map((p, i) => (
            <Marker key={i} lngLat={[p.lon, p.lat]}>
              <View style={styles.measureVertexDot} />
            </Marker>
          ))}

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

        {hazards.layerVisible &&
          hazards.list.map(h => (
            <Marker key={h.id} lngLat={[h.lon, h.lat]} onPress={() => hazards.select(h)}>
              <View style={styles.hazardPin}>
                <Text style={styles.hazardPinEmoji}>{HAZARD_TYPE_EMOJI[h.type]}</Text>
              </View>
            </Marker>
          ))}

        {ferries.visible &&
          // Dedupe by name — the same stop (e.g. "San Pedro") appears
          // across several routes, and each should only get one pin. Not
          // `new Map(...)` — this file imports MapLibre's own `Map`
          // component under that exact name, which shadows the built-in
          // JS Map class (see src/hazards wiring for the same gotcha).
          ferries.routes
            .flatMap(r => r.stops)
            .filter((stop, i, all) => all.findIndex(s => s.name === stop.name) === i)
            .map(stop => (
              <Marker key={stop.name} lngLat={[stop.lon, stop.lat]}>
                <View style={styles.ferryPin}>
                  <Text style={styles.ferryPinEmoji}>⛴️</Text>
                </View>
              </Marker>
            ))}

        {diveSites.active &&
          diveSites.sites.map(site => (
            <Marker key={site.id} lngLat={[site.lon, site.lat]} onPress={() => handleDiveSiteDirections(site)}>
              <View style={styles.divePin}>
                <Text style={styles.divePinEmoji}>🤿</Text>
              </View>
            </Marker>
          ))}

        {borderCrossings.crossings.map(crossing => (
          <Marker
            key={crossing.id}
            lngLat={[crossing.lon, crossing.lat]}
            onPress={() => borderCrossings.select(crossing)}>
            <View style={styles.borderPin}>
              <Text style={styles.borderPinEmoji}>🛂</Text>
            </View>
          </Marker>
        ))}
      </Map>

      <AttributionFooter showSatelliteCredit={showSatellite} />

      {!routingActive && !navigationActive && !meetup.active && !measure.active && !anyUtilityPanelOpen && (
        <SearchBox onSelect={handleSelect} recentSearches={recentSearches} favorites={favorites} />
      )}

      {meetup.active && (
        <MeetupPanel
          participants={meetup.participants}
          activeIndex={meetup.activeParticipantIndex}
          onFocusParticipant={meetup.setActiveParticipantIndex}
          onSelectParticipant={meetup.selectParticipant}
          onClearParticipant={meetup.clearParticipant}
          onUseCurrentLocation={meetup.fillCurrentLocation}
          onAddParticipant={meetup.addParticipant}
          onRemoveParticipant={meetup.removeParticipant}
          onFindMeetupPoint={meetup.findMeetupPoint}
          finding={meetup.loading}
          onClose={toggleMeetup}
          recentSearches={recentSearches}
          favorites={favorites}
        />
      )}

      <MeetupResultsSheet
        visible={meetup.resultsVisible}
        loading={meetup.loading}
        error={meetup.error}
        candidates={meetup.candidates}
        onSelect={handleSelectMeetupCandidate}
        onClose={meetup.closeResults}
      />

      {measure.active && (
        <MeasureBar
          mode={measure.mode}
          onChangeMode={measure.changeMode}
          pointCount={measure.points.length}
          totalLabel={measure.totalLabel}
          onUndo={measure.undo}
          onClear={measure.clear}
          onClose={toggleMeasure}
        />
      )}

      {routingActive && !navigationActive && !pickingMapPointFor && (
        <DirectionsSearchPanel
          origin={origin}
          destination={destination}
          activeField={activeRouteField}
          onFocusField={setActiveRouteField}
          onSelectOrigin={handleSelectOrigin}
          onSelectDestination={handleSelectDestination}
          onClearOrigin={handleClearOrigin}
          onClearDestination={handleClearDestination}
          onSwap={handleSwapRoutePoints}
          onUseCurrentLocation={handleUseCurrentLocationAsOrigin}
          onPickOnMap={handlePickOnMap}
          onClose={toggleRouting}
          recentSearches={recentSearches}
          favorites={favorites}
        />
      )}

      {pickingMapPointFor && (
        <MapPointPicker
          field={pickingMapPointFor}
          preview={mapPickPreview}
          loading={mapPickLoading}
          onCancel={handleCancelMapPick}
          onConfirm={handleConfirmMapPick}
        />
      )}

      {!routingActive && !navigationActive && !meetup.active && !measure.active && !anyUtilityPanelOpen && (
        <CategoryBar active={activeCategory} onSelect={handleSelectCategory} />
      )}

      {!routingActive && !navigationActive && !meetup.active && !measure.active && !anyUtilityPanelOpen && (
        <View style={styles.directionsButtonWrap}>
          <Pressable
            style={[styles.directionsButton, { backgroundColor: colors.textPrimary }]}
            onPress={toggleRouting}
            accessibilityRole="button"
            accessibilityLabel="Directions">
            <Text style={[styles.directionsButtonText, { color: colors.onTextPrimary }]}>🧭 Directions</Text>
          </Pressable>
          <Pressable
            style={[styles.meetupButton, { backgroundColor: colors.textPrimary }]}
            onPress={toggleMeetup}
            accessibilityRole="button"
            accessibilityLabel="Meet Up">
            <Text style={[styles.directionsButtonText, { color: colors.onTextPrimary }]}>🤝 Meet Up</Text>
          </Pressable>
          <Pressable
            style={[styles.meetupButton, { backgroundColor: colors.textPrimary }]}
            onPress={toggleMeasure}
            accessibilityRole="button"
            accessibilityLabel="Measure">
            <Text style={[styles.directionsButtonText, { color: colors.onTextPrimary }]}>📏 Measure</Text>
          </Pressable>
        </View>
      )}

      <NavigationBar
        visible={navigationActive}
        arrived={navigationArrived}
        icon={upcomingManeuver?.maneuver.type ?? 0}
        instruction={upcomingManeuver?.maneuver.instruction ?? ''}
        distanceToManeuverKm={upcomingManeuver?.distanceToManeuverKm ?? 0}
        remainingDistanceKm={remainingTrip?.distanceKm ?? 0}
        remainingDurationMin={remainingTrip?.durationMin ?? 0}
        onEnd={handleEndNavigation}
      />

      {/*
       * Zoom control: a stacked +/- pill on the right edge, same shape as
       * Kakao/Naver's own zoom buttons. Pinch-to-zoom and double-tap-zoom
       * already work natively (MapLibre's touchZoom/doubleTapZoom defaults)
       * — this is the explicit-tap alternative both apps also offer
       * alongside gestures, not a replacement for them.
       */}
      {!pickingMapPointFor && (
        <View style={[styles.zoomControl, { backgroundColor: colors.card }]}>
          <Pressable
            style={[styles.zoomButton, currentZoom >= MAX_ZOOM && styles.zoomButtonDisabled]}
            onPress={handleZoomIn}
            disabled={currentZoom >= MAX_ZOOM}
            accessibilityRole="button"
            accessibilityLabel="Zoom in">
            <Text style={[styles.zoomButtonText, { color: colors.textPrimary }]}>＋</Text>
          </Pressable>
          <View style={[styles.zoomDivider, { backgroundColor: colors.divider }]} />
          <Pressable
            style={[styles.zoomButton, currentZoom <= MIN_ZOOM && styles.zoomButtonDisabled]}
            onPress={handleZoomOut}
            disabled={currentZoom <= MIN_ZOOM}
            accessibilityRole="button"
            accessibilityLabel="Zoom out">
            <Text style={[styles.zoomButtonText, { color: colors.textPrimary }]}>－</Text>
          </Pressable>
        </View>
      )}

      {!pickingMapPointFor && (
        <Pressable
          style={[styles.locateButton, { backgroundColor: colors.card }]}
          onPress={handleLocateMe}
          accessibilityRole="button"
          accessibilityLabel="Show my location">
          <Text style={styles.locateButtonText}>📍</Text>
        </Pressable>
      )}

      {/*
       * Basemap toggle: satellite imagery + roads/labels overlaid on top
       * ("hybrid", matching Kakao's 스카이뷰/Naver's satellite view) vs. our
       * normal vector map. See backend/martin-config.yaml's "satellite"
       * source and scripts/build_satellite_mosaic.sh for where the imagery
       * comes from.
       */}
      {!pickingMapPointFor && (
        <Pressable
          style={[styles.satelliteButton, { backgroundColor: colors.card }]}
          onPress={() => setShowSatellite(v => !v)}
          accessibilityRole="button"
          accessibilityLabel={showSatellite ? 'Switch to map view' : 'Switch to satellite view'}
          accessibilityState={{ selected: showSatellite }}>
          <Text style={styles.satelliteButtonText}>{showSatellite ? '🗺️' : '🛰️'}</Text>
        </Pressable>
      )}

      {/*
       * One "More" button replaces what used to be seven separate ones
       * here (weather/lists/offline/sharing/hazards/ferry/dive) — see
       * src/menu/MoreMenu.tsx's header comment for why. moreMenuActive
       * mirrors hazardsButtonActive/diveButtonActive's old highlight so
       * the button still shows *something* is toggled on even while
       * collapsed.
       */}
      {!pickingMapPointFor && (
        <Pressable
          style={[
            styles.moreButton,
            { backgroundColor: colors.card },
            (hazards.layerVisible || diveSites.active) && styles.moreButtonActive,
          ]}
          onPress={moreMenu.toggle}
          accessibilityRole="button"
          accessibilityLabel="More"
          accessibilityState={{ selected: hazards.layerVisible || diveSites.active }}>
          <Text style={styles.satelliteButtonText}>☰</Text>
        </Pressable>
      )}

      {hazards.layerVisible &&
        !hazards.reportVisible &&
        !routingActive &&
        !navigationActive &&
        !meetup.active &&
        !measure.active && (
          <View style={styles.reportHazardPillWrap} pointerEvents="box-none">
            <Pressable
              style={styles.reportHazardPill}
              onPress={hazards.openReport}
              accessibilityRole="button"
              accessibilityLabel="Report a road hazard">
              <Text style={styles.reportHazardPillLabel}>🚧 Report hazard</Text>
            </Pressable>
          </View>
        )}

      <MoreMenu visible={moreMenu.visible} onClose={moreMenu.close} items={moreMenuItems} />

      <ErrorLogPanel
        visible={errorLog.visible}
        onClose={errorLog.close}
        entries={errorLog.entries}
        onClear={errorLog.clear}
      />

      <WeatherWidget
        visible={weatherFeature.visible}
        onClose={weatherFeature.close}
        loading={weatherFeature.loading}
        weather={weatherFeature.weather}
        error={weatherFeature.error}
        onRefresh={weatherFeature.refresh}
        unit={weatherFeature.tempUnit}
        onToggleUnit={weatherFeature.toggleTempUnit}
      />

      <ListsManagerPanel
        visible={lists.managerVisible}
        onClose={lists.closeManager}
        favorites={favorites}
        localLists={lists.localLists}
        creating={lists.creating}
        onCreateList={lists.createList}
        onDeleteList={lists.deleteLocalList}
        viewCodeInput={lists.viewCodeInput}
        onChangeViewCodeInput={lists.setViewCodeInput}
        onViewCode={lists.viewListCode}
        viewingBusy={lists.viewingBusy}
        viewingError={lists.viewingError}
      />

      <ListViewSheet
        visible={lists.viewSheetVisible}
        list={lists.viewedList}
        onSelect={handleSelectListPlace}
        onClose={lists.closeViewSheet}
      />

      <OfflineMapsPanel
        visible={offlineMaps.visible}
        onClose={offlineMaps.close}
        label={offlineMaps.label}
        onChangeLabel={offlineMaps.setLabel}
        onDownloadCurrentArea={offlineMaps.downloadCurrentArea}
        downloading={offlineMaps.downloading}
        downloadStatus={offlineMaps.downloadStatus}
        downloadError={offlineMaps.downloadError}
        packs={offlineMaps.packs}
        onDeletePack={offlineMaps.deletePack}
      />

      <SharingPanel
        visible={sharing.panelVisible}
        onClose={sharing.close}
        myCode={sharing.myCode}
        sharingBusy={sharing.busy}
        sharingError={sharing.error}
        onStartSharing={sharing.startSharing}
        onStopSharing={sharing.stopSharing}
        viewedLabel={sharing.viewedPosition ? sharing.viewedPosition.label ?? 'Shared location' : null}
        viewingBusy={sharing.viewingBusy}
        viewingError={sharing.viewingError}
        onStartViewing={sharing.startViewing}
        onStopViewing={sharing.stopViewing}
      />

      <PlaceCard
        place={routingActive ? null : selectedPlace}
        travelPreview={travelPreview}
        isFavorite={isSelectedPlaceFavorite}
        onClose={() => setSelectedPlace(null)}
        onDirections={() => selectedPlace && startDirectionsTo(selectedPlace)}
        onToggleFavorite={handleToggleFavorite}
        onReportIssue={handleOpenCorrection}
      />

      <ReportCorrectionSheet
        visible={!!correctionTarget}
        placeName={correctionTarget?.name ?? ''}
        submitting={correctionSubmitting}
        error={correctionError}
        onClose={() => setCorrectionTarget(null)}
        onSubmit={handleSubmitCorrection}
      />

      <CategoryResultsSheet
        visible={!!activeCategory && !routingActive && !selectedPlace && !correctionTarget}
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
        onStartNavigation={handleStartNavigation}
        onSearchAlongRoute={alongRoute.open}
      />

      <AlongRouteSheet
        visible={alongRoute.visible}
        activeCategory={alongRoute.category}
        loading={alongRoute.loading}
        error={alongRoute.error}
        results={alongRoute.results}
        onSelectCategory={alongRoute.selectCategory}
        onSelectResult={handleSelectAlongRouteResult}
        onClose={alongRoute.close}
      />

      <ReportHazardSheet
        visible={hazards.reportVisible}
        onClose={hazards.closeReport}
        locationLabel={hazards.locationLabel}
        submitting={hazards.reportSubmitting}
        error={hazards.reportError}
        onSubmit={hazards.submitReport}
      />

      <HazardInfoCard
        hazard={hazards.selected}
        isMine={hazards.isSelectedMine}
        confirming={hazards.confirming}
        deleting={hazards.deleting}
        onClose={() => hazards.select(null)}
        onConfirm={hazards.confirmSelected}
        onDelete={hazards.deleteSelected}
      />

      <FerryPanel
        visible={ferries.visible}
        loading={ferries.loading}
        error={ferries.error}
        routes={ferries.routes}
        onClose={ferries.close}
      />

      <DiveSitesPanel
        visible={diveSites.active}
        loading={diveSites.loading}
        error={diveSites.error}
        sites={diveSites.sites}
        onClose={diveSites.close}
        onDirections={handleDiveSiteDirections}
      />

      <BorderCrossingInfoCard
        crossing={borderCrossings.selected}
        onClose={() => borderCrossings.select(null)}
        onDirections={handleBorderCrossingDirections}
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
  hazardPin: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#b3261e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hazardPinEmoji: {
    fontSize: 14,
  },
  ferryPin: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#2b6cb0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ferryPinEmoji: {
    fontSize: 13,
  },
  divePin: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#2f7d6c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  divePinEmoji: {
    fontSize: 13,
  },
  borderPin: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#8a6d3b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  borderPinEmoji: {
    fontSize: 13,
  },
  directionsButtonWrap: {
    position: 'absolute',
    top: 164,
    left: 12,
    right: 12,
    zIndex: 8,
    flexDirection: 'row',
    // Three buttons can run wider than smaller screens fit on one line —
    // wraps to a second row rather than silently overflowing off-screen
    // (flexDirection: 'row' alone doesn't wrap by default in RN).
    flexWrap: 'wrap',
  },
  directionsButton: {
    backgroundColor: '#3a3226',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
    marginRight: 10,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  meetupButton: {
    backgroundColor: '#3a3226',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
    marginRight: 10,
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
  meetupTopPickDot: {
    backgroundColor: '#d9a441',
    width: 18,
    height: 18,
    borderRadius: 9,
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
  // Replaces sharingButton/offlineButton/listsButton/weatherButton/
  // hazardsButton(Active)/ferryButton/diveButton(Active) — seven
  // right-edge buttons collapsed into the one that opens MoreMenu.
  moreButton: {
    position: 'absolute',
    bottom: 262,
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
  moreButtonActive: {
    backgroundColor: '#e3f0ec',
  },
  reportHazardPillWrap: {
    position: 'absolute',
    bottom: 24,
    left: 12,
    right: 12,
    alignItems: 'center',
  },
  reportHazardPill: {
    backgroundColor: '#b3261e',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 18,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  reportHazardPillLabel: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  sharedLocationDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#00b8d4',
    borderWidth: 3,
    borderColor: '#ffffff',
  },
  measureVertexDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#d9773f',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
});

export default App;
