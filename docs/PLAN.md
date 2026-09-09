# Build Plan: Belize Map App ("지도")

*Grounded in [RESEARCH-SUMMARY.md](RESEARCH-SUMMARY.md) and the detailed findings in [research/](research/). This is a living document — update it as decisions get made and phases complete.*

**Status:** 🟢 Scope locked (2026-09-09) — see "Locked decisions" below. Phase 0 is next.

## Guiding principle

Build **one layer at a time, bottom-up**, exactly as the stack is layered in reality: you cannot render a map without tiles, you cannot search without a geocoder, you cannot route without a graph. Each phase should produce something *runnable and visible* before moving to the next — not a paper design.

---

## Phase 0 — Foundations & Data Audit

**Goal:** know exactly what data we have, what we don't, and lock the tech stack before writing product code.

- [x] Geographic scope decided: pilot region, Belize City + Ambergris Caye/San Pedro corridor (see "Locked decisions")
- [ ] Pull the Belize OpenStreetMap extract (Geofabrik/HOT export), clipped to the pilot region, and audit it: road coverage, POI density, address-tag completeness, admin-boundary completeness
- [x] Verified BNSDI (portal.bnsdi.gov.bz) and the Land Information Centre (LIC) are real, active government bodies — see [research/05-belize-official-data-verification.md](research/05-belize-official-data-verification.md). Portal is currently unreachable (likely temporary outage, was up as recently as Apr 2026) and functions as a metadata catalog/viewer, not a bulk-download API.
- [ ] Submit a formal data-sharing request to LIC's Belize City office ((501) 280-5263, Queen Street) for pilot-region cadastral/admin-boundary/road data — start this early, expect it to take real calendar time, don't block Phase 1 on it
- [ ] Periodically recheck portal.bnsdi.gov.bz's Geo-Portal / Data Source Table for when it comes back online
- [ ] Evaluate commercial imagery options (Maxar/Airbus/Planet tasking vs. free Sentinel-2/Landsat) against budget
- [ ] Lock the tech stack (see "Recommended stack" below) and stand up local dev infra: PostGIS instance, project repo structure, CI
- [ ] Confirm OSM's ODbL license obligations (attribution requirements) since OSM is the backbone data source

**Output:** a short data-audit doc + a running PostGIS instance with the Belize OSM extract imported.

---

## Phase 1 — Base Map (Data → Tiles → Render)

**Goal:** a pannable, zoomable map of the pilot region in a mobile app (iOS + Android), styled, with no search or routing yet.

1. Import the pilot-region OSM extract via `osm2pgsql` into PostGIS.
2. Generate vector tiles: PostGIS → GeoJSON/flatgeobuf → **Tippecanoe** → MBTiles, using the **OpenMapTiles** schema (or a trimmed-down subset of it — a pilot region doesn't need every layer OpenMapTiles defines for dense European cities).
3. Serve tiles via **Martin** (or `tileserver-gl`) behind a CDN.
4. Scaffold a **React Native** app with `@maplibre/maplibre-react-native`, loading a basic style JSON (roads, water, place labels, admin boundaries) — targets iOS + Android from one codebase.
5. Add a **Sentinel-2** satellite-imagery raster layer as a togglable base-map option (free, commercial-use-permitted — see "Locked decisions").
6. Stretch: a day/night or "tourist" alternate style, since swapping style JSON is nearly free once the tile pipeline exists.

**Output:** a working map you can pan/zoom/toggle-satellite in a native iOS/Android app (simulator/emulator to start), covering the pilot region.

---

## Phase 2 — Search & Geocoding

**Goal:** type an address or place name, get a pin.

1. Stand up **Nominatim** (fastest to a working demo) or **Pelias** (more customizable, heavier to operate) on top of the same PostGIS data.
2. Build the missing piece neither tool gets for free in Belize: a **from-scratch admin-hierarchy gazetteer** (district → town/village → street), since there's no government equivalent to import.
3. Layer in **libpostal** for free-text address parsing (its English/Spanish coverage suits Belize's bilingual context).
4. Implement reverse geocoding: point-in-polygon against whatever admin boundaries exist, falling back to nearest-road-segment snapping (PostGIS `ST_ClosestPoint`/`ST_LineLocatePoint`) with a distance-based confidence score — expect most lookups to hit the fallback tier, since building/parcel polygons won't exist for most of the country.
5. Stand up **Typesense or Meilisearch** as the POI/place search index (lighter than Elasticsearch at Belize's data volume), seeded from OSM `amenity=*`/`shop=*`/`tourism=*` tags, with autocomplete and typo tolerance out of the box.
6. Define a small, fixed **category taxonomy** (10–20 top-level categories, Kakao's 18-code model is a good template) mapped from the OSM tags that fed it.

**Output:** a search box on top of the Phase 1 map that resolves addresses and place names to pins.

---

## Phase 3 — POI / Business Data Platform

**Goal:** move from "static OSM snapshot" to a living, maintainable place database.

1. Design the place schema: name, category, coordinates, address (structured + informal-description field), phone, hours, verification status, source (OSM/self-registered/field-collected).
2. Build a **lightweight self-registration flow** for business owners — phone OTP + storefront photo, deliberately *not* gated behind a business-registration certificate (Korea's model excludes too much of Belize's informal economy).
3. Build a **crowdsourced "suggest an edit / report an error" flow** with a small human moderation queue — tiered verification (photo required for destructive edits like "mark closed"; lighter touch for additive edits).
4. Build a **dedup/entity-resolution pass**: `pg_trgm` name-similarity + tight geo-distance threshold to flag likely duplicates, resolved via manual review (not full automation — volume doesn't justify it yet).
5. Consider a modest non-cash incentive for contributions (badges/leaderboard) rather than Naver's cash-equivalent points model, until volume justifies a paid rewards system.

**Output:** owners and users can add/correct places; a moderator can clear a review queue; the POI index from Phase 2 stays fresh.

---

## Phase 4 — Routing & Navigation

**Goal:** turn-by-turn directions between two points.

1. Stand up **Valhalla** or **GraphHopper** (preferred over OSRM for profile flexibility and future live-traffic hooks) against the Belize OSM extract.
2. Configure car/walk/bike routing profiles.
3. Validate turn restrictions/one-way tagging against ground truth in a few known-tricky areas (Belize OSM tagging is assumed sparse here — spot-check, don't just trust the import).
4. Wire up the engine's built-in **map matching** (HMM/Viterbi) for "snap to road" + turn-by-turn instruction generation — this is a packaged feature, not custom work.
5. ETA: ship **static, free-flow-speed-based estimates** (posted/OSM speed limit × distance, with a flat rural/urban degradation factor) — explicitly no historical or live-traffic blending yet, since neither data source exists.

**Output:** tap two points on the map, get a route + turn-by-turn instructions + a (static) ETA.

---

## Phase 5 — Deferred / Future Layers

These require data that doesn't exist yet and shouldn't block earlier phases:

- **Real-time traffic**: only viable once the app has enough active users to serve as its own crowdsourced probe-data source (a multi-year horizon). Historical speed-profile-based ETA blending is a prerequisite step before any live layer.
- **Public transit directions**: no GTFS feed exists for Belize anywhere. Requires manually authoring a minimal static GTFS feed for known intercity bus routes (digitizing the same schedules third-party sites like belizebusschedules.com already compile) before OpenTripPlanner/RAPTOR-style routing is even possible.
- **Street-level imagery ("Belize Street View")**: a lean single-vehicle 360°-camera + GPS rig covering main highways/town centers — Kakao's 2008-era approach, not Naver's current LiDAR-heavy fleet — is the realistic model, and still a meaningful post-launch investment, not a v1 item.
- **Offline maps**: bundle a pre-baked national MBTiles/PMTiles file with the mobile app, refreshed from the same Tippecanoe pipeline — cheap to add once Phase 1's tile pipeline exists, worth doing given Belize's low-connectivity rural/dive-site areas.

---

## Recommended stack (subject to Phase 0 confirmation)

| Layer | Choice | Why |
|---|---|---|
| Geodata store | PostgreSQL + PostGIS | Industry standard, everything else plugs into it |
| Base data | OpenStreetMap extract (Geofabrik/HOT) | Only viable geometry/POI source for Belize |
| Tile generation | Tippecanoe → MBTiles, OpenMapTiles schema | Small country = tiny extract; static pre-bake beats a live dynamic server |
| Tile serving | Martin (or tileserver-gl) + CDN | Fast, low-ops, handles both static MBTiles and PMTiles |
| Client renderer | MapLibre Native, via React Native bindings (mobile-first) | License-clean (BSD), WebGL/OpenGL, same model as Naver/Kakao's modern SDKs; one codebase for iOS+Android |
| Satellite imagery | Sentinel-2/Copernicus (free, commercial-use-permitted) for pilot | Upgrade to Maxar/Airbus/Planet only once budget allows post-pilot |
| Geocoding | Nominatim or Pelias + libpostal | Mature OSS reference implementations of the exact algorithm shape Kakao/Naver use |
| POI search | Typesense or Meilisearch | Lighter than Elasticsearch at Belize's POI volume, built-in typo tolerance |
| Routing | Valhalla or GraphHopper | Off-the-shelf CH/CCH-class performance is unnecessary at this scale; pick for profile flexibility + future live-traffic hooks |
| Dedup | PostgreSQL `pg_trgm` + manual review queue | Volume doesn't justify ML entity resolution yet |

---

## Locked decisions (2026-09-09)

1. **Geographic scope for v1: pilot region.** Working definition: **Belize City + a tourist corridor (Ambergris Caye/San Pedro)**. This is adjustable once Phase 0's data audit shows where OSM coverage is actually strongest — the audit may suggest widening/narrowing the exact boundary, but "one city + one tourist corridor" is the target size.
2. **Platform priority: mobile first (iOS + Android).** This changes Phase 1's client target from "MapLibre GL JS in a browser" to **MapLibre Native**. For a solo/small-team build targeting both platforms from one codebase, the pragmatic default is **React Native** with `@maplibre/maplibre-react-native` bindings (Flutter + `maplibre_gl` is the alternative if the team ends up more Flutter-fluent) — flagged here as a recommendation, not yet locked, since it's an implementation detail rather than a strategic call.
3. **Budget: hobby/self-funded now, may scale up if the pilot succeeds.** This means every Phase 0–4 choice should default to **free-tier and self-hosted options that remain valid if the project later needs to scale commercially** — i.e., avoid anything free-for-non-commercial-use-only that would need ripping out later. Concretely: **Sentinel-2/Copernicus imagery** (free, ~10m resolution, license explicitly permits commercial use) instead of a commercial provider for the pilot's satellite layer, self-hosted OSS (PostGIS, Martin, Nominatim/Pelias, Typesense/Meilisearch, Valhalla/GraphHopper) on modest/free-tier cloud infra rather than paid SaaS equivalents. Revisit Maxar/Airbus/Planet imagery licensing only once the pilot has traction and a real budget.
4. **Project nature: commercial venture.** This has two direct licensing consequences to respect from day one: (a) **OpenStreetMap's ODbL license permits commercial use** but requires attribution and share-alike *of the database itself* if it's redistributed/published — fine for "using OSM data to power an app," just needs a visible attribution in the app; (b) every tool in the recommended stack (MapLibre, Valhalla/GraphHopper, Typesense/Meilisearch, libpostal, Pelias) is chosen specifically because its license (BSD/MIT/Apache-2.0) permits commercial use with no fee — this was already true of the Phase-0-recommended stack, and is now a hard constraint rather than just a preference, since we're no longer picking tools "for a hobby project."
5. **Team**: solo build with Claude as engineering partner, proceeding phase by phase.
