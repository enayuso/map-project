#!/usr/bin/env bash
# Full Phase 2 POI-index pipeline: export named POI points from PostGIS,
# categorize them, and (re)load them into Typesense.
# Requires: backend/ (PostGIS) and search/ (Typesense) stacks both running.
#
# This rebuilds the collection from scratch (OSM only). To also merge in
# Overture Maps' supplementary POI data afterwards, run
# `python3 scripts/merge_overture_places.py` right after this script finishes
# — see search/README.md's "Optional supplement: Overture Maps" section for
# the one-time setup and why. Order matters: this script drops and recreates
# the collection, so the Overture merge must always come after, never before.
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
