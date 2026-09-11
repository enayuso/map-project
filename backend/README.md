# Backend (Phase 1): PostGIS + Martin

The canonical geodata store (PostGIS, reused by later phases for geocoding/routing too) plus Martin, which serves vector tiles straight from it — no separate Tippecanoe/MBTiles bake step needed at this data size (see [docs/PLAN.md](../docs/PLAN.md) Phase 1 for why).

## Start it

```bash
cd backend
docker compose up -d
```

This starts:
- **`belize-postgis`** — PostGIS 16/3.4, exposed on host port **5433** (not 5432 — see gotcha below)
- **`belize-martin`** — tile server, exposed on host port **3000**, configured via [`martin-config.yaml`](martin-config.yaml) to publish only our own tables (not PostGIS's bundled `tiger` geocoder demo schema)

Check it's up:
```bash
curl http://127.0.0.1:3000/catalog
```

**Credentials**: `POSTGRES_PASSWORD` defaults to a dev-only value (`devpass123`) baked into `docker-compose.yml` — fine as-is for local dev, but copy [`.env.example`](.env.example) to `.env` and set a real value before this ever runs anywhere beyond this machine (`.env` is gitignored, and `docker-compose.yml` picks it up automatically via `${POSTGRES_PASSWORD:-devpass123}`). If you do, `sharing/.env`'s `DB_PASSWORD` needs the same value — see [sharing/README.md](../sharing/README.md#hardening-2026-09-11).

## Load data

The database starts empty. Import an OSM extract with `osm2pgsql` — but **use the wrapper script, not a host-installed `osm2pgsql` directly** (see gotcha below):

```bash
# one-time: enable the hstore extension (already done for the current volume)
docker exec belize-postgis psql -U belize -d belize -c "CREATE EXTENSION IF NOT EXISTS hstore;"

../scripts/db_exec.sh osm2pgsql --slim --hstore -H postgis -U belize -d belize /data/raw/belize-latest.osm.pbf
```

This creates the classic osm2pgsql schema: `planet_osm_point`, `planet_osm_line`, `planet_osm_polygon`, `planet_osm_roads` — each with the common OSM tags as columns plus a catch-all `tags` hstore column for everything else.

## ⚠️ Known gotcha: direct Postgres connections from the host fail

On this dev machine (Docker via **Colima** on macOS), the raw Postgres wire protocol is broken specifically over the host↔VM forwarded port: TCP connects fine, but password auth fails every single time — even with verified-correct credentials. Confirmed this is a Colima networking quirk, not a credentials or config problem:

- Martin (running *inside* the Docker network) connects to the same database with the same credentials with zero issues.
- A throwaway container attached to `backend_default` (i.e. `docker run --network backend_default ...`) connects fine too.
- Only clients running directly on the macOS host, hitting the published port (`127.0.0.1:5433`), fail — with both wrong *and* right passwords, which is what gives it away as a transport bug rather than an auth bug.
- **HTTP is unaffected** — Martin's tile API on port 3000 works fine from the host, which is what actually matters for the mobile app talking to it.

**Practical fix**: anything that needs a direct Postgres connection (`osm2pgsql`, `psql`, `ogr2ogr`, future geocoding scripts, etc.) should run through **[`scripts/db_exec.sh`](../scripts/db_exec.sh)**, which runs the command inside a throwaway container on the Docker network instead of connecting from the host. Example:

```bash
../scripts/db_exec.sh psql -c "select count(*) from planet_osm_roads;"
```

If this gets fixed upstream (or the dev setup moves to Docker Desktop / a Linux host where this doesn't happen), the wrapper can be dropped and tools can connect straight to `127.0.0.1:5433` again.

## Tile URLs

Martin serves each table as `/{table_name}/{z}/{x}/{y}`, e.g.:

```
http://127.0.0.1:3000/planet_osm_line/14/4177/7382
http://127.0.0.1:3000/planet_osm_polygon/14/4177/7382
http://127.0.0.1:3000/planet_osm_point/14/4177/7382
http://127.0.0.1:3000/planet_osm_roads/14/4177/7382
```

Full catalog (with TileJSON metadata per source): `http://127.0.0.1:3000/catalog`.

## Regenerating `martin-config.yaml`

If you re-import with different osm2pgsql options (different columns/tables), regenerate the table definitions:

```bash
docker exec -e DATABASE_URL="postgres://belize:devpass123@postgis:5432/belize" \
  belize-martin martin --save-config /tmp/out.yaml postgres://belize:devpass123@postgis:5432/belize
docker cp belize-martin:/tmp/out.yaml /tmp/out.yaml
```

Then copy just the `planet_osm_*` stanzas from `/tmp/out.yaml`'s `tables:` section into `martin-config.yaml` (leave out anything under the `tiger` schema).

## `water_polygons` — the sea/ocean layer

Not part of the standard osm2pgsql import above — it's loaded separately by [`scripts/import_water_polygons.sh`](../scripts/import_water_polygons.sh).

**Why it's separate**: OSM tags coastline as *lines* (`natural=coastline` ways tracing the shore), not as a ready-made "ocean" polygon — there's no `natural=water` polygon for the sea itself anywhere in the raw data. Rendering the sea as water requires assembling those lines into closed polygons, which osm2pgsql's classic import doesn't do (confirmed: `planet_osm_line` has zero `natural=coastline` rows after import, even though the raw `.osm.pbf` has 2,202 of them — osm2pgsql's default style filters the tag out on purpose, since polygon assembly needs dedicated tooling).

We tried the obvious dedicated tool (`osmcoastline`) directly on our own small Belize extract first, and it produced **wrong** results: it classified all of mainland Belize as water. Root cause: a country's coastline only forms a closed ring with help from its *land borders* with neighboring countries (Mexico, Guatemala) — data that isn't `natural=coastline`-tagged and isn't in our extract at all, so there's nothing for `osmcoastline`'s bounding-box-closing heuristic to close the ring against correctly. This is a known limitation of assembling coastline polygons from a small regional extract in isolation, not a bug in our command usage.

**What actually works**: the community-maintained [pre-assembled global water polygon dataset](https://osmdata.openstreetmap.de/data/water-polygons.html) (ODbL, same license as the rest of our OSM data) — generated from the *full planet* file, so it has correct land-border context everywhere, Belize included. `scripts/import_water_polygons.sh` downloads it (~900MB, one-time), clips it down to just Belize's area, and loads the small result (~9MB, 7 polygon features) as its own `water_polygons` table — verified with point-in-polygon checks against a real Ambergris Caye business address (correctly on land) and a point in the open Caribbean (correctly water) before wiring it into Martin/the style.

After running the script, add a `water_polygons` entry to `martin-config.yaml` (same shape as `planet_osm_polygon`, `geometry_type: MULTIPOLYGON`) and `docker compose restart martin`.

## `satellite` — the satellite/hybrid basemap

The only raster (not vector) tile source here, and the only one not backed by PostGIS at all — Martin serves it straight from a pre-baked MBTiles file (`data/satellite/belize_satellite.mbtiles`, gitignored like the rest of `data/`, built by [`scripts/build_satellite_mosaic.sh`](../scripts/build_satellite_mosaic.sh)). Martin's `mbtiles.sources` config just passes the stored WebP tile bytes straight through — no rendering happens on our side, same as how it passes through PostGIS-rendered vector tiles.

**Data**: Sentinel-2 L2A true-color ("visual"/TCI) imagery, sourced from the free, public, no-registration-needed AWS Open Data `sentinel-cogs` bucket (Cloud-Optimized GeoTIFFs) via [Element84's Earth Search STAC API](https://earth-search.aws.element84.com/v1) — not the older `sentinel-s2-l2a` JP2 bucket, which became requester-pays years ago; `sentinel-cogs` is a separate, still-genuinely-open bucket built specifically to keep this data freely accessible. Sentinel data itself is Copernicus/ESA open data, free with commercial use explicitly permitted (`docs/PLAN.md`'s Locked Decision 3) — attribution: "Contains modified Copernicus Sentinel data 2026".

Belize spans ~20 Sentinel-2 MGRS tiles (100km × 100km each, 200-350MB as Cloud-Optimized GeoTIFFs). The build script picks the lowest-cloud-cover scene per tile (nearly all came back 0-1% cloud from a Feb 2026 dry-season window) and mosaics them with `gdalwarp` reading each one via `/vsicurl/` — GDAL's HTTP-range-request support means only the small Belize-relevant window of each 200-350MB file is actually fetched, not the whole thing (confirmed: a single-tile test clip pulled ~7MB in 9 seconds, not the full 220MB source).

**Known limitation**: tile seams are visible in open ocean between some scenes — each Sentinel-2 scene has its own independent exposure/atmospheric correction, so brightness doesn't always match exactly at tile boundaries over deep water. Land, coastal towns, and inhabited cayes (where this actually matters for a road map) look correct and seamless; only the deep-ocean background between scenes shows the mismatch. Professional cloudless-mosaic services (e.g. EOX's Sentinel-2 cloudless) solve this with color-harmonization across scenes — a fair amount more work than a per-tile "pick lowest cloud cover" pass, not done here for a v1.

**Zoom range**: built for zoom 9-14 only, not 0-14 — `mobile/App.tsx`'s `MIN_ZOOM` is 9 (see its own zoomed-out-UX comment), so there's no reachable use for lower-zoom overview tiles. Native resolution (~10m/pixel) caps out at zoom 14; MapLibre upscales past that like any other capped tile source.

Re-running `scripts/build_satellite_mosaic.sh` (e.g. for fresher/less cloudy imagery later) overwrites `data/satellite/belize_satellite.mbtiles` in place — no `martin-config.yaml` change needed, just `docker compose restart martin`.

## `fonts` — self-hosted map-label glyphs

Martin has its own built-in font source (`-f/--font`, config's `fonts:` block) that we'd never used until this fixed a real crash: `styles/*.json`'s `glyphs` field used to point at `https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf` (MapLibre's own demo tile server — never meant as a public font CDN), which triggers an uncaught `std::regex_error` inside maplibre-native's offline-pack download code ([maplibre-native#4403](https://github.com/maplibre/maplibre-native/issues/4403)), aborting the whole app 100% of the time. Live map rendering was unaffected (different, non-buggy code path) — only `OfflineManager.createPack()` hit it.

Fix: self-host the two fonts our styles actually reference (`Noto Sans Regular`/`Bold` — grep `styles/*.json`'s `text-font` arrays if that ever changes) via `scripts/download_fonts.sh`, which fetches them (SIL OFL-licensed, from the upstream [notofonts/noto-fonts](https://github.com/notofonts/noto-fonts) project — not Google's fonts mirror, which only ships variable fonts, whose name-table strings don't reliably resolve to a static "Bold"/"Regular" fontstack name the way Martin's font source expects) into `data/fonts/` (gitignored like the rest of `data/`, regenerable by the script). `styles/*.json`'s `glyphs` now reads `http://127.0.0.1:3000/font/{fontstack}/{range}` — Martin's own canonical (non-redirecting) glyph-serving path, confirmed via a direct `curl` before wiring it in.

Run `scripts/download_fonts.sh` once (part of first-time backend setup, alongside building the satellite mosaic), then `docker compose restart martin` to pick the fonts up — Martin logs `Configured font font.name=Noto Sans Regular ...` on startup when it finds them.
