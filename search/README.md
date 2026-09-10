# POI/Place Search (Phase 2): Typesense

Fast, typo-tolerant, prefix-search index over Belize's named POIs (restaurants, shops, hotels, etc.) — a separate concern from [Nominatim](../geocoding/) address geocoding. Chosen over Elasticsearch/Solr per [docs/research/03-geocoding-search.md](../docs/research/03-geocoding-search.md): at Belize's POI volume (low thousands, not millions), Typesense's zero-config typo tolerance and prefix search win over Elasticsearch's much heavier ops footprint.

## Start it

```bash
cd search
docker compose up -d
```

Joins the [Phase 1 backend](../backend/)'s Docker network (`backend_default`) so the indexing script can reach PostGIS by hostname. API on **http://127.0.0.1:8108** (dev API key: `typesense_dev_local_only`, sent as the `X-TYPESENSE-API-KEY` header).

## Build the index

```bash
../scripts/reindex_pois.sh
```

This exports every named point in `planet_osm_point` tagged `amenity=*`/`shop=*`/`tourism=*` from PostGIS, maps each to a category (see taxonomy below), and bulk-loads them into a `pois` collection. Currently **3,363 POIs** from OSM, whole-country (not scoped to the pilot region — cheap enough not to bother filtering). Every document gets a `source` field (`"osm"` for this step) — see the Overture supplement below for the other value it can take.

## Category taxonomy (docs/PLAN.md Phase 2 item 6)

An 18-category fixed enum (`scripts/build_poi_index.py`'s `AMENITY_MAP`/`SHOP_MAP`/`TOURISM_MAP`), sized like Kakao Local API's `category_group_code` model rather than Naver's freeform hierarchical string (see [research/03-geocoding-search.md](../docs/research/03-geocoding-search.md) for why that's the better template to copy). Every document keeps its source OSM tag (`osm_tag` field) for traceability, and anything amenity/shop/tourism-tagged but not explicitly mapped falls into `other` rather than being silently dropped or excluded.

Real category breakdown from the current index (whole country):

| Category | Count | | Category | Count |
|---|---:|---|---|---:|
| grocery | 1042 | | healthcare | 49 |
| restaurant | 459 | | transport | 44 |
| other | 440 | | cafe | 44 |
| shop | 366 | | government | 40 |
| attraction | 253 | | pharmacy | 36 |
| hotel_lodging | 250 | | fuel | 33 |
| worship | 134 | | school | 29 |
| bar | 77 | | dive_watersports | 6 |
| bank_atm | 57 | | parking | 4 |

`dive_watersports` being small but present is a nice confirmation this is real Belize data — it exists specifically because of Ambergris Caye's dive-tourism economy (see [research/06-pilot-region-data-audit.md](../docs/research/06-pilot-region-data-audit.md)).

## Optional supplement: Overture Maps (2026-09-10)

[docs/research/08-comparative-data-sourcing-landscape.md](../docs/research/08-comparative-data-sourcing-landscape.md) found that [Overture Maps Foundation](https://overturemaps.org/)'s Places theme has real, current Belize business data — including postcodes OSM often lacks — under CDLA-Permissive-2.0, a more permissive license than OSM's own ODbL. `scripts/merge_overture_places.py` appends it into the same `pois` collection as a second, independent source (tagged `source: "overture"`) rather than replacing anything — **run it after `reindex_pois.sh`, never before**, since that script drops and recreates the collection from scratch.

**One-time setup** (not run automatically, since it touches the network and doesn't need to happen on every reindex):
```bash
pip3 install overturemaps shapely
python3 -m overturemaps download --bbox=-89.35,15.75,-86.75,18.6 \
  -f geojson -t place -o data/overture/places-belize.geojson   # matches mobile/App.tsx's MAX_BOUNDS
curl -sL https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/BLZ/ADM0/geoBoundaries-BLZ-ADM0.geojson \
  -o data/overture/belize-boundary.geojson                    # geoBoundaries, CC BY 4.0 — used only to filter, not redistributed
```
Then, after every `reindex_pois.sh`:
```bash
python3 scripts/merge_overture_places.py
```

**Why the boundary file, not just the bbox**: a rectangular bbox around Belize spills into Guatemala/Mexico/Honduras — confirmed empirically, **only 8,016 of 18,900 (42%) raw downloaded features are actually inside Belize's real border**. The script filters against geoBoundaries' actual country polygon rather than trusting the bbox alone.

**Dedup, not double-listing**: for each Overture candidate (after also dropping unnamed records and anything below a 0.5 confidence score — checked the real distribution first, this keeps 80%), the script checks Typesense for an existing POI within 100m with a similar name (`difflib.SequenceMatcher`, ratio ≥ 0.6) and skips it if found — deliberately sorting that check by actual distance (`sort_by=location(...):asc`), not Typesense's default order, after discovering the hard way that an unsorted top-10 window lets real duplicates through in denser areas.

**Current real numbers**: of 6,403 candidates that survive filtering, ~550 match something already in OSM and are skipped; **the remaining ~5,850 are genuinely new** — more than 2.7× the size of the plain-OSM index — a real, verified increase in POI coverage, not a guess. Confirmed idempotent: running the script twice against the same base index adds zero net-new documents on the second pass.

## Verified working (2026-09-09)

- **Prefix search**: `q=Sinatr` → finds "Sinatra Restaurant"
- **Real typo tolerance** (not just prefix): `q=Sinata` (transposed/missing letters) → still finds "Sinatra Restaurant", no special config needed — this is Typesense's out-of-the-box behavior
- **Geo-radius search**: `filter_by=location:(17.4995, -88.19, 3 km)` around Belize City → 489 results across supermarkets, pharmacies, restaurants, hotels, attractions (OSM-only index, 2026-09-09; 1,604 as of 2026-09-10 with the Overture supplement above merged in — same query, real increase, not a typo)

Example query:
```bash
curl -H "X-TYPESENSE-API-KEY: typesense_dev_local_only" \
  --data-urlencode "q=sinata" --data-urlencode "query_by=name" \
  "http://127.0.0.1:8108/collections/pois/documents/search" -G
```

## Not yet wired up

- Not yet connected to the mobile app's UI (Phase 2's "search box on top of the map" — the backend piece is done, the client integration isn't)
- No ranking beyond Typesense's defaults (text-match + typo distance) — no popularity/verification-status boost yet, since that needs the Phase 3 POI data platform (review/verification signals) to exist first
