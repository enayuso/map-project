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
    -- Street furniture: OSM tags these the same way it tags real places, so
    -- they pass the 'has a name' check above whenever a contributor copies
    -- the tag itself into the name (amenity=bench name=bench, etc. — this is
    -- exactly how two such nodes made it into search once before: confirmed
    -- via a live search-history entry that traced back to these tags, though
    -- by the time this filter was added the live index had already moved on
    -- from that snapshot and the two nodes' name fields had since been
    -- cleared upstream in OSM). None of these are things a user would ever
    -- search for or navigate to, unlike e.g. a named 'Purified Drinking
    -- Water Refill' shop or 'Orange Walk Clock' landmark — both of which use
    -- amenity tags from this same 'street furniture' family (drinking_water,
    -- clock) but carry real, specific names and so are deliberately NOT
    -- excluded here; only tags with zero legitimately-named uses in Belize's
    -- current OSM data are listed.
    -- lower(trim(...)), not a plain NOT IN — amenity values are free-text
    -- contributor input, and 'Bench' or 'bench ' (stray case/whitespace)
    -- would otherwise sail through this exact exclusion list undetected,
    -- reproducing the same junk this filter exists to catch. Found in
    -- review, applied defensively even though no current row in this
    -- extract actually has such a variant (checked directly).
    AND (amenity IS NULL OR lower(trim(amenity)) NOT IN (
      'bench', 'waste_basket', 'waste_disposal', 'recycling',
      'bicycle_parking', 'bicycle_repair_station', 'fire_hydrant',
      'telephone', 'grit_bin'
    ))
) TO STDOUT WITH (FORMAT csv, HEADER true)
" > "$CSV_PATH"

echo "==> Building and loading the Typesense index..."
python3 "$ROOT_DIR/scripts/build_poi_index.py" "$CSV_PATH"
