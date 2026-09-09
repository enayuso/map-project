# Research: Geocoding, Reverse Geocoding, POI Search & Data Quality

*Part of the "지도" (Belize map app) research series. See [../RESEARCH-SUMMARY.md](../RESEARCH-SUMMARY.md) for the executive synthesis and [../PLAN.md](../PLAN.md) for the build plan.*

*Scope: Kakao/Naver (Korea) vs. Pelias/Nominatim/libpostal (open-source reference architectures) vs. Google Places/Mapbox (commercial). Items marked "confirmed" come from official docs; "inferred" items are general industry practice not directly documented by Naver/Kakao.*

---

## 1. Geocoding (Address → Coordinates)

**Korea's dual address system**, tied to a common administrative key:
- **지번주소 (Jibun/land-lot)**: legal-district (법정동) + parcel number, encoded as a 19-digit **PNU code** (10-digit district + 1-digit land category + 4+4 digit parcel number).
- **도로명주소 (Road-name)**, official since 2014: road name + a **기초번호 (base number)** assigned every 20m along the road (odd left / even right); the building number is the nearest base number to the main entrance. Encoded as a 26-digit road-management code.
(Confirmed: [Kakao Mobility — Address Structure pt.2](https://developers.kakaomobility.com/techblogs/address-structure-2.html); [juso.go.kr](https://www.juso.go.kr/introduction/RoadAddress))

**Cross-matching the two systems**: no single authoritative direct lookup table. Kakao Mobility's tech blog states integration is done by joining on the shared legal-dong code, falling back to **text-similarity matching + GIS spatial joins (point-in-polygon)** when codes are missing/mis-keyed, plus a "mapping history" table for 1-building↔N-parcel cases. An academic study reports **82.6% match rate for forward geocoding, 98.5% for reverse, ~1.7m average error** using road-segment interpolation modeled on the US Census address-range method. (Confirmed: [Kakao Mobility pt.3](https://developers.kakaomobility.com/techblogs/address-structure-3.html); [DBpia paper](https://www.dbpia.co.kr/journal/articleDetail?nodeId=NODE06638719))

**Kakao Local API's geocoding surface** (confirmed, [dev-guide](http://developers.kakao.com/docs/en/local/dev-guide)): `GET /v2/local/search/address` returns **both** jibun and road-name address, zip, building name, and hierarchical region fields (시/도 → 구/군 → 동). This confirms the general algorithm: **tokenize → hierarchical top-down match → score ambiguity → interpolate along a road segment when the exact building number is absent**.

**NAVER Cloud Platform Geocoding API** (confirmed, [ncloud-docs](https://api.ncloud-docs.com/docs/en/ai-naver-mapsgeocoding-geocode)) returns `addressElements` typed as `SIDO, SIGUGUN, DONGMYUN, RI, ROAD_NAME, BUILDING_NUMBER, BUILDING_NAME, LAND_NUMBER, POSTAL_CODE` — a structured hierarchy of typed tokens, matching the Nominatim/libpostal model below.

**General open-source algorithm (Nominatim/Pelias/libpostal)**:
1. **Parse/normalize**: **libpostal** uses a statistical NLP model (CRF/logistic regression) trained on 1B+ addresses derived from OSM `addr:*` tags + per-country templates; 99.45% parse accuracy; outputs typed components. ([Mapzen — Inside Libpostal](https://www.mapzen.com/blog/inside-libpostal/), [openvenues/libpostal](https://github.com/openvenues/libpostal))
2. **Hierarchical match**: Nominatim assigns a search rank (0–30) tied to OSM `admin_level`, matching left-to-right (and right-to-left fallback) down country → state → city → street → house number. ([Nominatim Search](https://nominatim.org/release-docs/latest/api/Search/), [Ranking](https://nominatim.org/release-docs/latest/customize/Ranking/))
3. **Interpolation**: when no exact house-number point exists, linearly interpolate along the known address range (Mapbox labels this accuracy tier `"interpolated"` vs `"rooftop"`/`"parcel"`). ([Mapbox Geocoding docs](https://docs.mapbox.com/api/search/geocoding-v5/))
4. **Ranking ambiguous matches**: Nominatim's `importance` defaults to a Wikipedia-pagerank-derived score, falling back to a search-rank formula when no article exists.

**Implication for Belize**: no equivalent of Korea's dual-coded government address system — sparser, less structured data. Realistic stack: **Nominatim or Pelias on PostGIS**, seeded from OSM (Belize's OSM address tagging is inconsistent, per [OSM Wiki Belize](https://wiki.openstreetmap.org/wiki/Category:Belize)) plus any obtainable government cadastral/parcel shapefiles, with **libpostal** for free-text parsing (ships English/Spanish patterns relevant to Belize's bilingual context) and road-segment interpolation as the fallback tier for the likely-majority of buildings without a precise geocode. Plan to build a lightweight admin-hierarchy gazetteer (district → town/village → street) in-house, since no Korea-grade authoritative boundary data exists.

---

## 2. Reverse Geocoding (Coordinates → Address)

Kakao Local API splits this into `coord2address` (jibun + road-name address for a point) and `coord2regioncode` (containing admin/legal region only) — implying separate point-in-polygon lookups against (a) building/parcel polygons and (b) administrative boundaries.

General algorithm (confirmed via ArcGIS/Esri, NextBillion.ai docs; Nominatim itself notes it "finds the closest suitable OSM object" rather than computing an exact address):
1. **Point-in-polygon** (ray-casting/crossing-number, 1962-era, still standard) against parcel/building/admin-boundary layers — polygons preferred over points for exact containment.
2. **Fallback to nearest feature** when no polygon contains the point (open water, unmapped parcel) — return smallest intersecting admin/postal boundary, or nearest road segment.
3. **Road snapping**: drop a perpendicular from the point to the nearest street centerline, interpolate the building-number range at that projected position — same interpolation machinery as forward geocoding, run in reverse.
4. **Pelias's reverse endpoint** ([pelias/documentation](https://github.com/pelias/documentation/blob/master/reverse.md)) is nearest-neighbor across multiple indexed layers, bounded to a 5km radius, returning a distance-based confidence score (≥1.0 under 1m, ~0.5 beyond 1km) — production geocoders often blend polygon lookup with scored nearest-neighbor fallback rather than pure PIP.

**Implication for Belize**: building/parcel-level polygons will be missing in most areas, so design around a **two-tier fallback**: (1) point-in-polygon against whatever admin boundaries exist (districts, town limits — from Belize government GIS or OSM boundary relations), then (2) nearest-road-segment snapping via PostGIS `ST_ClosestPoint`/`ST_LineLocatePoint` with a distance-based confidence score.

---

## 3. POI/Place Search & Autocomplete

Neither Naver nor Kakao publish internal search-engine architecture, but the shape is well established (Pelias is a fully open reference implementation):

- **Index structure**: inverted index over structured POI documents (name, category, address, coords, phone). Pelias runs this on **Elasticsearch** explicitly. Reasonable to infer Naver/Kakao run comparable Lucene-family or proprietary search back ends — **inferred, not documented**.
- **Autocomplete**: **edge-ngram tokenizer** (index every prefix at index time) or Elasticsearch's completion suggester, layered with a **fuzzy query (Levenshtein edit distance)** for typo tolerance — the two are complementary and commonly combined.
- **Korean-specific tokenization**: Korean search commonly needs 초성/중성/종성 (jamo) decomposition for partial/typo-tolerant matching (a Korean patent, [KR101050400B1](https://patents.google.com/patent/KR101050400B1/ko), describes this) — general Korean IR practice, not confirmed as Naver/Kakao's actual implementation.
- **Ranking factors**: Google publishes three explicit factors for local ranking — **relevance**, **distance**, **prominence** (reviews/rating/popularity). ([Google Business Profile help](https://support.google.com/business/answer/7091?hl=en)) Reasonable to infer Naver/Kakao use an analogous blend; exact weighting is not public.
- **Ad-boosted results**: Naver's 플레이스광고 auctions paid placement above/alongside organic results by bid × relevance, with a fallback for low-competition queries — a real, documented ad-insertion layer (moderate-confidence third-party source).

**Implication for Belize**: with a POI count in the low thousands to tens of thousands (not millions), **full Elasticsearch/Solr is likely overkill** — a lighter stack like **Typesense or Meilisearch** (built-in typo tolerance + instant-search, far less ops overhead) paired with **PostGIS** for geospatial filtering is a better fit, with a simple relevance formula (text-match score × inverse distance × a manually-curated "verified/open" boost) rather than trying to replicate click-data popularity signals the app won't have volume for.

---

## 4. Local Search API Design (Kakao Local API / Naver Local Search)

**Kakao Local API** (confirmed, [dev-guide](http://developers.kakao.com/docs/en/local/dev-guide)) — the clearest public window into a Korean platform's "place" data model:

| Endpoint | Purpose | Key params | Key response fields |
|---|---|---|---|
| `/v2/local/search/address` | Geocoding | `query`, `analyze_type` | jibun + road address, x/y, zip |
| `/v2/local/geo/coord2address` | Reverse geocode | `x`,`y`,`input_coord` | jibun + road address |
| `/v2/local/geo/coord2regioncode` | Reverse admin lookup | `x`,`y` | region hierarchy codes |
| `/v2/local/geo/transcoord` | CRS conversion | supports WGS84, TM, KTM, UTM, Bessel | converted x/y |
| `/v2/local/search/keyword` | POI text search | `query`, `category_group_code`, `x`,`y`,`radius` (≤20,000m), `rect`, `sort` | `id`, `place_name`, `category_name`, `category_group_code`, `phone`, both addresses, `x`,`y`, `place_url`, `distance` |
| `/v2/local/search/category` | Category browse | `category_group_code` + radius/rect | same place schema |

18 fixed **category group codes**: `MT1` supermarket, `CS2` convenience store, `PS3` daycare, `SC4` school, `AC5` cram school, `PK6` parking, `OL7` gas station, `SW8` subway, `BK9` bank, `CT1` culture, `AG2` real estate, `PO3` public institution, `AT4` attraction, `AD5` accommodation, `FD6` restaurant, `CE7` cafe, `HP8` hospital, `PM9` pharmacy. This reveals a flat document per POI carrying both address forms, a fixed category code + free-text category string, coords in multiple possible CRSs, and a query-relative distance field.

**Naver Local Search API** (fields reconstructed from secondary sources — the primary doc could not be fetched): `query`, `display`, `start`, `sort` params; response fields `title`, `link`, `category` (freeform hierarchical string, e.g. `"음식점>육류,고기요리"`), `description`, `telephone`, `address`, `roadAddress`, `mapx`, `mapy`. Naver's category is a **loose hierarchical string**, not a fixed enum like Kakao's — a materially different design choice between the two.

**Implication for Belize**: mirror Kakao's pragmatic **small fixed enum** design over Naver's freeform one — much easier to build UI/filtering around. Support both **radius** (center + radius) and **bounding-box (rect)** search from day one — both map directly onto simple PostGIS `ST_DWithin` / `ST_MakeEnvelope` queries.

---

## 5. Category & Business Classification Systems

Korea layers two unrelated official systems atop whatever consumer-facing scheme Kakao/Naver use:
- **KSIC (한국표준산업분류)** — Statistics Korea's 5-level industry classification (policy/statistics use). ([KSIC portal](http://kssc.kostat.go.kr))
- **업종코드 (National Tax Service business-type code)** — a separate tax-administration code, mapped to KSIC via lookup tables.
- Neither Kakao's 18-code enum nor Naver's freeform string is confirmed to map onto either official system — the consumer map-search taxonomy appears to be each company's own independent scheme.
- For comparison: Google Places uses its own flat `types` enum (~200 values); OpenStreetMap uses free-tagging (`amenity=restaurant`, `shop=convenience`) rather than a fixed taxonomy.

**Implication for Belize**: no Belizean equivalent of KSIC/업종코드 worth chasing. Pragmatic approach: a **small self-defined consumer-facing category enum** (à la Kakao's 18 codes, or a curated subset of OSM's `amenity=*`/`shop=*` tags — the actual source data), stored alongside the originating OSM tag(s) for traceability.

---

## 6. Data Quality — Dedup & Entity Resolution

No Naver/Kakao-specific documentation surfaced (internal dedup/closure pipelines are undisclosed). What is confirmed/general:
- Kakao Mobility's address-integration article acknowledges PNU/text errors and resolves via **text-similarity matching, spatial joins, and historical mapping tables** for 1-building↔N-parcel cases.
- Nominatim explicitly performs **duplicate detection and collapses matches** by default.
- General entity-resolution methodology: a **match step** (fuzzy name/address/phone similarity + geo-distance threshold) → a **merge/canonicalization step** (collapse a matched cluster into one "golden record" with the most complete/recent attributes).
- **Closed-business detection** is undocumented industry-wide in public sources; known-in-practice signals are user "permanently closed" reports, crawl/call verification, and click/review-volume decay — none Naver/Kakao-confirmed.

**Implication for Belize**: full automated ML entity-resolution is unnecessary at this scale. Practical pipeline: **(1) match** candidates by normalized-name similarity (PostgreSQL `pg_trgm` trigram/Jaro-Winkler) + a tight geo-distance threshold (<50m); **(2) merge** via manual-review queue (low volume makes full automation unnecessary); **(3) closure detection** via a crowd-sourced "report closed" flag + periodic manual re-verification, deferring any popularity/click-decay signal since traffic volume won't support it initially.

---

## Summary Table: Suggested Stack for Belize

| Capability | Korea/commercial approach | Recommended small-country open-source equivalent |
|---|---|---|
| Address parsing | Proprietary (Kakao/Naver); libpostal (OSS reference) | **libpostal** (bilingual EN/ES helps for Belize) |
| Geocoding | Hierarchical DB match + interpolation | **Nominatim or Pelias + PostGIS**, seeded from OSM + any government cadastral data |
| Reverse geocoding | Polygon lookup + fallback | **PostGIS point-in-polygon** on admin boundaries, road-snap interpolation fallback |
| POI search/autocomplete | Proprietary (inferred ES/Solr-class) | **Typesense or Meilisearch** |
| Category system | Kakao's 18-code enum / Naver's freeform string | Custom small enum mapped from OSM `amenity=*`/`shop=*` tags |
| Dedup/entity resolution | Undocumented internal pipelines | `pg_trgm` similarity + geo-distance threshold + manual review queue |

**Note on gaps**: Naver's own Local Search API doc page could not be fetched directly; those fields were reconstructed from secondary sources. Naver/Kakao's internal search-engine tech and dedup/closure pipelines are not publicly documented — flagged as inferred throughout.
