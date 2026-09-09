# Research: Map Rendering Pipeline & Tile Serving

*Part of the "지도" (Belize map app) research series. See [../RESEARCH-SUMMARY.md](../RESEARCH-SUMMARY.md) for the executive synthesis and [../PLAN.md](../PLAN.md) for the build plan.*

---

## 1. Coordinate Systems & Projections

**Web Mercator (EPSG:3857)** is the de facto global standard: it projects WGS84 lat/lng onto a square, letting the world be recursively quartered into a **tile pyramid** — at zoom `z` the world is `2^z × 2^z` tiles, each addressed by `{z}/{x}/{y}`, traditionally **256×256px** (retina/vector renderers commonly use logical 512px tiles rendered at 2x). Documented canonically in the OSM wiki's "Slippy map tilenames" / "Zoom levels" pages.

**Korea's local systems**: Korea's official grid is **Korea 2000 / Unified CS (EPSG:5179, UTM-K)**, successor to older Bessel-ellipsoid TM systems. ([OSGeo Korea](https://www.osgeo.kr/17), [GIS Developer](http://www.gisdeveloper.co.kr/?p=8942))

**Naver's approach (officially documented)**: Maps API v3 exposes `coord` (WGS84), `point` (internal normalized world coord), and `offset` (CSS pixel) to developers. Internally the *legacy* tile system used a modified UTM-K variant (`UTMK_NAVER`) — confirmed in Naver's own [Projection tutorial](https://navermaps.github.io/maps.js.ncp/docs/tutorial-Projection.html). Naver's newer **"StyleMap"** tiles explicitly switched to standard **EPSG:3857 Web Mercator** ([신규 맵 타일 소개](https://navermaps.github.io/maps.js.ncp/docs/tutorial-StyleMap-1.html)) — an example of a Korean provider migrating from a bespoke local projection to the industry-standard Mercator grid for interop with modern vector-tile tooling.

**Kakao's approach**: SDK/API expose only WGS84 publicly; internal projection details are not documented (inference gap).

**Implication for Belize:** Just use EPSG:3857/WGS84 throughout — no reason to invent a local TM grid the way Korea historically did for cadastral-precision reasons. Standard 256/512px tiles, zoom 0–16 is plenty for a country Belize's size.

---

## 2. Raster vs Vector Tiles

**Raster tiles**: pre-rendered PNG/JPG/WebP per `{z}/{x}/{y}` — simple to serve, but style baked in at generation time, heavier bandwidth, no runtime re-theming.

**Vector tiles** (Mapbox Vector Tile spec, MVT — protobuf-encoded geometry + attributes, `.pbf`/`.mvt`): client applies a style spec at render time — enables re-theming without re-download, smooth GPU rotation/tilt, smaller payloads, zoom-reactive label/POI filtering. ([Mapbox vector-tile-spec](https://github.com/mapbox/vector-tile-spec), [Mapbox docs](https://docs.mapbox.com/data/tilesets/guides/vector-tiles-introduction/))

**Naver/Kakao status (mixed, partly inferred)**:
- **Kakao Map**: calls itself a "vector map," but independent teardown (Clien forum analysis via NamuWiki) shows the **web version still serves 256px raster PNG tiles** with rotation/zoom *animation* layered on top — pixelation persists under rotation, diagnostic of a raster base. The **mobile app reportedly switched to genuine vector tiles ~2022**. Not confirmed by an official Kakao engineering post.
- **Naver Map**: legacy `MapTypeId.NORMAL/SATELLITE/HYBRID/TERRAIN` are explicitly raster (`ImageMapType`/`getTile`, per [official docs](https://navermaps.github.io/maps.js.ncp/docs/tutorial-MapTypes.html)). The newer "StyleMap" product (NCP's "Web Dynamic Map API" + Map Style Editor) moves toward client-styleable rendering.
- **Update (2026-09-09)**: this "no engineering deep-dive" gap is now partly closed — see [07-naver-kakao-proprietary-gis.md](07-naver-kakao-proprietary-gis.md). Kakao Mobility's own engineering blog describes Kakao Navi's rendering SDK (KNMSDK) in real technical depth: a shared C++ core, a custom graphics abstraction over Metal/Vulkan/OpenGL ES, and — notably — **FlatBuffers rather than MVT/protobuf** for their tile format. Naver's rendering internals remain largely undisclosed beyond the coordinate-system migration noted above.

**Implication for Belize:** Vector tiles (MVT) are the correct default — one pipeline serves day/night/satellite-label-only/print styles from the same data, which matters when data volume and dev budget are both small. Raster is only worth keeping for the satellite-imagery layer itself (inherently raster/orthophoto).

---

## 3. Server-Side Tile Generation Pipeline

**Classic raster stack** (OSM.org reference): OSM data → `osm2pgsql` → **PostGIS** → **Mapnik** (CartoCSS via `carto`) → `renderd` (metatile batching) → `mod_tile` (Apache module, disk cache) → CDN. ([openstreetmap/mod_tile](https://github.com/openstreetmap/mod_tile))

**Modern vector stack, two flavors:**
- **Static/batch**: PostGIS layers → GeoJSON/flatgeobuf → **Tippecanoe** builds a zoom pyramid into a single **MBTiles** (SQLite) file, with automatic simplification/feature-dropping per zoom. **OpenMapTiles** defines the widely-adopted open schema (layer names, zoom-based generalization rules) most self-hosted MVT stacks reuse. ([tippecanoe README](https://github.com/mapbox/tippecanoe/blob/master/README.md), [OpenMapTiles schema](https://openmaptiles.org/schema/))
- **Dynamic/on-the-fly**: **tegola**, **Martin**, or **pg_tileserv** query PostGIS live and emit MVT per request. Benchmarks found **Martin fastest** (Rust, uses PostGIS's native `ST_AsMVT`), pg_tileserv close behind, tegola slowest. ([comparison](https://dev.to/mierune/comparing-postgis-backend-vectortile-servers-tegolamartinpgtileserv-5c6n))

**Naver/Kakao infra specifics**: no public Naver D2 or Kakao tech blog post describing tile-generation/serving infra was found at the time this section was written — a genuine disclosure gap, not to be assumed to mirror the OSM/Mapbox stack. **Update**: [07-naver-kakao-proprietary-gis.md](07-naver-kakao-proprietary-gis.md) found that Kakao Mobility's own backend for integrating address/building/land data runs on plain **PostgreSQL with PostGIS-style spatial joins** — the tile-*generation* pipeline specifically is still undisclosed, but the underlying spatial database is not some more sophisticated proprietary system, it's the same class of tool this project already uses.

**Implication for Belize:** A **static Tippecanoe → MBTiles** pipeline is almost certainly the right economical choice — Belize's entire OSM extract is tiny (a few hundred MB at most). Pre-bake one MBTiles per style/zoom-range, serve via **Martin** or **tileserver-gl** behind a CDN (even free-tier), and re-run Tippecanoe on a schedule (e.g., nightly) as data updates — no need to run a live PostGIS-backed dynamic server at Belize's scale.

---

## 4. Client-Side Rendering

Modern vector-tile clients (Mapbox GL JS/Native, **MapLibre GL JS/Native** — the community fork created after Mapbox's Dec-2020 license change, per [MapLibre FORK.md](https://github.com/maplibre/maplibre-native/blob/main/FORK.md)) parse MVT into GPU-friendly buffers and render with **WebGL** (browser) or **OpenGL ES/Metal** (native) — enabling 60fps pan/zoom/rotate/tilt since geometry lives on the GPU.

Rendering is organized by **layer buckets** (fill, line, circle, symbol/label, raster, hillshade); the **SymbolBucket** (labels/icons) is the most CPU-expensive part — every frame during interaction, a collision/placement algorithm hides overlapping labels. ([Mapbox Style Spec — Layers](https://docs.mapbox.com/style-spec/reference/layers/))

**LOD**: handled at (a) tile-generation time (different zoom bands pull generalized data / drop minor features), and (b) style time via zoom-based filter/interpolation expressions.

**Fonts/icons**: symbol layers pull glyphs as signed-distance-field font atlases (PBF) and icons from a sprite sheet (`sprite.png`+`sprite.json`, `@2x` for retina).

**Naver/Kakao specifics**: Kakao's Android SDK v2 requires OpenGL ES 2.0+ (confirms GPU rendering natively); community teardown suggests the web client's "vector-like" smoothness may be CSS/canvas animation over raster tiles rather than true WebGL — not officially confirmed.

**Implication for Belize:** **MapLibre GL JS** (web) + **MapLibre Native** (iOS/Android) is the direct, license-clean equivalent of what Mapbox/Kakao/Naver's modern SDKs do — same WebGL model, same style spec, same MVT input, zero licensing cost. This is what most "budget" national/regional map apps now use instead of building a renderer from scratch.

---

## 5. Map Styling & Theming

A **style** is a single JSON document (Mapbox Style Spec, now the de facto open standard MapLibre also consumes): `sources`, an ordered `layers` array (fill/line/circle/symbol/raster/background/hillshade), `paint` (visual) and `layout` (structural) properties, zoom-based expressions. Day/night/traffic/satellite are implemented as either separate style docs swapped at runtime, or a dynamic "light preset" within one style. ([Mapbox Style Spec](https://docs.mapbox.com/style-spec/reference/layers/))

**Traffic overlays**: typically a distinct thin vector/line layer colored by live congestion data, composited on the base style — Kakao's Web API exposes this as an explicit `addTrafficOverlay` sample. ([Kakao sample](https://apis.map.kakao.com/web/sample/addTrafficOverlay/))

**Naver/Kakao style customization**: NCP's "Web Dynamic Map API" ships a Map Style Editor for custom styling — evidence Naver moved toward a Mapbox-Style-Spec-like customizable model (format compatibility not confirmed).

**Implication for Belize:** A single OpenMapTiles-schema vector tileset can drive unlimited style variants (tourist map, satellite-hybrid, dark mode for night diving/boat use, etc.) just by swapping the style JSON client-side — no need to regenerate/re-host tiles per theme, the main economic win over raster for a small, low-budget deployment.

---

## 6. Offline / Caching Considerations

**MBTiles** (SQLite container, `tiles` table keyed by `zoom_level/tile_column/tile_row`, BLOBs = PNG/JPG raster or gzipped PBF/MVT vector, plus a `metadata` table) is the standard portable offline format, producible by Tippecanoe (vector) or GDAL (raster), consumable directly by MapLibre GL Native for offline packs.

**PMTiles** (single static file, HTTP range-request addressable, no server needed — just object storage/CDN) is an increasingly-used serverless alternative, supported by Martin among others.

**Mobile caching strategy** (general practice): rolling LRU disk cache of recently-viewed tiles keyed by `{z}/{x}/{y}` + style version, separate from any deliberate "download region for offline use" feature. No Naver/Kakao-specific documentation found on their offline implementation.

**Implication for Belize:** Given Belize is small, high-tourism, and sometimes low-connectivity (rural areas, dive sites, border regions), shipping a **pre-baked national MBTiles/PMTiles file bundled with the app**, refreshed periodically from the same Tippecanoe pipeline, is the cheapest and most user-friendly offline story — the whole country's vector data at reasonable zoom likely fits in tens of MB.

---

### Summary Table: Confirmed vs Inferred

| Topic | Naver | Kakao | Confidence |
|---|---|---|---|
| Public projection (WGS84 exposed) | Confirmed | Confirmed | High |
| Internal projection (legacy UTMK_NAVER) | Confirmed (official docs) | Not disclosed | Naver: high; Kakao: unknown |
| New tiles on EPSG:3857 | Confirmed (official) | Unknown | Naver: high |
| Raster legacy tiles | Confirmed | Confirmed (community teardown) | High |
| True vector rendering today | Inferred/partial | **Confirmed for Kakao Navi** (KNMSDK: C++ core, custom GPU abstraction) per [07-naver-kakao-proprietary-gis.md](07-naver-kakao-proprietary-gis.md); Kakao Map app itself still inferred | Kakao Navi: high (primary source); Kakao Map app: medium |
| Tile format | Not found publicly | **FlatBuffers**, not MVT/protobuf (KNMSDK) — see [07-naver-kakao-proprietary-gis.md](07-naver-kakao-proprietary-gis.md) | High for Kakao Navi |
| Tile generation/serving infra | Not found publicly | Backend spatial database confirmed as **PostgreSQL/PostGIS**; tile-*generation* pipeline itself still undisclosed | Medium (database layer); low (generation pipeline) |
| Offline caching implementation | Not found publicly | Not found publicly | Low |

### Recommended Belize Stack
OSM extract → **Tippecanoe** (MBTiles, OpenMapTiles schema) → **Martin** or **tileserver-gl** (serving) → CDN → **MapLibre GL JS/Native** (client) with swappable style JSONs (day/satellite/dark) and a bundled offline MBTiles/PMTiles for low-connectivity areas.
