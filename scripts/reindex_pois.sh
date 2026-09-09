#!/usr/bin/env bash
# Full Phase 2 POI-index pipeline: export named POI points from PostGIS,
# categorize them, and (re)load them into Typesense.
# Requires: backend/ (PostGIS) and search/ (Typesense) stacks both running.
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

echo "==> Building and loading the Typesense index..."
python3 "$ROOT_DIR/scripts/build_poi_index.py" "$CSV_PATH"
