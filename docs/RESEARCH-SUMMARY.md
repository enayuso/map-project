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
