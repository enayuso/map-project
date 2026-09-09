# Build Plan: Belize Map App ("지도")

*Grounded in [RESEARCH-SUMMARY.md](RESEARCH-SUMMARY.md) and the detailed findings in [research/](research/). This is a living document — update it as decisions get made and phases complete.*

**Status:** 🟢 Scope locked (2026-09-09) — see "Locked decisions" below. Phase 0 is next.

## Guiding principle

Build **one layer at a time, bottom-up**, exactly as the stack is layered in reality: you cannot render a map without tiles, you cannot search without a geocoder, you cannot route without a graph. Each phase should produce something *runnable and visible* before moving to the next — not a paper design.

---

## Phase 0 — Foundations & Data Audit

**Goal:** know exactly what data we have, what we don't, and lock the tech stack before writing product code.

- [x] Geographic scope decided: pilot region, Belize City + Ambergris Caye/San Pedro corridor (see "Locked decisions")
- [x] Pulled the Belize OSM extract (Geofabrik) and clipped it to both pilot areas; audited road coverage, POI density, address-tag completeness, admin-boundary completeness — see [research/06-pilot-region-data-audit.md](research/06-pilot-region-data-audit.md). Headline: address completeness is thin as expected (8-13% of buildings), but road-*naming* completeness is a newly-found gap (only 17% on Ambergris Caye) that needs a dedicated crowdsourcing pass before turn-by-turn feels usable there.
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

1. [x] Import the OSM extract via `osm2pgsql` into PostGIS. **Done** — full-country extract loaded (not just the pilot bboxes: only 18MB, no reason not to have the whole country in the canonical store; tile queries are still scoped to the pilot region at render time). See [backend/](../backend/).
2. [x] ~~Generate vector tiles: PostGIS → GeoJSON/flatgeobuf → Tippecanoe → MBTiles~~ **Deviated from plan, deliberately**: Martin serves vector tiles **live, directly from PostGIS** (no Tippecanoe/MBTiles bake step). At this data size that's simpler to iterate on (data changes are visible immediately, no rebake) — the static-bake pipeline is deferred to Phase 5 (offline maps), where it belongs anyway. See [backend/README.md](../backend/README.md), including a **known Colima-networking gotcha** (direct Postgres connections from the host fail; HTTP to Martin works fine) and its workaround (`scripts/db_exec.sh`).
3. [x] Serve tiles via **Martin** — done, configured via [`backend/martin-config.yaml`](../backend/martin-config.yaml) to publish only our tables. CDN fronting deferred until there's a real deployment target.
4. [x] Scaffold a **React Native** app with `@maplibre/maplibre-react-native` — **done and running**. Xcode installed (26.6) and set up by you; the app ([mobile/](../mobile/)) builds and runs in the iOS Simulator, rendering the real Belize City map (roads, buildings, water, neighborhood labels) from our own PostGIS+Martin backend, confirmed interactive (pinch-zoom tested live in-simulator). Getting here hit five real, non-obvious environment bugs (non-ASCII project path breaking CocoaPods/Ruby, a missing manual Podfile hook for MapLibre's native SDK, a currently-active macOS/Xcode codesign bug, a Watchman hang, and a silently-wrong Camera prop name) — all documented with fixes in [mobile/README.md](../mobile/README.md) so they aren't re-debugged from scratch next time (e.g. adding Android).
5. [ ] Add a **Sentinel-2** satellite-imagery raster layer as a togglable base-map option (free, commercial-use-permitted — see "Locked decisions"). Not started.
6. [ ] Stretch: a day/night or "tourist" alternate style. Not started.
7. [ ] Android build — not attempted yet (this phase focused on getting iOS working first, per your call). `mobile/android/` exists from the RN scaffold but is unbuilt/unverified.

**Output so far:** Phase 1's actual goal is met — **a pannable, zoomable, styled map of Belize City running natively in the iOS Simulator**, backed by our own data pipeline end to end (OSM → PostGIS → Martin → MapLibre Native). The web preview ([web-preview/](../web-preview/)) remains as a lighter-weight way to sanity-check style/tile changes without a full native rebuild. Satellite toggle and Android are the remaining open items before Phase 1 is fully closed out.

---

## Phase 2 — Search & Geocoding

**Goal:** type an address or place name, get a pin.

1. [x] Stand up **Nominatim** — **done**, chose Nominatim over Pelias (much faster to a working demo, Pelias's multi-service Elasticsearch-backed architecture is overkill at Belize's scale). Full import runs in under 2 minutes. Verified with real queries against both pilot areas (forward search, disambiguation, reverse geocoding with nearest-fallback) — see [geocoding/README.md](../geocoding/README.md) and `scripts/test_geocoding.sh`. Hit and fixed a real bug: Colima's default VM (2GB RAM) couldn't fit Postgres's shared-memory request; resized to 4GB/4CPU.
2. [ ] **Deferred**: from-scratch admin-hierarchy gazetteer. Nominatim's own OSM-derived hierarchy (district → town/village → quarter → road) is already covering this reasonably well in testing — revisit only if real gaps show up, rather than building preemptively.
3. [ ] **Deferred**: libpostal free-text normalization. Nominatim's built-in parsing handled every test query correctly without it. Revisit if messier real-world input (typos, abbreviations, mixed English/Spanish) proves insufficient.
4. [x] Reverse geocoding — **done**, comes free with Nominatim (`/reverse` endpoint). Confirmed the nearest-feature-fallback behavior predicted in [research/03-geocoding-search.md](../docs/research/03-geocoding-search.md) actually happens in practice (an Ambergris Caye test point resolved via a nearby pier, not a road, but still returned a sensible address breakdown).
5. [ ] Stand up **Typesense or Meilisearch** as the POI/place search index (lighter than Elasticsearch at Belize's data volume), seeded from OSM `amenity=*`/`shop=*`/`tourism=*` tags, with autocomplete and typo tolerance out of the box. — next up.
6. [ ] Define a small, fixed **category taxonomy** (10–20 top-level categories, Kakao's 18-code model is a good template) mapped from the OSM tags that fed it.

**Output so far:** real forward/reverse geocoding working against live Belize data via Nominatim's HTTP API — the address/place-name half of Phase 2's goal. POI search (item 5) and the category taxonomy (item 6) are what's left before this phase is fully closed; the gazetteer and libpostal items turned out to be unnecessary so far given how well Nominatim performs out of the box.

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
| Geocoding | **Nominatim** (chosen over Pelias — faster to a working demo, sufficient so far without libpostal) | Mature OSS reference implementation of the exact algorithm shape Kakao/Naver use |
| POI search | Typesense or Meilisearch | Lighter than Elasticsearch at Belize's POI volume, built-in typo tolerance |
| Routing | Valhalla or GraphHopper | Off-the-shelf CH/CCH-class performance is unnecessary at this scale; pick for profile flexibility + future live-traffic hooks |
| Dedup | PostgreSQL `pg_trgm` + manual review queue | Volume doesn't justify ML entity resolution yet |

---

## Locked decisions (2026-09-09)

1. **Geographic scope for v1: pilot region.** Working definition: **Belize City + a tourist corridor (Ambergris Caye/San Pedro)**. This is adjustable once Phase 0's data audit shows where OSM coverage is actually strongest — the audit may suggest widening/narrowing the exact boundary, but "one city + one tourist corridor" is the target size.
2. **Platform priority: mobile first (iOS + Android).** This changes Phase 1's client target from "MapLibre GL JS in a browser" to **MapLibre Native**. For a solo/small-team build targeting both platforms from one codebase, we went with **React Native** + `@maplibre/maplibre-react-native` — **now locked, not just a recommendation**: it's built and running (see Phase 1 below, [mobile/](../mobile/)).
3. **Budget: hobby/self-funded now, may scale up if the pilot succeeds.** This means every Phase 0–4 choice should default to **free-tier and self-hosted options that remain valid if the project later needs to scale commercially** — i.e., avoid anything free-for-non-commercial-use-only that would need ripping out later. Concretely: **Sentinel-2/Copernicus imagery** (free, ~10m resolution, license explicitly permits commercial use) instead of a commercial provider for the pilot's satellite layer, self-hosted OSS (PostGIS, Martin, Nominatim/Pelias, Typesense/Meilisearch, Valhalla/GraphHopper) on modest/free-tier cloud infra rather than paid SaaS equivalents. Revisit Maxar/Airbus/Planet imagery licensing only once the pilot has traction and a real budget.
4. **Project nature: commercial venture.** This has two direct licensing consequences to respect from day one: (a) **OpenStreetMap's ODbL license permits commercial use** but requires attribution and share-alike *of the database itself* if it's redistributed/published — fine for "using OSM data to power an app," just needs a visible attribution in the app; (b) every tool in the recommended stack (MapLibre, Valhalla/GraphHopper, Typesense/Meilisearch, libpostal, Pelias) is chosen specifically because its license (BSD/MIT/Apache-2.0) permits commercial use with no fee — this was already true of the Phase-0-recommended stack, and is now a hard constraint rather than just a preference, since we're no longer picking tools "for a hobby project."
5. **Team**: solo build with Claude as engineering partner, proceeding phase by phase.
