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

This exports every named point in `planet_osm_point` tagged `amenity=*`/`shop=*`/`tourism=*` from PostGIS, maps each to a category (see taxonomy below), and bulk-loads them into a `pois` collection. Currently **3,363 POIs**, whole-country (not scoped to the pilot region — cheap enough not to bother filtering).

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

## Verified working (2026-09-09)

- **Prefix search**: `q=Sinatr` → finds "Sinatra Restaurant"
- **Real typo tolerance** (not just prefix): `q=Sinata` (transposed/missing letters) → still finds "Sinatra Restaurant", no special config needed — this is Typesense's out-of-the-box behavior
- **Geo-radius search**: `filter_by=location:(17.4995, -88.19, 3 km)` around Belize City → 489 results across supermarkets, pharmacies, restaurants, hotels, attractions

Example query:
```bash
curl -H "X-TYPESENSE-API-KEY: typesense_dev_local_only" \
  --data-urlencode "q=sinata" --data-urlencode "query_by=name" \
  "http://127.0.0.1:8108/collections/pois/documents/search" -G
```

## Not yet wired up

- Not yet connected to the mobile app's UI (Phase 2's "search box on top of the map" — the backend piece is done, the client integration isn't)
- No ranking beyond Typesense's defaults (text-match + typo distance) — no popularity/verification-status boost yet, since that needs the Phase 3 POI data platform (review/verification signals) to exist first
