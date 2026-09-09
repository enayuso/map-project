# map-project (지도)

A from-scratch map application for Belize — the architecture pattern of Naver Map / Kakao Map (tiles → geocoding/search → routing), rebuilt on an open-source stack sized for a small country.

## Start here

- [docs/RESEARCH-SUMMARY.md](docs/RESEARCH-SUMMARY.md) — how Naver/Kakao Map work under the hood, and what transfers vs. doesn't for Belize
- [docs/research/](docs/research/) — the four detailed research subsystems (data collection, map rendering, geocoding/search, routing/traffic)
- [docs/PLAN.md](docs/PLAN.md) — the phased build plan and locked scope decisions

## Locked scope (see docs/PLAN.md for detail)

- **Pilot region v1**: Belize City + Ambergris Caye/San Pedro corridor
- **Platform**: mobile first (iOS + Android, React Native + MapLibre Native)
- **Stack**: OpenStreetMap + PostGIS + Tippecanoe + Martin + MapLibre + Nominatim/Pelias + libpostal + Typesense/Meilisearch + Valhalla/GraphHopper — all chosen for licenses that stay valid at commercial scale
- **Nature**: commercial venture, currently self-funded/hobby-budget

## Status

🟢 Phase 0 (data audit & stack setup) in progress.
