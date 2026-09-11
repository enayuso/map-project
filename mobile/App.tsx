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
  type OfflinePackStatus,
  type PressEvent,
  type ViewStateChangeEvent,
} from '@maplibre/maplibre-react-native';
import basicStyle from './src/styles/basic.json';
import hybridStyle from './src/styles/hybrid.json';
import SearchBox from './src/search/SearchBox';
import { reverseGeocode, searchNearby, type SearchResult } from './src/search/api';
import { fetchRoute, type Costing, type RouteResult } from './src/routing/api';
import RoutePanel, { COSTING_LABELS, PEEK_HEIGHT as ROUTE_PANEL_PEEK_HEIGHT } from './src/routing/RoutePanel';
import DirectionsSearchPanel, {
  PANEL_HEIGHT as DIRECTIONS_PANEL_HEIGHT,
  PANEL_TOP as DIRECTIONS_PANEL_TOP,
} from './src/routing/DirectionsSearchPanel';
import MapPointPicker from './src/routing/MapPointPicker';
import NavigationBar from './src/routing/NavigationBar';
import { getRemainingTrip, getUpcomingManeuver, maneuverIcon, MANEUVER_ARRIVAL_THRESHOLD_KM } from './src/routing/navigation';
import { syncLiveActivity, endLiveActivity } from './src/routing/liveActivity';
import PlaceCard, { type TravelPreview } from './src/places/PlaceCard';
import AttributionFooter from './src/attribution/AttributionFooter';
import CategoryBar from './src/categories/CategoryBar';
import CategoryResultsSheet from './src/categories/CategoryResultsSheet';
import { categoryLabel, formatDistanceKm, haversineKm, type NearbyResult } from './src/categories/categories';
import MeetupPanel, { MAX_PARTICIPANTS, PARTICIPANT_COLORS } from './src/meetup/MeetupPanel';
import MeetupResultsSheet from './src/meetup/MeetupResultsSheet';
import { findMeetupCandidates, type MeetupCandidate } from './src/meetup/api';
import SharingPanel from './src/sharing/SharingPanel';
import { createShare, getSharedPosition, stopShare, updateShare, type SharedPosition } from './src/sharing/api';
import MeasureBar, { type MeasureMode } from './src/measure/MeasureBar';
import {
  formatAreaKm2,
  polygonAreaKm2,
  polylineLengthKm,
  toClosedRing,
  type LatLon as MeasureLatLon,
} from './src/measure/geometry';
import OfflineMapsPanel, { type PackListItem } from './src/offline/OfflineMapsPanel';
import { deleteOfflinePack, downloadArea, listOfflinePacks, type PackMetadata } from './src/offline/api';
import ListsManagerPanel from './src/lists/ListsManagerPanel';
import ListViewSheet from './src/lists/ListViewSheet';
import { createList, deleteList, getList, type ListPlace, type SharedList } from './src/lists/api';
import { addLocalList, getLocalLists, removeLocalList, type LocalList } from './src/lists/localLists';
import WeatherWidget from './src/weather/WeatherWidget';
import { fetchCurrentWeather, type CurrentWeather, type TempUnit } from './src/weather/api';
import { getTempUnitPreference, setTempUnitPreference } from './src/weather/tempUnitPreference';
import {
  addFavorite,
  addRecentSearch,
  getFavorites,
  getRecentSearches,
  removeFavorite,
} from './src/places/favorites';
import AlongRouteSheet from './src/routing/AlongRouteSheet';
import { searchAlongRoute, type AlongRouteResult } from './src/routing/searchAlongRoute';
import ReportHazardSheet from './src/hazards/ReportHazardSheet';
import HazardInfoCard from './src/hazards/HazardInfoCard';
import {
  confirmHazard,
  deleteHazard,
  listHazards,
  reportHazard,
  HAZARD_TYPE_EMOJI,
  type HazardReport,
  type HazardType,
} from './src/hazards/api';
import { addMyHazardReport, getMyHazardReports, removeMyHazardReport, type MyHazardReport } from './src/hazards/myReports';
import { indexSpotlightItems, subscribeToSpotlightSelection } from './src/spotlight/api';
import ReportCorrectionSheet from './src/poi-corrections/ReportCorrectionSheet';
import { submitPOICorrection, type CorrectionField } from './src/poi-corrections/api';
import FerryPanel from './src/ferries/FerryPanel';
import { fetchFerryRoutes, type FerryRoute } from './src/ferries/api';
import DiveSitesPanel from './src/dive-sites/DiveSitesPanel';
import { fetchDiveSites, type DiveSite } from './src/dive-sites/api';
import BorderCrossingInfoCard from './src/border-crossings/BorderCrossingInfoCard';
import { fetchBorderCrossings, type BorderCrossing } from './src/border-crossings/api';
import { updateWidgetData } from './src/widget/api';
import { weatherCodeInfo } from './src/weather/weatherCodes';
import MoreMenu, { type MoreMenuItem } from './src/menu/MoreMenu';
import ErrorLogPanel from './src/errors/ErrorLogPanel';
import { clearErrorLog, getErrorLog, logError, type LoggedError } from './src/errors/logger';
import { formatTemp } from './src/weather/api';

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

  // --- Border-crossing info cards (2026-09-11) ---
  // Per docs/research/12-ferry-dive-site-data-sourcing.md's same "curated,
  // not live" pattern as ferries/dive sites — only ever 2 of these
  // (fixed, real-world locations), so they're just always-visible map
  // markers rather than needing their own toggle button/panel; fetched
  // once on mount like favorites/recentSearches above.
  const [borderCrossings, setBorderCrossings] = useState<BorderCrossing[]>([]);
  const [selectedBorderCrossing, setSelectedBorderCrossing] = useState<BorderCrossing | null>(null);

  useEffect(() => {
    fetchBorderCrossings()
      .then(setBorderCrossings)
      .catch(() => setBorderCrossings([])); // silent — a missing info card isn't worth a user-facing error
  }, []);

  const handleBorderCrossingDirections = (crossing: BorderCrossing) => {
    setSelectedBorderCrossing(null);
    startDirectionsTo({
      id: `border-${crossing.id}`,
      name: crossing.name,
      subtitle: crossing.countries.join(' / '),
      lat: crossing.lat,
      lon: crossing.lon,
      kind: 'poi',
    });
  };

  const recordRecentSearch = (place: SearchResult) => {
    addRecentSearch(place).then(setRecentSearches);
  };

  // --- iOS Spotlight search integration ---
  // Per docs/research/10-remaining-feature-gaps.md — favorites/recents show
  // up in the system-wide Spotlight search (swipe down on the home
  // screen); tapping one jumps straight to that place, cold-launch or not.
  useEffect(() => {
    // A plain keyed object, not `Map` — this file already imports MapLibre's
    // own `Map` React component under that exact name, which shadows the
    // built-in JS Map class.
    const deduped: Record<string, SearchResult> = {};
    // Favorites first — a deliberately saved place is more worth surfacing
    // in Spotlight than something merely searched once.
    [...favorites, ...recentSearches].forEach(item => {
      deduped[item.id] = item;
    });
    indexSpotlightItems(Object.values(deduped));
  }, [favorites, recentSearches]);

  useEffect(() => {
    const unsubscribe = subscribeToSpotlightSelection(id => {
      const match = [...favorites, ...recentSearches].find(item => item.id === id);
      if (!match) return; // stale index entry (e.g. a favorite since removed) — nothing to jump to
      setSelectedPlace(match);
      recordRecentSearch(match);
      cameraRef.current?.flyTo({ center: [match.lon, match.lat], zoom: 16, duration: 1200 });
    });
    return unsubscribe;
  }, [favorites, recentSearches]);

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
  // A short code is the whole access model, no accounts — see that
  // README's own reasoning. Two independent halves: sharing my own
  // position (push, on an interval) and viewing someone else's (poll, on
  // a separate interval) — a device can do either, both, or neither.
  const [sharingPanelVisible, setSharingPanelVisible] = useState(false);
  const [mySharingCode, setMySharingCode] = useState<string | null>(null);
  const [sharingBusy, setSharingBusy] = useState(false);
  const [sharingError, setSharingError] = useState<string | null>(null);
  const [viewingCode, setViewingCode] = useState<string | null>(null);
  const [viewedPosition, setViewedPosition] = useState<SharedPosition | null>(null);
  const [viewingBusy, setViewingBusy] = useState(false);
  const [viewingError, setViewingError] = useState<string | null>(null);

  // A ref, not a direct effect dependency — currentPosition updates far
  // more often than the 15s push interval below should actually fire, and
  // depending on it directly would reset the interval's own timer on every
  // GPS tick, which could starve it from ever firing at all if fixes
  // arrive faster than 15s apart. The interval reads the *latest* position
  // each time it ticks; only mySharingCode itself (start/stop) should
  // recreate the interval.
  const currentPositionRef = useRef(currentPosition);
  useEffect(() => {
    currentPositionRef.current = currentPosition;
  }, [currentPosition]);

  useEffect(() => {
    if (!mySharingCode) return;
    const interval = setInterval(() => {
      const pos = currentPositionRef.current;
      if (!pos) return;
      updateShare(mySharingCode, pos.coords.latitude, pos.coords.longitude).catch(() => {
        // The share expired/was removed server-side unexpectedly — stop
        // pretending to still be sharing rather than retry forever.
        setMySharingCode(null);
      });
    }, 15000);
    return () => clearInterval(interval);
  }, [mySharingCode]);

  useEffect(() => {
    if (!viewingCode) return;
    const poll = () => {
      getSharedPosition(viewingCode)
        .then(pos => {
          setViewedPosition(pos);
          setViewingError(null);
        })
        .catch(e => {
          setViewedPosition(null);
          setViewingError(e.message);
        });
    };
    poll(); // fetch immediately, don't make the viewer wait out the first interval
    const interval = setInterval(poll, 10000);
    return () => clearInterval(interval);
  }, [viewingCode]);

  const handleStartSharing = async () => {
    if (!locationEnabled) setLocationEnabled(true);
    if (!currentPosition) {
      setSharingError('Waiting for a GPS fix — try again in a moment.');
      return;
    }
    setSharingBusy(true);
    setSharingError(null);
    try {
      const { code } = await createShare(currentPosition.coords.latitude, currentPosition.coords.longitude);
      setMySharingCode(code);
    } catch (e) {
      logError('sharing:start', e);
      setSharingError('Could not start sharing — try again.');
    } finally {
      setSharingBusy(false);
    }
  };

  const handleStopSharing = () => {
    if (mySharingCode) stopShare(mySharingCode).catch(() => {}); // best-effort — it'll expire on its own regardless
    setMySharingCode(null);
  };

  const handleStartViewing = async (rawCode: string) => {
    const code = rawCode.trim().toUpperCase();
    if (!code) return;
    setViewingBusy(true);
    setViewingError(null);
    try {
      const pos = await getSharedPosition(code);
      setViewedPosition(pos);
      setViewingCode(code);
    } catch (e) {
      logError('sharing:view', e);
      setViewingError(e instanceof Error ? e.message : 'Could not find that share.');
    } finally {
      setViewingBusy(false);
    }
  };

  const handleStopViewing = () => {
    setViewingCode(null);
    setViewedPosition(null);
    setViewingError(null);
  };

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

    if (hazardsVisible) {
      // Same debounce idea as the map-pick lookup below — coalesces a
      // flurry of small pans into one bbox refresh instead of one per frame.
      if (hazardsDebounceRef.current) clearTimeout(hazardsDebounceRef.current);
      hazardsDebounceRef.current = setTimeout(refreshHazards, 400);
    }

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
  const [alongRouteVisible, setAlongRouteVisible] = useState(false);
  const [alongRouteCategory, setAlongRouteCategory] = useState<string | null>(null);
  const [alongRouteLoading, setAlongRouteLoading] = useState(false);
  const [alongRouteError, setAlongRouteError] = useState<string | null>(null);
  const [alongRouteResults, setAlongRouteResults] = useState<AlongRouteResult[]>([]);

  const handleOpenAlongRoute = () => {
    setAlongRouteVisible(true);
  };

  const handleSelectAlongRouteCategory = async (key: string) => {
    if (!route) return;
    setAlongRouteCategory(key);
    setAlongRouteLoading(true);
    setAlongRouteError(null);
    try {
      const results = await searchAlongRoute(route.geometry.coordinates as [number, number][], key);
      setAlongRouteResults(results);
      if (results.length === 0) setAlongRouteError(null); // empty state has its own message, not an error
    } catch (e) {
      logError('alongRoute:search', e, { category: key });
      setAlongRouteResults([]);
      setAlongRouteError('Could not search along this route.');
    } finally {
      setAlongRouteLoading(false);
    }
  };

  const closeAlongRoute = () => {
    setAlongRouteVisible(false);
    setAlongRouteCategory(null);
    setAlongRouteResults([]);
    setAlongRouteError(null);
  };

  const handleSelectAlongRouteResult = (result: AlongRouteResult) => {
    // Replaces the destination and lets the existing route-fetch effect
    // reroute — this app doesn't support multi-stop routes, so "search
    // along the way, then reroute to stop there" is the natural fit rather
    // than inserting a waypoint into the existing leg.
    closeAlongRoute();
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
  // Per docs/research/09-kakao-naver-feature-audit.md, neither Kakao Map
  // nor Naver Map actually has this natively (both punt to third-party
  // apps built on their APIs) — see src/meetup/api.ts's own header comment
  // for the actual fairness logic (minimax on real Valhalla travel times,
  // not a straight-line geometric midpoint).
  const [meetupActive, setMeetupActive] = useState(false);
  const [participants, setParticipants] = useState<(SearchResult | null)[]>([null, null]);
  const [activeParticipantIndex, setActiveParticipantIndex] = useState(0);
  const [meetupCandidates, setMeetupCandidates] = useState<MeetupCandidate[]>([]);
  const [meetupResultsVisible, setMeetupResultsVisible] = useState(false);
  const [meetupLoading, setMeetupLoading] = useState(false);
  const [meetupError, setMeetupError] = useState<string | null>(null);

  const resetMeetup = () => {
    setMeetupActive(false);
    setParticipants([null, null]);
    setMeetupCandidates([]);
    setMeetupResultsVisible(false);
    setMeetupError(null);
  };

  const toggleMeetup = () => {
    if (meetupActive) {
      resetMeetup();
    } else {
      setMeetupActive(true);
      closeCategoryBrowsing();
      if (routingActive) toggleRouting(); // mutually exclusive top-level modes
      if (measureActive) toggleMeasure();
      setSelectedPlace(null); // a stale card from earlier browsing shouldn't linger over this
      setActiveParticipantIndex(0);
    }
  };

  const handleSelectParticipant = (index: number, result: SearchResult) => {
    setParticipants(prev => prev.map((p, i) => (i === index ? result : p)));
    recordRecentSearch(result);
    // Advance to the next empty slot, same "keep moving forward" feel as
    // the directions fields' auto-advance.
    const nextEmpty = participants.findIndex((p, i) => i !== index && !p);
    if (nextEmpty !== -1) setActiveParticipantIndex(nextEmpty);
  };

  const handleClearParticipant = (index: number) => {
    setParticipants(prev => prev.map((p, i) => (i === index ? null : p)));
    setActiveParticipantIndex(index);
  };

  const handleUseCurrentLocationForParticipant = (index: number) => {
    if (!locationEnabled) setLocationEnabled(true);
    if (!currentPosition) return;
    handleSelectParticipant(index, {
      id: `current-location-${index}`,
      name: 'My location',
      subtitle: 'Current position',
      lat: currentPosition.coords.latitude,
      lon: currentPosition.coords.longitude,
      kind: 'poi',
    });
  };

  const handleAddParticipant = () => {
    setParticipants(prev => (prev.length < MAX_PARTICIPANTS ? [...prev, null] : prev));
    setActiveParticipantIndex(participants.length);
  };

  const handleRemoveParticipant = (index: number) => {
    setParticipants(prev => prev.filter((_, i) => i !== index));
  };

  const handleFindMeetupPoint = async () => {
    const filled = participants.filter((p): p is SearchResult => !!p);
    if (filled.length < 2) return;
    setMeetupLoading(true);
    setMeetupError(null);
    setMeetupResultsVisible(true);
    try {
      const candidates = await findMeetupCandidates(filled, 'auto');
      setMeetupCandidates(candidates);
      if (candidates.length === 0) setMeetupError('Nothing reachable by everyone nearby.');
    } catch (e) {
      logError('meetup:compare', e, { participantCount: filled.length });
      setMeetupCandidates([]);
      setMeetupError('Could not compare travel times — check that everyone has a valid location.');
    } finally {
      setMeetupLoading(false);
    }
  };

  const handleSelectMeetupCandidate = (candidate: MeetupCandidate) => {
    // Picking a result ends meetup mode — the natural next step is the
    // place's own card (Directions from here, etc.), not more comparing.
    resetMeetup();
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
  const [measureActive, setMeasureActive] = useState(false);
  const [measureMode, setMeasureMode] = useState<MeasureMode>('distance');
  const [measurePoints, setMeasurePoints] = useState<MeasureLatLon[]>([]);

  const toggleMeasure = () => {
    if (measureActive) {
      setMeasureActive(false);
      setMeasurePoints([]);
    } else {
      setMeasureActive(true);
      closeCategoryBrowsing();
      if (routingActive) toggleRouting(); // mutually exclusive top-level modes
      if (meetupActive) toggleMeetup();
      setMeasureMode('distance');
      setMeasurePoints([]);
    }
  };

  const handleChangeMeasureMode = (mode: MeasureMode) => {
    setMeasureMode(mode);
    setMeasurePoints([]); // a path doesn't carry over meaningfully between the two modes
  };

  const measureTotalLabel =
    measureMode === 'distance'
      ? formatDistanceKm(polylineLengthKm(measurePoints))
      : formatAreaKm2(polygonAreaKm2(measurePoints));

  // --- Offline maps (Phase 5) ---
  // See src/offline/api.ts's header comment for why this is just a thin
  // download-management UI over MapLibre Native's own built-in offline
  // pack system, not custom online/offline-switching logic — once a pack
  // covers the current view, the native SDK serves from it automatically
  // whenever a live tile request fails.
  const [offlinePanelVisible, setOfflinePanelVisible] = useState(false);
  const [offlineLabel, setOfflineLabel] = useState('');
  const [offlineDownloading, setOfflineDownloading] = useState(false);
  const [offlineDownloadStatus, setOfflineDownloadStatus] = useState<OfflinePackStatus | null>(null);
  const [offlineDownloadError, setOfflineDownloadError] = useState<string | null>(null);
  const [offlinePacks, setOfflinePacks] = useState<PackListItem[]>([]);

  const refreshOfflinePacks = async () => {
    const packs = await listOfflinePacks();
    const items = await Promise.all(
      packs.map(async p => {
        const status = await p.status();
        return {
          id: p.id,
          metadata: p.metadata as PackMetadata,
          sizeBytes: status.completedResourceSize,
        };
      }),
    );
    setOfflinePacks(items);
  };

  useEffect(() => {
    if (offlinePanelVisible) refreshOfflinePacks();
  }, [offlinePanelVisible]);

  const handleDownloadCurrentArea = async () => {
    const bounds = await mapRef.current?.getBounds();
    if (!bounds) {
      setOfflineDownloadError('Could not read the current map view — try again.');
      return;
    }
    const zoom = (await mapRef.current?.getZoom()) ?? INITIAL_ZOOM;
    // A little wider than the exact current zoom, so a modest zoom-out
    // still has something to show offline, not just the one exact level.
    const minZoom = Math.max(MIN_ZOOM, Math.floor(zoom) - 2);

    setOfflineDownloading(true);
    setOfflineDownloadError(null);
    setOfflineDownloadStatus(null);
    try {
      await downloadArea(
        bounds,
        minZoom,
        showSatellite ? 'hybrid' : 'basic',
        offlineLabel.trim(),
        status => {
          setOfflineDownloadStatus(status);
          if (status.state === 'complete') {
            setOfflineDownloading(false);
            setOfflineLabel('');
            refreshOfflinePacks();
          }
        },
        message => {
          setOfflineDownloadError(message);
          setOfflineDownloading(false);
        },
      );
    } catch (e) {
      logError('offline:download', e);
      setOfflineDownloadError(e instanceof Error ? e.message : 'Could not start download.');
      setOfflineDownloading(false);
    }
  };

  const handleDeleteOfflinePack = async (id: string) => {
    await deleteOfflinePack(id);
    refreshOfflinePacks();
  };

  // --- Shareable saved-place lists (Naver's Dec 2022 favorites-folder upgrade) ---
  // Additive on top of the existing flat favorites (favorites.ts) — a list
  // is a named, shareable subset of your favorites, not a replacement for
  // the ★ flow. Same short-code backend as location sharing (sharing/),
  // different resource (src/lists/api.ts).
  const [listsManagerVisible, setListsManagerVisible] = useState(false);
  const [localLists, setLocalLists] = useState<LocalList[]>([]);
  const [listCreating, setListCreating] = useState(false);
  const [listViewCodeInput, setListViewCodeInput] = useState('');
  const [listViewingBusy, setListViewingBusy] = useState(false);
  const [listViewingError, setListViewingError] = useState<string | null>(null);
  const [viewedList, setViewedList] = useState<SharedList | null>(null);
  const [listViewSheetVisible, setListViewSheetVisible] = useState(false);

  useEffect(() => {
    getLocalLists().then(setLocalLists);
  }, []);

  const handleCreateList = async (label: string, placeIds: string[]) => {
    const places: ListPlace[] = favorites
      .filter(f => placeIds.includes(f.id))
      .map(f => ({ id: f.id, name: f.name, subtitle: f.subtitle, lat: f.lat, lon: f.lon }));
    setListCreating(true);
    try {
      const { code } = await createList(label, places);
      const updated = await addLocalList({ code, label, placeIds });
      setLocalLists(updated);
    } catch (e) {
      logError('lists:create', e);
      Alert.alert('Could not create the list', 'Please try again.');
    } finally {
      setListCreating(false);
    }
  };

  const handleDeleteLocalList = async (code: string) => {
    deleteList(code).catch(() => {}); // best-effort — a local-only removal still un-shares it from this device's point of view even if the network call fails
    const updated = await removeLocalList(code);
    setLocalLists(updated);
  };

  const handleViewListCode = async () => {
    setListViewingBusy(true);
    setListViewingError(null);
    try {
      const list = await getList(listViewCodeInput);
      setViewedList(list);
      setListViewSheetVisible(true);
      setListsManagerVisible(false);
    } catch (e) {
      logError('lists:view', e);
      setListViewingError(e instanceof Error ? e.message : 'Could not find that list.');
    } finally {
      setListViewingBusy(false);
    }
  };

  const handleSelectListPlace = (place: ListPlace) => {
    setListViewSheetVisible(false);
    setSelectedPlace({ ...place, kind: 'poi' });
    cameraRef.current?.flyTo({ center: [place.lon, place.lat], zoom: 16, duration: 1200 });
  };

  // --- Weather (low-effort polish, not a functional gap — see
  // docs/research/09-kakao-naver-feature-audit.md) ---
  const [weatherVisible, setWeatherVisible] = useState(false);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weather, setWeather] = useState<CurrentWeather | null>(null);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [tempUnit, setTempUnit] = useState<TempUnit>('C');

  useEffect(() => {
    getTempUnitPreference().then(setTempUnit);
  }, []);

  const handleToggleTempUnit = () => {
    const next: TempUnit = tempUnit === 'C' ? 'F' : 'C';
    setTempUnit(next);
    setTempUnitPreference(next);
  };

  const handleRefreshWeather = async () => {
    setWeatherLoading(true);
    setWeatherError(null);
    try {
      const center = await mapRef.current?.getCenter();
      if (!center) throw new Error('no map center');
      const [lon, lat] = center;
      setWeather(await fetchCurrentWeather(lat, lon));
    } catch (e) {
      logError('weather:refresh', e);
      setWeather(null);
      setWeatherError('Could not check the weather — try again.');
    } finally {
      setWeatherLoading(false);
    }
  };

  // --- iOS home screen widget (2026-09-11) ---
  // One-way mirror into a shared App Group store — see src/widget/api.ts's
  // header comment. Pushes a fresh copy whenever weather/tempUnit/
  // favorites change, same "just keep it in sync" approach as the
  // Spotlight indexing effect above.
  useEffect(() => {
    const info = weather ? weatherCodeInfo(weather.weatherCode) : null;
    updateWidgetData({
      weatherEmoji: info?.emoji,
      weatherLabel: info?.label,
      tempDisplay: weather ? formatTemp(weather.tempC, tempUnit) : undefined,
      favorites: favorites.slice(0, 3).map(f => ({ name: f.name, subtitle: f.subtitle })),
    });
  }, [weather, tempUnit, favorites]);

  // --- Crowdsourced road hazard reporting (Waze's core idea) ---
  // Per docs/research/10-remaining-feature-gaps.md — genuinely undocumented
  // gap for Belize's flooding/washouts/checkpoints. hazardsVisible is a map
  // *layer* (like measure's points), not a modal panel — it doesn't consume
  // taps or need to be mutually exclusive with anything, so it can just
  // stay on. hazardReportVisible (the actual report form) IS one of the
  // dismissable utility overlays below.
  const [hazardsVisible, setHazardsVisible] = useState(false);
  const [hazards, setHazards] = useState<HazardReport[]>([]);
  const [hazardReportVisible, setHazardReportVisible] = useState(false);
  const [hazardReportSubmitting, setHazardReportSubmitting] = useState(false);
  const [hazardReportError, setHazardReportError] = useState<string | null>(null);
  const [selectedHazard, setSelectedHazard] = useState<HazardReport | null>(null);
  const [hazardConfirming, setHazardConfirming] = useState(false);
  const [hazardDeleting, setHazardDeleting] = useState(false);
  const [myHazardReports, setMyHazardReports] = useState<MyHazardReport[]>([]);
  const hazardsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getMyHazardReports().then(setMyHazardReports);
  }, []);

  const refreshHazards = async () => {
    const bounds = await mapRef.current?.getBounds(); // [west, south, east, north]
    if (!bounds) return;
    const [west, south, east, north] = bounds;
    try {
      setHazards(await listHazards({ minLat: south, maxLat: north, minLon: west, maxLon: east }));
    } catch (e) {
      // Still not worth a user-facing error for a background layer refresh
      // — a failed refresh just leaves the previous set showing — but now
      // logged so a string of these isn't invisible (see src/errors/logger.ts).
      logError('hazards:refresh', e);
    }
  };

  const toggleHazardsLayer = () => {
    if (hazardsVisible) {
      setHazardsVisible(false);
      setHazards([]);
    } else {
      setHazardsVisible(true);
      refreshHazards();
    }
  };

  const openHazardReport = () => {
    closeUtilityPanels();
    setHazardReportVisible(true);
    setHazardReportError(null);
  };

  const handleSubmitHazardReport = async (type: HazardType, note: string) => {
    let point: { lat: number; lon: number } | null = null;
    if (currentPosition) {
      point = { lat: currentPosition.coords.latitude, lon: currentPosition.coords.longitude };
    } else {
      const center = await mapRef.current?.getCenter();
      if (center) point = { lat: center[1], lon: center[0] };
    }
    if (!point) {
      setHazardReportError('Could not determine a location.');
      return;
    }
    setHazardReportSubmitting(true);
    setHazardReportError(null);
    try {
      const res = await reportHazard(type, point.lat, point.lon, note || undefined);
      await addMyHazardReport({ id: res.id, deleteToken: res.deleteToken });
      setMyHazardReports(prev => [{ id: res.id, deleteToken: res.deleteToken }, ...prev]);
      setHazardReportVisible(false);
      if (!hazardsVisible) setHazardsVisible(true);
      refreshHazards();
    } catch (e) {
      logError('hazards:report', e, { type });
      setHazardReportError('Could not submit report — try again.');
    } finally {
      setHazardReportSubmitting(false);
    }
  };

  const handleConfirmHazard = async () => {
    if (!selectedHazard) return;
    setHazardConfirming(true);
    try {
      await confirmHazard(selectedHazard.id);
      setSelectedHazard(null);
      refreshHazards();
    } catch (e) {
      // Still leave the card open on failure — the user can just try
      // again — but now logged (see src/errors/logger.ts).
      logError('hazards:confirm', e);
    } finally {
      setHazardConfirming(false);
    }
  };

  const handleDeleteHazard = async () => {
    if (!selectedHazard) return;
    const mine = myHazardReports.find(r => r.id === selectedHazard.id);
    if (!mine) return;
    setHazardDeleting(true);
    try {
      await deleteHazard(selectedHazard.id, mine.deleteToken);
      await removeMyHazardReport(selectedHazard.id);
      setMyHazardReports(prev => prev.filter(r => r.id !== selectedHazard.id));
      setSelectedHazard(null);
      refreshHazards();
    } catch (e) {
      // Still leave the card open on failure — the user can just try
      // again — but now logged (see src/errors/logger.ts).
      logError('hazards:delete', e);
    } finally {
      setHazardDeleting(false);
    }
  };

  // These four are quick, dismissable utility overlays (unlike Directions/
  // Meet Up/Measure's full "modes") — sharing this one helper keeps them
  // from ever rendering on top of each other or the plain search box,
  // which they'd otherwise do since each has its own independent button.
  const closeUtilityPanels = () => {
    setHazardReportVisible(false);
    setSharingPanelVisible(false);
    setOfflinePanelVisible(false);
    setListsManagerVisible(false);
    setWeatherVisible(false);
    setFerryPanelVisible(false);
    setDiveSitesActive(false);
    setMoreMenuVisible(false);
    setErrorLogVisible(false);
  };

  // --- "More" menu (2026-09-11) ---
  // Consolidates what used to be seven separate floating buttons (weather,
  // saved lists, offline maps, live-location sharing, road hazards, ferry
  // schedules, dive sites) into one — see src/menu/MoreMenu.tsx's header
  // comment for why (real Kakao/Naver screenshots both keep the map's
  // right edge to 3-4 buttons, never seven-plus). Each row below just
  // calls the same toggle*() function its old standalone button used to.
  const [moreMenuVisible, setMoreMenuVisible] = useState(false);

  const toggleMoreMenu = () => {
    if (moreMenuVisible) {
      setMoreMenuVisible(false);
    } else {
      closeUtilityPanels();
      setMoreMenuVisible(true);
    }
  };

  // --- Error log (2026-09-11) ---
  // Reached from the More menu — see src/errors/logger.ts's header comment
  // for why this exists (the engineering-audit finding that the app had
  // zero error visibility once shipped). Loads fresh from storage each
  // time it opens rather than keeping a live-updating subscription — this
  // is a debug tool opened rarely, not something that needs to reflect an
  // error logged one second after opening it.
  const [errorLogVisible, setErrorLogVisible] = useState(false);
  const [errorLogEntries, setErrorLogEntries] = useState<LoggedError[]>([]);

  const toggleErrorLog = () => {
    if (errorLogVisible) {
      setErrorLogVisible(false);
    } else {
      closeUtilityPanels();
      setErrorLogVisible(true);
      getErrorLog().then(setErrorLogEntries);
    }
  };

  const handleClearErrorLog = () => {
    clearErrorLog();
    setErrorLogEntries([]);
  };

  // --- Ferry/water-taxi schedules (2026-09-11) ---
  // Per docs/research/12-ferry-dive-site-data-sourcing.md: no API/feed
  // exists anywhere for this — sharing/data/ferry_routes.json is curated,
  // hand-maintained content, fetched once per app session and cached in
  // state rather than re-fetched on every open (it changes on a
  // months-long cadence, not per-use).
  const [ferryPanelVisible, setFerryPanelVisible] = useState(false);
  const [ferryRoutes, setFerryRoutes] = useState<FerryRoute[]>([]);
  const [ferryLoading, setFerryLoading] = useState(false);
  const [ferryError, setFerryError] = useState<string | null>(null);

  const toggleFerryPanel = () => {
    if (ferryPanelVisible) {
      setFerryPanelVisible(false);
      return;
    }
    closeUtilityPanels();
    setFerryPanelVisible(true);
    if (ferryRoutes.length === 0) {
      setFerryLoading(true);
      setFerryError(null);
      fetchFerryRoutes()
        .then(setFerryRoutes)
        .catch(() => setFerryError('Could not load ferry routes.'))
        .finally(() => setFerryLoading(false));
    }
  };

  // --- Dive sites (2026-09-11) ---
  // Same "no structured source exists, this is curated" situation as
  // ferries above — see the same research doc. One toggle controls both
  // the map markers and the list sheet together (unlike hazards, there's
  // no independent live layer here worth keeping open past the panel).
  const [diveSitesActive, setDiveSitesActive] = useState(false);
  const [diveSites, setDiveSites] = useState<DiveSite[]>([]);
  const [diveSitesLoading, setDiveSitesLoading] = useState(false);
  const [diveSitesError, setDiveSitesError] = useState<string | null>(null);

  const toggleDiveSites = () => {
    if (diveSitesActive) {
      setDiveSitesActive(false);
      return;
    }
    closeUtilityPanels();
    setDiveSitesActive(true);
    if (diveSites.length === 0) {
      setDiveSitesLoading(true);
      setDiveSitesError(null);
      fetchDiveSites()
        .then(setDiveSites)
        .catch(() => setDiveSitesError('Could not load dive sites.'))
        .finally(() => setDiveSitesLoading(false));
    }
  };

  const handleDiveSiteDirections = (site: DiveSite) => {
    setDiveSitesActive(false);
    startDirectionsTo({
      id: `dive-${site.id}`,
      name: site.name,
      subtitle: site.reserve,
      lat: site.lat,
      lon: site.lon,
      kind: 'poi',
    });
  };

  const toggleSharingPanel = () => {
    if (sharingPanelVisible) {
      setSharingPanelVisible(false);
    } else {
      closeUtilityPanels();
      setSharingPanelVisible(true);
    }
  };

  const toggleOfflinePanel = () => {
    if (offlinePanelVisible) {
      setOfflinePanelVisible(false);
    } else {
      closeUtilityPanels();
      setOfflinePanelVisible(true);
    }
  };

  const toggleListsManager = () => {
    if (listsManagerVisible) {
      setListsManagerVisible(false);
    } else {
      closeUtilityPanels();
      setListsManagerVisible(true);
    }
  };

  const toggleWeather = () => {
    if (weatherVisible) {
      setWeatherVisible(false);
    } else {
      closeUtilityPanels();
      setWeatherVisible(true);
      handleRefreshWeather();
    }
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

    if (measureActive) {
      const [lon, lat] = event.nativeEvent.lngLat;
      setMeasurePoints(prev => [...prev, { lat, lon }]);
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

    if (meetupActive) {
      const [lon, lat] = event.nativeEvent.lngLat;
      handleSelectParticipant(activeParticipantIndex, {
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
      if (meetupActive) toggleMeetup(); // mutually exclusive top-level modes
      if (measureActive) toggleMeasure();
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
    closeAlongRoute();
  };

  const showRoutePanel =
    routingActive && !navigationActive && !pickingMapPointFor && (routeLoading || !!route || !!routeError);
  const remainingTrip = route ? getRemainingTrip(route, currentManeuverIndex) : null;

  // --- Live Activity / Dynamic Island (iOS only) ---
  // Mirrors whatever this live-navigation state already is — see
  // src/routing/liveActivity.ts's header comment. Ends whenever navigation
  // stops, whether by arrival or the user tapping "End".
  useEffect(() => {
    if (!navigationActive) return;
    if (navigationArrived) {
      syncLiveActivity(COSTING_LABELS[costing], {
        nextInstruction: "You've arrived",
        distanceToManeuverKm: 0,
        etaMinutes: 0,
        maneuverEmoji: '🏁',
      });
      return;
    }
    if (!upcomingManeuver || !remainingTrip) return;
    syncLiveActivity(COSTING_LABELS[costing], {
      nextInstruction: upcomingManeuver.maneuver.instruction,
      distanceToManeuverKm: upcomingManeuver.distanceToManeuverKm,
      etaMinutes: Math.round(remainingTrip.durationMin),
      maneuverEmoji: maneuverIcon(upcomingManeuver.maneuver.type),
    });
  }, [navigationActive, navigationArrived, upcomingManeuver, remainingTrip, costing]);

  useEffect(() => {
    if (!navigationActive) endLiveActivity();
  }, [navigationActive]);

  // Quick, dismissable utility overlays (sharing/offline/lists/weather) —
  // unlike Directions/Meet Up/Measure's full "modes," each has its own
  // independent button, so without this they could otherwise render on
  // top of the plain search box or each other (closeUtilityPanels above
  // keeps at most one of these four open at a time; this keeps the
  // *other* top-of-screen UI out of their way too).
  const anyUtilityPanelOpen =
    sharingPanelVisible ||
    offlinePanelVisible ||
    listsManagerVisible ||
    weatherVisible ||
    hazardReportVisible ||
    ferryPanelVisible ||
    diveSitesActive ||
    moreMenuVisible ||
    errorLogVisible;

  const moreMenuItems: MoreMenuItem[] = [
    { key: 'weather', icon: '🌤️', label: 'Weather', onPress: toggleWeather },
    { key: 'lists', icon: '📋', label: 'Saved lists', onPress: toggleListsManager },
    { key: 'offline', icon: '⬇️', label: 'Offline maps', onPress: toggleOfflinePanel },
    { key: 'sharing', icon: '📡', label: 'Share my location', onPress: toggleSharingPanel },
    {
      key: 'hazards',
      icon: '⚠️',
      label: 'Road hazards',
      onPress: toggleHazardsLayer,
      active: hazardsVisible,
    },
    { key: 'ferry', icon: '⛴️', label: 'Ferry schedules', onPress: toggleFerryPanel },
    {
      key: 'dive',
      icon: '🤿',
      label: 'Dive sites',
      onPress: toggleDiveSites,
      active: diveSitesActive,
    },
    { key: 'errorLog', icon: '🐞', label: 'Error log', onPress: toggleErrorLog },
  ];

  return (
    <View style={styles.container}>
      <Map
        ref={mapRef}
        style={styles.map}
        mapStyle={(showSatellite ? hybridStyle : basicStyle) as any}
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

        {viewedPosition && (
          <Marker lngLat={[viewedPosition.lon, viewedPosition.lat]}>
            <View style={styles.sharedLocationDot} />
          </Marker>
        )}

        {meetupActive &&
          participants.map(
            (p, i) =>
              p && (
                <Marker key={i} lngLat={[p.lon, p.lat]}>
                  <View style={[styles.pin, { backgroundColor: PARTICIPANT_COLORS[i] }]} />
                </Marker>
              ),
          )}
        {meetupResultsVisible &&
          meetupCandidates.map((c, i) => (
            <Marker
              key={c.place.id}
              lngLat={[c.place.lon, c.place.lat]}
              onPress={() => handleSelectMeetupCandidate(c)}>
              <View style={[styles.categoryDot, i === 0 && styles.meetupTopPickDot]} />
            </Marker>
          ))}

        {measureActive && measureMode === 'distance' && measurePoints.length > 1 && (
          <GeoJSONSource
            id="measure-line"
            data={{ type: 'LineString', coordinates: measurePoints.map(p => [p.lon, p.lat]) }}>
            <Layer
              id="measure-line-layer"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': '#d9773f', 'line-width': 4, 'line-dasharray': [2, 1.5] }}
            />
          </GeoJSONSource>
        )}

        {measureActive && measureMode === 'area' && measurePoints.length > 2 && (
          <GeoJSONSource
            id="measure-polygon"
            data={{ type: 'Polygon', coordinates: [toClosedRing(measurePoints)] }}>
            <Layer id="measure-polygon-fill" type="fill" paint={{ 'fill-color': '#d9773f', 'fill-opacity': 0.25 }} />
            <Layer id="measure-polygon-outline" type="line" paint={{ 'line-color': '#d9773f', 'line-width': 3 }} />
          </GeoJSONSource>
        )}

        {measureActive &&
          measurePoints.map((p, i) => (
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

        {hazardsVisible &&
          hazards.map(h => (
            <Marker key={h.id} lngLat={[h.lon, h.lat]} onPress={() => setSelectedHazard(h)}>
              <View style={styles.hazardPin}>
                <Text style={styles.hazardPinEmoji}>{HAZARD_TYPE_EMOJI[h.type]}</Text>
              </View>
            </Marker>
          ))}

        {ferryPanelVisible &&
          // Dedupe by name — the same stop (e.g. "San Pedro") appears
          // across several routes, and each should only get one pin. Not
          // `new Map(...)` — this file imports MapLibre's own `Map`
          // component under that exact name, which shadows the built-in
          // JS Map class (see src/hazards wiring for the same gotcha).
          ferryRoutes
            .flatMap(r => r.stops)
            .filter((stop, i, all) => all.findIndex(s => s.name === stop.name) === i)
            .map(stop => (
              <Marker key={stop.name} lngLat={[stop.lon, stop.lat]}>
                <View style={styles.ferryPin}>
                  <Text style={styles.ferryPinEmoji}>⛴️</Text>
                </View>
              </Marker>
            ))}

        {diveSitesActive &&
          diveSites.map(site => (
            <Marker key={site.id} lngLat={[site.lon, site.lat]} onPress={() => handleDiveSiteDirections(site)}>
              <View style={styles.divePin}>
                <Text style={styles.divePinEmoji}>🤿</Text>
              </View>
            </Marker>
          ))}

        {borderCrossings.map(crossing => (
          <Marker
            key={crossing.id}
            lngLat={[crossing.lon, crossing.lat]}
            onPress={() => setSelectedBorderCrossing(crossing)}>
            <View style={styles.borderPin}>
              <Text style={styles.borderPinEmoji}>🛂</Text>
            </View>
          </Marker>
        ))}
      </Map>

      <AttributionFooter showSatelliteCredit={showSatellite} />

      {!routingActive && !navigationActive && !meetupActive && !measureActive && !anyUtilityPanelOpen && (
        <SearchBox onSelect={handleSelect} recentSearches={recentSearches} favorites={favorites} />
      )}

      {meetupActive && (
        <MeetupPanel
          participants={participants}
          activeIndex={activeParticipantIndex}
          onFocusParticipant={setActiveParticipantIndex}
          onSelectParticipant={handleSelectParticipant}
          onClearParticipant={handleClearParticipant}
          onUseCurrentLocation={handleUseCurrentLocationForParticipant}
          onAddParticipant={handleAddParticipant}
          onRemoveParticipant={handleRemoveParticipant}
          onFindMeetupPoint={handleFindMeetupPoint}
          finding={meetupLoading}
          onClose={toggleMeetup}
          recentSearches={recentSearches}
          favorites={favorites}
        />
      )}

      <MeetupResultsSheet
        visible={meetupResultsVisible}
        loading={meetupLoading}
        error={meetupError}
        candidates={meetupCandidates}
        onSelect={handleSelectMeetupCandidate}
        onClose={() => setMeetupResultsVisible(false)}
      />

      {measureActive && (
        <MeasureBar
          mode={measureMode}
          onChangeMode={handleChangeMeasureMode}
          pointCount={measurePoints.length}
          totalLabel={measureTotalLabel}
          onUndo={() => setMeasurePoints(prev => prev.slice(0, -1))}
          onClear={() => setMeasurePoints([])}
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

      {!routingActive && !navigationActive && !meetupActive && !measureActive && !anyUtilityPanelOpen && (
        <CategoryBar active={activeCategory} onSelect={handleSelectCategory} />
      )}

      {!routingActive && !navigationActive && !meetupActive && !measureActive && !anyUtilityPanelOpen && (
        <View style={styles.directionsButtonWrap}>
          <Pressable style={styles.directionsButton} onPress={toggleRouting}>
            <Text style={styles.directionsButtonText}>🧭 Directions</Text>
          </Pressable>
          <Pressable style={styles.meetupButton} onPress={toggleMeetup}>
            <Text style={styles.directionsButtonText}>🤝 Meet Up</Text>
          </Pressable>
          <Pressable style={styles.meetupButton} onPress={toggleMeasure}>
            <Text style={styles.directionsButtonText}>📏 Measure</Text>
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
      )}

      {!pickingMapPointFor && (
        <Pressable style={styles.locateButton} onPress={handleLocateMe}>
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
        <Pressable style={styles.satelliteButton} onPress={() => setShowSatellite(v => !v)}>
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
          style={[styles.moreButton, (hazardsVisible || diveSitesActive) && styles.moreButtonActive]}
          onPress={toggleMoreMenu}>
          <Text style={styles.satelliteButtonText}>☰</Text>
        </Pressable>
      )}

      {hazardsVisible &&
        !hazardReportVisible &&
        !routingActive &&
        !navigationActive &&
        !meetupActive &&
        !measureActive && (
          <View style={styles.reportHazardPillWrap} pointerEvents="box-none">
            <Pressable style={styles.reportHazardPill} onPress={openHazardReport}>
              <Text style={styles.reportHazardPillLabel}>🚧 Report hazard</Text>
            </Pressable>
          </View>
        )}

      <MoreMenu visible={moreMenuVisible} onClose={() => setMoreMenuVisible(false)} items={moreMenuItems} />

      <ErrorLogPanel
        visible={errorLogVisible}
        onClose={() => setErrorLogVisible(false)}
        entries={errorLogEntries}
        onClear={handleClearErrorLog}
      />

      <WeatherWidget
        visible={weatherVisible}
        onClose={() => setWeatherVisible(false)}
        loading={weatherLoading}
        weather={weather}
        error={weatherError}
        onRefresh={handleRefreshWeather}
        unit={tempUnit}
        onToggleUnit={handleToggleTempUnit}
      />

      <ListsManagerPanel
        visible={listsManagerVisible}
        onClose={() => setListsManagerVisible(false)}
        favorites={favorites}
        localLists={localLists}
        creating={listCreating}
        onCreateList={handleCreateList}
        onDeleteList={handleDeleteLocalList}
        viewCodeInput={listViewCodeInput}
        onChangeViewCodeInput={setListViewCodeInput}
        onViewCode={handleViewListCode}
        viewingBusy={listViewingBusy}
        viewingError={listViewingError}
      />

      <ListViewSheet
        visible={listViewSheetVisible}
        list={viewedList}
        onSelect={handleSelectListPlace}
        onClose={() => setListViewSheetVisible(false)}
      />

      <OfflineMapsPanel
        visible={offlinePanelVisible}
        onClose={() => setOfflinePanelVisible(false)}
        label={offlineLabel}
        onChangeLabel={setOfflineLabel}
        onDownloadCurrentArea={handleDownloadCurrentArea}
        downloading={offlineDownloading}
        downloadStatus={offlineDownloadStatus}
        downloadError={offlineDownloadError}
        packs={offlinePacks}
        onDeletePack={handleDeleteOfflinePack}
      />

      <SharingPanel
        visible={sharingPanelVisible}
        onClose={() => setSharingPanelVisible(false)}
        myCode={mySharingCode}
        sharingBusy={sharingBusy}
        sharingError={sharingError}
        onStartSharing={handleStartSharing}
        onStopSharing={handleStopSharing}
        viewedLabel={viewedPosition ? viewedPosition.label ?? 'Shared location' : null}
        viewingBusy={viewingBusy}
        viewingError={viewingError}
        onStartViewing={handleStartViewing}
        onStopViewing={handleStopViewing}
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
        onSearchAlongRoute={handleOpenAlongRoute}
      />

      <AlongRouteSheet
        visible={alongRouteVisible}
        activeCategory={alongRouteCategory}
        loading={alongRouteLoading}
        error={alongRouteError}
        results={alongRouteResults}
        onSelectCategory={handleSelectAlongRouteCategory}
        onSelectResult={handleSelectAlongRouteResult}
        onClose={closeAlongRoute}
      />

      <ReportHazardSheet
        visible={hazardReportVisible}
        onClose={() => setHazardReportVisible(false)}
        locationLabel={currentPosition ? 'at your current location' : 'at the center of the map'}
        submitting={hazardReportSubmitting}
        error={hazardReportError}
        onSubmit={handleSubmitHazardReport}
      />

      <HazardInfoCard
        hazard={selectedHazard}
        isMine={!!selectedHazard && myHazardReports.some(r => r.id === selectedHazard.id)}
        confirming={hazardConfirming}
        deleting={hazardDeleting}
        onClose={() => setSelectedHazard(null)}
        onConfirm={handleConfirmHazard}
        onDelete={handleDeleteHazard}
      />

      <FerryPanel
        visible={ferryPanelVisible}
        loading={ferryLoading}
        error={ferryError}
        routes={ferryRoutes}
        onClose={() => setFerryPanelVisible(false)}
      />

      <DiveSitesPanel
        visible={diveSitesActive}
        loading={diveSitesLoading}
        error={diveSitesError}
        sites={diveSites}
        onClose={() => setDiveSitesActive(false)}
        onDirections={handleDiveSiteDirections}
      />

      <BorderCrossingInfoCard
        crossing={selectedBorderCrossing}
        onClose={() => setSelectedBorderCrossing(null)}
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
