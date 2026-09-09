#!/usr/bin/env bash
# Fixes the "sea renders as beige background, not blue water" gap: OSM's raw
# coastline data (natural=coastline ways) exists in our extract, but
# osm2pgsql's classic import (see backend/README.md) never assembles ways
# into closed polygons — that's a deliberate omission upstream, since doing
# it correctly needs the *whole planet's* coastline (a country's coastline
# ring is closed using the neighboring country's land border, not just the
# extract's own bounding box — confirmed by testing: running osmcoastline
# directly on our small Belize extract produced a polygon that incorrectly
# classified all of mainland Belize as "water" too, exactly because of this).
#
# Fix: use the community-maintained, pre-assembled global water polygon
# dataset (https://osmdata.openstreetmap.de/data/water-polygons.html, ODbL —
# same license as the rest of our OSM-derived data, ~900MB download), clipped
# down to just Belize's area, loaded as its own `water_polygons` table.
#
# Requires: gdal (ogr2ogr) - `brew install gdal` if not already present
# (osmcoastline pulls it in as a dependency too, though we don't need
# osmcoastline itself for this approach).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRATCH_DIR="$(mktemp -d)"
trap 'rm -rf "$SCRATCH_DIR"' EXIT

# Belize's own OSM extract's bounding box (from `osmium fileinfo -e
# data/raw/belize-latest.osm.pbf`), with a small buffer so nothing near the
# edge - the barrier reef, the outer cayes - gets clipped off.
MINLON=-89.35; MINLAT=15.75; MAXLON=-86.75; MAXLAT=18.60

echo "==> Downloading global water polygons (ODbL, ~900MB - this takes a while)..."
curl -sL --fail -o "$SCRATCH_DIR/water-polygons-split-3857.zip" \
  https://osmdata.openstreetmap.de/download/water-polygons-split-3857.zip

echo "==> Unzipping..."
unzip -q "$SCRATCH_DIR/water-polygons-split-3857.zip" -d "$SCRATCH_DIR"

echo "==> Converting Belize's bbox to Web Mercator (the dataset's own CRS)..."
read -r X0 Y0 X1 Y1 <<< "$(python3 -c "
import math
def m(lon, lat):
    x = lon * 20037508.34 / 180
    y = math.log(math.tan((90 + lat) * math.pi / 360)) / (math.pi / 180) * 20037508.34 / 180
    return x, y
x0, y0 = m($MINLON, $MINLAT)
x1, y1 = m($MAXLON, $MAXLAT)
print(x0, y0, x1, y1)
")"

echo "==> Clipping to Belize's area..."
ogr2ogr -f GeoJSON "$ROOT_DIR/data/raw/belize_water.geojson" \
  "$SCRATCH_DIR/water-polygons-split-3857/water_polygons.shp" \
  -clipsrc "$X0" "$Y0" "$X1" "$Y1" -nlt PROMOTE_TO_MULTI

echo "==> Loading into PostGIS as water_polygons (via the docker-network"
echo "    workaround - see backend/README.md's Colima Postgres gotcha)..."
docker run --rm --network backend_default \
  -v "$ROOT_DIR/data:/data" \
  debian:bookworm-slim \
  bash -c "apt-get update -qq >/dev/null && apt-get install -y -qq gdal-bin >/dev/null 2>&1 && \
    ogr2ogr -f PostgreSQL 'PG:host=postgis port=5432 dbname=belize user=belize password=devpass123' \
      /data/raw/belize_water.geojson \
      -nln water_polygons -nlt PROMOTE_TO_MULTI -lco GEOMETRY_NAME=way -lco FID=osm_id -overwrite"

echo "==> Done. Now:"
echo "  1. Add a water_polygons entry to backend/martin-config.yaml (see the"
echo "     existing planet_osm_polygon entry for the format) and restart"
echo "     Martin: cd backend && docker compose restart martin"
echo "  2. Confirm it's published: curl http://127.0.0.1:3000/catalog | grep water_polygons"
echo "  3. The 'sea' layer in styles/basic.json (synced to"
echo "     mobile/src/styles/basic.json) reads from this table already -"
echo "     no style change needed on a re-run of this script."
