#!/usr/bin/env bash
# Phase 3 Track B: seed (or re-sync) the canonical `places` table from the
# current OSM import. Run this once to bootstrap `places`, and again any
# time after a fresh OSM re-import to pull in new/changed POIs (existing
# rows upsert in place, keyed on osm_id — see seed_places_from_osm.py).
#
# Requires: backend/ (PostGIS + PostgREST) running, places-schema.sql
# already applied (db_exec.sh psql -c "$(cat backend/places-schema.sql)").
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CSV_PATH="/tmp/pois_raw.csv"

echo "==> Exporting named POI points from PostGIS..."
"$ROOT_DIR/scripts/db_exec.sh" psql -A -F',' -c "
COPY (
  SELECT osm_id, COALESCE(name,''), COALESCE(amenity,''), COALESCE(shop,''), COALESCE(tourism,''),
         ST_Y(ST_Transform(way,4326)), ST_X(ST_Transform(way,4326))
  FROM planet_osm_point
  WHERE (amenity IS NOT NULL OR shop IS NOT NULL OR tourism IS NOT NULL)
    AND name IS NOT NULL AND name <> ''
) TO STDOUT WITH (FORMAT csv, HEADER true)
" > "$CSV_PATH"

echo "==> Categorizing and upserting into places (via PostgREST)..."
python3 "$ROOT_DIR/scripts/seed_places_from_osm.py" "$CSV_PATH"

echo "==> Done. Run scripts/reindex_pois.sh next to refresh Typesense from places."
