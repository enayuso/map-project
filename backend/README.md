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
