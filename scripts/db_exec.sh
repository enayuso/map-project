#!/usr/bin/env bash
# Run a command against the backend PostGIS database from INSIDE the Docker
# network (attaches to backend_default and talks to the "postgis" hostname).
#
# Why this exists: on this dev machine (Docker via Colima on macOS), the raw
# Postgres wire protocol breaks specifically over the host<->VM forwarded port
# (5433) — the TCP connection opens fine but password auth fails every time,
# even with correct credentials (confirmed: same credentials work perfectly
# when the client is inside the Docker network, e.g. Martin itself, or this
# script). HTTP traffic (e.g. to Martin's tile API on port 3000) is NOT
# affected — only Postgres's own wire protocol. This looks like a Colima
# networking quirk, not anything wrong with the database config.
#
# Practical effect: any tool that needs a *direct Postgres connection*
# (osm2pgsql, psql, ogr2ogr, etc.) should run through this wrapper rather than
# connecting to 127.0.0.1:5433 directly from the host.
#
# Usage:
#   scripts/db_exec.sh psql -c "select count(*) from planet_osm_point;"
#   scripts/db_exec.sh osm2pgsql --slim --hstore -H postgis -U belize -d belize /data/raw/belize-latest.osm.pbf
#
# Mounts the repo's data/ dir at /data inside the helper container, and always
# runs as the `belize` user against the `belize` db (via PGPASSWORD/-H/-U/-d
# already baked in for psql; osm2pgsql needs -H postgis -U belize -d belize
# passed explicitly as shown above since it doesn't read a service file here).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

docker run --rm --network backend_default \
  -e PGPASSWORD=devpass123 \
  -e PGHOST=postgis -e PGPORT=5432 -e PGUSER=belize -e PGDATABASE=belize \
  -v "$ROOT_DIR/data:/data" \
  debian:bookworm-slim \
  bash -c "apt-get update -qq >/dev/null && apt-get install -y -qq osm2pgsql postgresql-client >/dev/null 2>&1; exec \"\$@\"" \
  _ "$@"
