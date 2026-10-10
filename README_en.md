# map-project (지도) — a map app for Belize, built from scratch

> 한국어: [README.md](README.md)

A full map application for **Belize** that reproduces the architecture of Korea's Naver Map / Kakao Map
(**tiles → geocoding/search → routing → mobile client**) on an open-source stack sized for a small country.
Every layer is self-hosted and runs locally with Docker; the client is a React Native app running in the iOS
Simulator.

I started this project to understand how a production map service actually works under the hood — data
sourcing, vector tiles, search, routing graphs, and everything a real app needs around them (accounts,
moderation, privacy/legal). Research, design and implementation were done together with **Claude Code**.

## Features

- **Base map** — OpenStreetMap data in PostGIS, served as vector tiles by Martin and rendered with MapLibre;
  light/dark styles, tiered place labels, country border, self-hosted glyph fonts, and a Sentinel-2
  satellite/hybrid basemap toggle
- **Search & geocoding** — typo-tolerant POI search (Typesense, OSM + Overture Maps Places), category
  quick-filters, address geocoding (Nominatim), favorites and recent searches, iOS Spotlight integration
- **Routing & navigation** — Valhalla car/walk/bike directions, a "prefer paved roads" option, ferry-aware
  routes, live turn-by-turn navigation with a Live Activity / Dynamic Island ETA, search-along-route,
  speedometer
- **Belize-specific content** — ferry / water-taxi schedules, dive sites, border-crossing info cards, seasonal
  highlights (lobster/conch seasons, whale sharks, turtle nesting), weather overlay and home-screen widget
- **Social** — live location sharing, shareable saved-place lists, a fair meeting-point calculator fed by live
  locations, crowdsourced road-hazard reports and POI corrections with a token-gated web moderation page
- **Accounts & compliance** — Sign in with Apple / email code login, nickname + emoji profile, soft account
  deletion with a 30-day grace period, Privacy Policy & Terms, OSM/ODbL attribution
- **Quality** — offline map downloads, error boundary + local crash log, VoiceOver labels, Jest and pytest
  suites

## Architecture

```
                   ┌───────────────────────── mobile/ (React Native + MapLibre Native) ─────────────────────────┐
                   │   map · search · directions · navigation · sharing · profile · widgets                     │
                   └──────┬──────────────┬──────────────┬───────────────┬────────────────┬──────────────────────┘
                          │ tiles        │ POI search   │ geocoding     │ routes         │ sharing / profile API
                   ┌──────▼─────┐ ┌──────▼──────┐ ┌─────▼──────┐ ┌──────▼──────┐ ┌───────▼────────┐
                   │ Martin     │ │ Typesense   │ │ Nominatim  │ │ Valhalla    │ │ sharing/       │
                   │ :3000      │ │ :8108       │ │ :8082      │ │ :8002       │ │ FastAPI :8090  │
                   └──────┬─────┘ └──────▲──────┘ └────────────┘ └─────────────┘ └───────┬────────┘
                          │              │ indexed from                                    │
                   ┌──────▼──────────────┴─────────────────────────────────────────────────▼────────┐
                   │ backend/ PostGIS :5433  (OSM extract, water polygons, satellite, app tables)    │
                   └─────────────────────────────────────────────────────────────────────────────────┘
```

## Repository layout

| Path | What it is |
|---|---|
| [`backend/`](backend/README.md) | PostGIS + Martin tile server (Docker) |
| [`geocoding/`](geocoding/README.md) | Nominatim geocoder (Docker) |
| [`search/`](search/README.md) | Typesense POI search + category taxonomy (Docker) |
| [`routing/`](routing/README.md) | Valhalla routing engine (Docker) |
| [`sharing/`](sharing/README.md) | FastAPI service: location sharing, lists, hazard reports, POI corrections, profiles, moderation page, curated reference data |
| [`mobile/`](mobile/README.md) | React Native app (iOS first) — feature-by-feature notes and known issues |
| `styles/` | MapLibre styles (light, dark, hybrid) |
| `scripts/` | Data pipeline (fetch/clip OSM, water polygons, satellite mosaic, fonts, Overture merge, POI index), DB table setup, maintenance jobs, smoke tests |
| `web-preview/` | Throwaway browser page for checking tiles/styles without Xcode |
| `docs/` | [`RESEARCH-SUMMARY.md`](docs/RESEARCH-SUMMARY.md), [`PLAN.md`](docs/PLAN.md) (phased plan + status) and 15 research notes in [`docs/research/`](docs/research/) |

Large/regenerable data (`data/raw`, tiles, fonts, satellite, …) is gitignored and rebuilt by the scripts.

## Getting started

Requirements: Docker (Colima works — give the VM enough RAM for Nominatim), Python 3, Node.js, and Xcode +
CocoaPods for the iOS app.

```bash
# 1. data
scripts/fetch_and_clip_osm.sh            # Belize OSM extract (Geofabrik) + pilot-region clips
scripts/download_fonts.sh                # self-hosted map glyphs

# 2. base map — PostGIS :5433 + Martin :3000 (see backend/README.md for the import steps)
cd backend && docker compose up -d && cd ..
scripts/import_water_polygons.sh

# 3. geocoding / search / routing
(cd geocoding && docker compose up -d)                          # :8082
(cd search && docker compose up -d) && scripts/reindex_pois.sh  # :8108
pip3 install osmium && python3 scripts/patch_ferry_connectors.py
(cd routing && docker compose up -d)                            # :8002

# 4. app backend — create tables once, then start :8090
for s in location_shares shared_lists hazard_reports poi_corrections profiles; do scripts/create_${s}_table.sh; done
(cd sharing && cp .env.example .env && docker compose up -d --build)

# 5. mobile app (iOS Simulator) — full steps in mobile/README.md
cd mobile && npm install && (cd ios && bundle install && bundle exec pod install)
npx react-native start
```

Every service binds to `127.0.0.1`. The passwords baked into the compose files (`devpass123`,
`*_dev_local_only`) are local-development defaults — set real values via each component's `.env` before
running anywhere else.

## Tests

```bash
cd mobile && npx jest                     # React Native unit tests
scripts/test_routing.sh                   # Valhalla smoke test (routing running)
scripts/test_geocoding.sh                 # Nominatim smoke test (geocoding running)
# sharing/ pytest suite needs the database — run it inside the container, see sharing/README.md "Tests"
```

## Status

Phases 1–2 and 4–4.5 of [`docs/PLAN.md`](docs/PLAN.md) are built and verified end-to-end in the iOS Simulator.
Still open: official Belize government data requests (Phase 0), real-time traffic / transit / street-level
imagery (Phase 5), and the App Store submission steps that need a paid Apple Developer account.

## Data & licenses

Map data © OpenStreetMap contributors (ODbL); places supplement from Overture Maps; satellite imagery from
Copernicus Sentinel-2. Attribution is shown in the app.
