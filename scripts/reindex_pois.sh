#!/usr/bin/env bash
# Full POI-index pipeline: export from the canonical `places` table (Phase 3
# Track B — not raw OSM directly, since Phase 2) and (re)load into Typesense.
# `places` is the source of truth; this script just mirrors it into
# Typesense's search-optimized shape, so edits/additions made via the
# PostgREST API survive a reindex instead of being silently overwritten.
# To pull in new/changed OSM data first, run scripts/seed_places_from_osm.sh
# before this.
# Requires: backend/ (PostGIS) and search/ (Typesense) stacks both running.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CSV_PATH="/tmp/pois_raw.csv"

echo "==> Exporting places from PostGIS..."
"$ROOT_DIR/scripts/db_exec.sh" psql -A -F',' -c "
COPY (
  SELECT id, name, category, COALESCE(source, ''),
         ST_Y(geom), ST_X(geom)
  FROM places
) TO STDOUT WITH (FORMAT csv, HEADER true)
" > "$CSV_PATH"

echo "==> Building and loading the Typesense index..."
python3 "$ROOT_DIR/scripts/build_poi_index.py" "$CSV_PATH"
