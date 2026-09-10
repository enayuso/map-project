# Research Summary: How Naver/Kakao Map Work, and What That Means for a Belize Map App

**Date:** 2026-09-09
**Purpose:** Executive synthesis of the research in [research/](research/) — one document per subsystem — distilled into the cross-cutting findings that shape [PLAN.md](PLAN.md).

A map platform like Naver Map or Kakao Map is really **four stacked systems**, each independently swappable:

```
┌─────────────────────────────────────────────────────────────┐
│ 4. ROUTING & NAVIGATION                                      │
│    road graph → routing engine → live traffic → turn-by-turn │
├─────────────────────────────────────────────────────────────┤
│ 3. SEARCH & GEOCODING                                         │
│    address parsing → geocoder → POI search index/autocomplete│
├─────────────────────────────────────────────────────────────┤
│ 2. MAP RENDERING                                              │
│    tiles (vector/raster) → tile server/CDN → client renderer │
├─────────────────────────────────────────────────────────────┤
│ 1. DATA COLLECTION                                            │
│    base geometry, imagery, addresses, POIs, crowdsourcing     │
└─────────────────────────────────────────────────────────────┘
```

Each layer's full detail is in its own file: [01-data-collection.md](research/01-data-collection.md), [02-map-rendering.md](research/02-map-rendering.md), [03-geocoding-search.md](research/03-geocoding-search.md), [04-routing-traffic.md](research/04-routing-traffic.md).

**Follow-up (2026-09-09)**: [07-naver-kakao-proprietary-gis.md](research/07-naver-kakao-proprietary-gis.md) digs specifically into how Naver/Kakao's *proprietary* GIS systems are built — their mapping-vehicle/robot fleets, Kakao Mobility's own disclosed rendering-engine architecture (KNMSDK) and confirmed PostgreSQL/PostGIS backend, and their routing/HD-map ML pipelines. Headline: their spatial database layer is the same class of open-source tooling this project already uses — the real, hard-to-replicate difference is the scale of their data-collection operations, not fundamentally different core architecture.

**Follow-up (2026-09-10)**: [08-comparative-data-sourcing-landscape.md](research/08-comparative-data-sourcing-landscape.md) widens the same question to Google, Apple, HERE, TomTom, and Waze, plus a survey of open/free geospatial datasets (Overture Maps, Meta/Microsoft/Google building footprints, HDX, GADM vs. geoBoundaries, Copernicus). Headline: **none of the five commercial platforms have meaningful first-party ground-truth coverage of Belize either** — Google has zero Street View road coverage there, Apple's own current survey-country list excludes Belize entirely, HERE rates it only "Intermediate" tier, and Waze's own Belize community looks dormant. Only TomTom has an official "detailed data" (top-tier) coverage claim for Belize. Every platform is, for Belize specifically, leaning on the same three things this project already does — OpenStreetMap, licensed/satellite imagery, and crowdsourcing — confirming this project's stack isn't a lesser-tier compromise, just a smaller-scale version of the same strategy.

**Follow-up (2026-09-10)**: acting on doc 08's finding that HOT ran a real 2024 building-mapping activation across Cayo/Toledo, [06-pilot-region-data-audit.md](research/06-pilot-region-data-audit.md) was extended with a direct empirical test — pulling building edit timestamps for the exact villages HOT's own wiki names. Result: **29% of all buildings in that area were edited in 2024, and 99.9% of those edits fall inside HOT's documented June–August 2024 response window** — about as clean a confirmation as timestamp analysis can give that this activation's data is real and already sitting in this project's OSM extract. Address completeness and road naming there remain as thin as everywhere else audited so far, though (HOT mapped buildings, not addresses/road names) — the interpolation-first geocoding design still stands countrywide.

## The single biggest finding

**Naver and Kakao don't build most of their base data themselves — they sit on top of Korean government infrastructure that has no Belizean equivalent**, and separately benefit from a **regulatory wall (Korea's map-export restriction law) that has no Belizean equivalent either.**

That cuts both ways for this project:

| | Korea (Naver/Kakao) | Belize (this project) |
|---|---|---|
| Base geometry & imagery | Government-flown annually (NGII), satellite program, LiDAR DEM | Nothing government-equivalent — must license commercial imagery + lean on OpenStreetMap |
| Addresses | Dual government-registered system (지번/도로명), reconciled via a national portal | No structured system — informal/landmark addressing is the reality |
| Business/POI data | Registry-gated self-registration, cross-checked against a national SME database | No registry to gate on — open registration + field outreach needed |
| Road network for routing | Government-maintained national node-link graph, refreshed every 5 min | OSM only (~72% road-length coverage, uneven freshness) |
| Live traffic | Ride-hailing fleet probe data + government sensor networks (VDS/CCTV) feeding a 5-min national feed | **None of this exists** — not a phase-2 gap, a hard current limit |
| Public transit data | A national feed (TAGO) aggregates every local transit agency for free | **No GTFS feed exists for Belize anywhere** — must be authored from scratch if wanted |
| Regulatory access | Foreign map providers capped at coarse 1:25,000 data by law since 2014; only conditionally eased for Google in Feb 2026 | **No known equivalent restriction** — free to use best-available imagery, any cloud region, no domestic-partner mandate |

**Net read:** this project is *not* "build a Korean map app for a different country." It's "build a leaner, open-source-first map stack sized for a small country with thin source data but no regulatory friction." The architecture pattern (tiles → geocoder → search index → routing graph) transfers directly; the *data supply* underneath each layer does not, and has to be assembled deliberately.

## What transfers directly (solved problems — just adopt the standard open-source tool)

- **Tile format & rendering**: Mapbox Vector Tiles + MapLibre GL is the same technology Naver/Kakao's modern SDKs are converging toward — zero reason to build a custom renderer.
- **Geocoding algorithm shape**: tokenize → hierarchical match → interpolate is universal; Nominatim/Pelias/libpostal are mature reference implementations.
- **Routing algorithms**: Contraction Hierarchies etc. matter at continent scale; at Belize's scale, off-the-shelf OSRM/GraphHopper/Valhalla will be fast enough without any custom algorithm work.
- **Map matching / turn-by-turn**: HMM+Viterbi map matching is a solved, packaged feature in OSRM/Valhalla — no custom development needed.

## What has to be built deliberately because the data doesn't exist yet

- **Base imagery**: commercial licensing decision (Maxar/Airbus/Planet/Sentinel) — a budget line item, not an engineering problem.
- **Address gazetteer**: a from-scratch district → town → street hierarchy, since there's no government equivalent to import.
- **POI seed data**: OSM + manual/field-collected data — no business registry to bootstrap from.
- **Crowdsourcing + moderation**: more load-bearing here than in Korea, since there's no institutional backstop catching bad data.
- **Traffic & transit**: explicitly deferred — no data substrate exists; both require either years of accumulated first-party usage data (traffic) or one-time manual authoring (a static GTFS feed for transit).

See [PLAN.md](PLAN.md) for how these findings translate into a phased build order.

**Follow-up (2026-09-10)**: [09-kakao-naver-feature-audit.md](research/09-kakao-naver-feature-audit.md) shifts from *how these apps work* to *what they actually let a user do* — a live 2026 feature audit of both apps, cross-referenced against this project's own status. Headline: most of the remaining gap (transit, live traffic, street view, business self-service) is blocked by the same structural data gaps already documented, not new news — but a real, actionable short list isn't blocked by anything: live location sharing, a free Plus-Codes-based backup address system (directly targeting this project's own repeated finding of thin Belize addressing), a meeting-point calculator neither Kakao nor Naver actually has natively, a distance/area measurement tool, and shareable saved-place folders.

**Follow-up (2026-09-10)**: after building live location sharing, the meetup calculator, the measurement tool, offline maps, shareable lists, and weather, [10-remaining-feature-gaps.md](research/10-remaining-feature-gaps.md) widens the question past Kakao/Naver to four angles: a refreshed Kakao/Naver check, Google Maps/Waze-style features, Belize-tourism-specific gaps, and iOS-native platform integration (relevant only because this app is iOS-only — Kakao/Naver are both Android-first and would never surface this angle). Headline finds: a search-along-route feature and crowdsourced road-hazard reporting (Waze's core idea, and a genuine undocumented gap for Belize's flooding/washouts) both reuse existing infrastructure; ferry-schedule integration, dive-site data, and border-crossing info cards are real white space no existing Belize app covers well; and a Live Activity/Dynamic Island showing live navigation ETA is flagged as the single most "Kakao/Naver literally cannot do this" feature available, given the iOS-only positioning.
