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
