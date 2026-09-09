# Geocoding (Phase 2): Nominatim

Address/place → coordinates (forward geocoding) and coordinates → address (reverse), backed by the same Belize OSM data. Self-contained: this container bundles its own Postgres with Nominatim's purpose-built schema — entirely separate from the [Phase 1 backend](../backend/)'s Postgres (which holds the raw osm2pgsql tables for tile rendering).

## Start it

```bash
cd geocoding
docker compose up -d
```

First start runs a full import (reads `../data/raw/belize-latest.osm.pbf`, builds Nominatim's search tables/indices). For a country this size it takes **under two minutes** — watch it with `docker logs -f belize-nominatim`, and it's ready when you see `Application startup complete` (x4, one per worker).

API is on **http://127.0.0.1:8082**.

## ⚠️ Known gotcha: Colima's default VM doesn't have enough RAM

First attempt at the import failed with:
```
FATAL: could not map anonymous shared memory: Cannot allocate memory
```
Colima's default VM ships with only **2GB RAM**, and Postgres (tuned by the Nominatim image for a real import) requested ~2.2GB for shared memory alone — more than the entire VM. **Fix**: resized the VM to 4GB RAM / 4 CPUs (this Mac has 8GB total, so this is half of it — reasonable for active dev, but worth knowing if other memory-hungry things are running):
```bash
colima stop
colima start --cpu 4 --memory 4 --disk 100
```
This restarts the whole Docker daemon, so the [Phase 1 backend](../backend/) containers need `docker compose up -d` again afterward too (they don't lose data — same named volumes — just need restarting).

## Verified working (2026-09-09)

Real queries against real Belize data, both pilot areas:

| Query | Result |
|---|---|
| `GET /search?q=Belize+City` | Correctly resolves the city boundary polygon |
| `GET /search?q=San+Pedro,+Belize` | Correctly **disambiguates** San Pedro Town (Ambergris Caye, our pilot area) from an unrelated San Pedro village in Corozal District |
| `GET /search?q=Queen+Street,+Belize+City` | Returns the right road segments, correctly scoped to Fort George/Belize City |
| `GET /reverse?lat=17.4995&lon=-88.19` | Belize City point → full structured address (`road`, `quarter`, `city`, `country`) — Cleghorn Street, Pickstock |
| `GET /reverse?lat=17.9146&lon=-87.9614` | Ambergris Caye point → resolved via nearest-feature fallback (hit a pier, not a road) exactly as predicted in [research/03-geocoding-search.md](../docs/research/03-geocoding-search.md) — still returned a sensible `road`/`quarter`/`town` breakdown |

This confirms Nominatim's out-of-the-box hierarchical matching + interpolation/nearest-fallback works reasonably well for Belize even before any custom gazetteer or libpostal normalization layer is added — a good sign for how much further custom work Phase 2 actually needs versus just using Nominatim as-is.

## Not yet done (see docs/PLAN.md Phase 2)

- Custom admin-hierarchy gazetteer (district → town/village → street) — deferred; Nominatim's own OSM-derived hierarchy is covering this reasonably so far
- libpostal free-text normalization layer — deferred; not obviously needed yet given the results above, revisit if messier real-world input (typos, abbreviations, mixed English/Spanish) proves Nominatim's own parsing insufficient
- POI/place search index (Typesense/Meilisearch) — separate concern from address geocoding, see [../search/](../search/) if started
