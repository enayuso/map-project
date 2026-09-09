# Phase 0 Data Audit: Belize City & Ambergris Caye/San Pedro (OSM)

*Empirical follow-up to [01-data-collection.md](01-data-collection.md) and [05-belize-official-data-verification.md](05-belize-official-data-verification.md). Rather than describing OSM coverage in the abstract, this audits the actual downloaded data for the two pilot areas. Date: 2026-09-09. Source: Geofabrik `belize-260908.osm.pbf` (Belize country extract, built 2026-09-08), clipped locally with `osmium extract` to two bounding boxes.*

**Pilot bounding boxes used** (`minlon,minlat,maxlon,maxlat`, WGS84):
- Belize City: `-88.30,17.44,-88.13,17.56`
- Ambergris Caye/San Pedro: `-88.05,17.83,-87.75,18.20`

These are a first pass sized to comfortably cover each town — worth revisiting once Phase 1 style/zoom work shows the actual visible extent needed.

## Headline numbers

| Metric | Belize City | Ambergris Caye |
|---|---:|---:|
| Nodes | 139,195 | 108,404 |
| Ways | 24,361 | 8,896 |
| Relations | 180 | 230 |
| Road ways (`highway=*`) | 2,943 | 1,026 |
| — with a `name` tag | 1,367 (**46%**) | 170 (**17%**) |
| — with `oneway=yes` | 465 (16%) | 32 (3%) |
| — with `maxspeed` | 1,069 (36%) | 155 (15%) |
| — with `surface` tagged | ~2,916 (**99%**) | ~1,017 (**99%**) |
| Turn-restriction relations (`type=restriction`) | 13 | 1 |
| Buildings (`building=*`) | 19,256 | 5,506 |
| — with `addr:housenumber` | 2,480 (**13%** of buildings) | 456 (**8%** of buildings) |
| — with `addr:street` | 3,404 | 626 |
| Admin boundary relations | 23 (levels 2,4,7,8,9,10,11 present) | 9 (levels 2,4,6,8,10 present) |
| `place=*` nodes (city/town/village/quarter/etc.) | 61 across 9 place-types | 46 across 9 place-types |

## What this confirms from the earlier research

- **Road geometry exists and is denser than expected** — 2,943 and 1,026 road ways respectively is a real, usable street grid for both towns, not a sparse skeleton.
- **Address completeness is exactly as thin as predicted**: only 13% of Belize City buildings and 8% of Ambergris Caye buildings carry a `addr:housenumber`. Confirms [03-geocoding-search.md](03-geocoding-search.md)'s call to design geocoding around the **interpolation/nearest-road fallback tier as the primary path**, not the exception — most lookups will hit it.
- **Turn restrictions are sparse (13 / 1 relations)**, as flagged in [04-routing-traffic.md](04-routing-traffic.md) — this is either genuinely few real restrictions in small towns, or under-mapping; routing quality should be spot-checked against real driving experience in a few known-tricky intersections before trusting it blindly.
- **Surface tagging is surprisingly excellent (~99% of roads in both areas)** — better than expected, and directly useful: **most roads are "unpaved"** (1,543 of Belize City's, 611+230(sand) of Ambergris Caye's), which should feed into routing cost/speed assumptions (unpaved ≠ same travel speed as paved) rather than being ignored.

## New findings not previously flagged

- **Road *naming* completeness is a real, previously-unflagged gap — especially on Ambergris Caye, where 83% of road ways have no `name` tag at all.** This directly hurts two things: (a) turn-by-turn instructions ("turn onto ___") will have nothing to say for the majority of San Pedro's street grid, and (b) address-based geocoding needs a named street to anchor to. **Action for Phase 2/4**: budget for a targeted crowdsourced or manual road-naming pass on Ambergris Caye specifically before turn-by-turn feels usable there; Belize City's 46% is workable but still incomplete.
- **`addr:place` appears on Ambergris Caye (104 instances) where Belize City has none** — a sign that San Pedro addressing sometimes uses an area/place name instead of a formal street+number, consistent with the informal-addressing expectation but worth encoding explicitly in the address-parsing schema (don't assume `addr:street` is always the right field to fall back to).
- **Generic/untyped tags are common**: `shop=yes` (162 instances in Belize City) and the dominant `building=yes` (18,299 of 19,256 Belize City buildings, 5,309 of 5,506 in Ambergris Caye) mean the *location* of most shops/buildings is known but their *type* often isn't. This is a real gap for the Phase 2 category taxonomy — a meaningful fraction of POIs will need manual/crowdsourced categorization rather than inheriting a clean category from OSM directly.
- **Tourism/POI character matches the pilot's intended profile**: Ambergris Caye shows `amenity=ferry_terminal` (9), `shop=scuba_diving` (14), `amenity=car_rental` (23, i.e. golf carts) and strong hotel/guest_house density (79 + 21) — confirms this is genuinely a tourist-economy area worth its own map treatment (e.g. dive-site layer, golf-cart-friendly routing profile as a future stretch idea) distinct from Belize City's more typical urban-services mix (banks, schools, pharmacies, restaurants).
- **`place=*` granularity is workable for a first gazetteer**: both areas have `quarter`/`neighbourhood`/`suburb`-level place nodes (45 in Belize City, 25 in Ambergris Caye) beyond just the single city/town node — enough sub-area granularity to seed the from-scratch gazetteer called for in [PLAN.md](../PLAN.md) Phase 2, without starting from nothing.
- **A small number of `highway=proposed` ways exist (144 in Belize City, 0 found in Ambergris Caye)** — these are planned/unbuilt roads and must be filtered out of the Phase 4 routing graph, not treated as drivable.

## Caveats

- These counts are **tag presence**, not geometry validity — a `boundary=administrative` relation existing doesn't guarantee its polygon is closed/valid; that needs a proper import (`osmium export` / PostGIS `ST_IsValid`) pass in Phase 1, not just a tag count.
- Bounding boxes are rectangular and drawn generously; they include some surrounding water/unrelated area, which is harmless (just extra empty space) rather than a quality problem.
- This is OSM data only — it does not yet include anything from LIC/BNSDI (see [05-belize-official-data-verification.md](05-belize-official-data-verification.md)), which if/when obtained should supersede OSM specifically for cadastral parcels and administrative boundaries.

## Files produced

- `data/raw/belize-latest.osm.pbf` — full-country extract (not committed to git, regenerable; see `.gitignore`)
- `data/pilot/belize-city.osm.pbf`, `data/pilot/ambergris-caye.osm.pbf` — clipped pilot extracts (also not committed; regenerate via `osmium extract` with the bounding boxes above)
