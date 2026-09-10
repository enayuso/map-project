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

## Follow-up (2026-09-10): Cayo/Toledo — testing HOT's 2024 wildfire-response activation

[08-comparative-data-sourcing-landscape.md](08-comparative-data-sourcing-landscape.md) found that the Humanitarian OpenStreetMap Team ran a real, dated building-mapping activation across Cayo and Toledo Districts in mid-2024, in response to that year's wildfires. Rather than assume this improved the underlying data, this audit was extended (same `osmium extract` + tag-count methodology as above, plus a new timestamp-histogram check) to three real, OSM-geocoded areas — coordinates pulled directly from our own `planet_osm_point` table, not guessed:

- **San Ignacio/Santa Elena** (Cayo District's twin main towns): `-89.10,17.13,-89.03,17.19`
- **Punta Gorda** (Toledo District's main town): `-88.85,16.07,-88.77,16.14`
- **Toledo villages cluster** (San Pedro Columbia, Crique Jute, and a third "Santa Elena" village — the actual named target area of HOT's 2024 activation, per its own wiki page): `-89.16,16.19,-88.90,16.33`

| Metric | San Ignacio/Santa Elena | Punta Gorda | Toledo villages cluster |
|---|---:|---:|---:|
| Road ways (`highway=*`) | 1,796 | 507 | 591 |
| — with a `name` tag | 512 (**29%**) | 125 (**25%**) | 108 (**18%**) |
| — with `oneway=yes` | 85 (5%) | 11 (2%) | 2 (0.3%) |
| — with `maxspeed` | 463 (26%) | 24 (5%) | 57 (10%) |
| — with `surface` tagged | 1,791 (**100%**) | 506 (**100%**) | 591 (**100%**) |
| Turn-restriction relations | 9 | 0 | 0 |
| Buildings (`building=*`) | 9,085 | 3,579 | 5,044 |
| — with `addr:housenumber` | 844 (9%) | 8 (0.2%) | 0 (0%) |
| — with `addr:street` | 942 (10%) | 128 (4%) | 9 (0.2%) |
| Admin boundary relations | 24 (levels 2,4,7,8,9,10) | 5 (levels 2,4,8) | 11 (level 9 only) |
| `place=*` nodes | 24 | 13 | 21 |

**This broadly confirms the original two pilot areas' patterns generalize**: near-100% surface tagging everywhere (a real, consistent OSM-Belize strength), thin address completeness everywhere (0–10% `addr:housenumber`, worse than either original pilot area — reinforcing [03-geocoding-search.md](03-geocoding-search.md)'s interpolation-fallback design as the right call countrywide, not just for the two towns already audited), and road naming that gets worse the more rural the area (18% in the Toledo villages cluster vs. Belize City's 46%).

**The actual test — does HOT's activation show up as a measurable data-quality change?** Tag *counts* alone can't answer this (a building existing doesn't say when or why it was added), so this pulled each building way's edit timestamp directly (`osmium cat -f opl`, filtered to `building=*`) and histogrammed by year, then by month for 2024:

| Area | Total buildings | Edited in 2024 | 2024 edits concentrated in... |
|---|---:|---:|---|
| Toledo villages cluster (HOT's actual target area) | 5,044 | 1,462 (**29%**) | **816 in June, 373 in July, 271 in August — 99.9% of all 2024 edits fall inside HOT's own documented June 4–August 19, 2024 response window** |
| Belize City (original pilot, not a HOT target) | 19,256 | 2,193 (11%) | Spread unevenly across the year (a separate Feb/July spike of unknown origin — changeset/user metadata is stripped from this extract, so it can't be attributed without further digging) |
| Ambergris Caye (original pilot, not a HOT target) | 5,506 | 65 (1%) | No comparable spike |

**This is about as clean an empirical confirmation as tag/timestamp analysis alone can give**: 29% of all buildings in the exact area HOT's wiki names (San Pedro Columbia, Crique Jute, and neighboring villages) were touched, and that activity lands almost perfectly inside the documented response window — not spread across the year the way ordinary organic editing would be. Belize City's own, much larger 2024 edit spike is a useful control: it shows edit spikes aren't unusual on their own, but it doesn't share Toledo's tight date-window match, and Belize City was never part of the 2024 wildfire response's named scope — so it's left uninvestigated rather than misattributed to HOT.

**Practical implication**: this project's OSM extract already carries a real, dateable data-quality improvement in rural Toledo specifically because of that 2024 activation — not something to build, just something to be aware is already in the data. It does **not** change the address/road-naming gaps found above (HOT's activation mapped buildings, not addresses or road names), so the interpolation-first geocoding approach and field-naming-pass recommendations from the original audit still stand everywhere, Toledo included.

## Files produced

- `data/raw/belize-latest.osm.pbf` — full-country extract (not committed to git, regenerable; see `.gitignore`)
- `data/pilot/belize-city.osm.pbf`, `data/pilot/ambergris-caye.osm.pbf` — clipped pilot extracts (also not committed; regenerate via `osmium extract` with the bounding boxes above)
- `data/audit-cayo-toledo/san-ignacio-santa-elena.osm.pbf`, `punta-gorda.osm.pbf`, `toledo-villages.osm.pbf` — the follow-up's three clipped extracts (also not committed; regenerate via `osmium extract` with the bounding boxes in the follow-up section above)
