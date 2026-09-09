#!/usr/bin/env bash
# Builds the satellite/hybrid basemap layer: a cloud-free Sentinel-2 true-
# color mosaic of Belize, baked into an MBTiles raster tile pyramid that
# Martin serves directly (see backend/martin-config.yaml's "satellite"
# source and styles/hybrid.json's "satellite" layer).
#
# Data source: Sentinel-2 L2A "visual" (TCI, true-color) product, via the
# AWS Open Data "sentinel-cogs" bucket (Cloud-Optimized GeoTIFFs) - free,
# public, no AWS account/API key needed, no registration. This is a
# DIFFERENT, still-open bucket from the older "sentinel-s2-l2a" JP2 bucket,
# which went requester-pays years ago; sentinel-cogs was built specifically
# to keep Sentinel-2 freely and publicly accessible. Sentinel data itself is
# Copernicus/ESA open data (free, commercial use explicitly permitted, per
# docs/PLAN.md's Locked Decision 3) - attribution: "Contains modified
# Copernicus Sentinel data [year]".
#
# Discovered via Element84's public Earth Search STAC API
# (https://earth-search.aws.element84.com/v1) - no auth needed either.
#
# Requires: gdal (brew install gdal). Belize spans ~20 Sentinel-2 MGRS
# tiles; each is a ~100km x 100km, 200-350MB Cloud-Optimized GeoTIFF, but
# gdalwarp reads them via /vsicurl/ (HTTP range requests), so only the
# small Belize-relevant window of each is actually fetched - not the whole
# planet-scale files.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRATCH_DIR="$(mktemp -d)"
trap 'rm -rf "$SCRATCH_DIR"' EXIT

# Same bbox (with margin) as scripts/import_water_polygons.sh, so the
# satellite layer and the sea layer cover exactly the same area.
MINLON=-89.35; MINLAT=15.75; MAXLON=-86.75; MAXLAT=18.60
CLOUD_MAX=20
DATE_RANGE="2025-01-01T00:00:00Z/2026-06-30T23:59:59Z"

echo "==> Finding the lowest-cloud-cover Sentinel-2 scene per tile over Belize..."
curl -s -X POST "https://earth-search.aws.element84.com/v1/search" \
  -H "Content-Type: application/json" \
  -d "{
    \"collections\": [\"sentinel-2-l2a\"],
    \"bbox\": [$MINLON, $MINLAT, $MAXLON, $MAXLAT],
    \"datetime\": \"$DATE_RANGE\",
    \"query\": {\"eo:cloud_cover\": {\"lt\": $CLOUD_MAX}},
    \"limit\": 300,
    \"fields\": {\"include\": [\"properties.eo:cloud_cover\", \"properties.mgrs:grid_square\", \"properties.mgrs:utm_zone\", \"properties.mgrs:latitude_band\", \"assets.visual.href\"]}
  }" > "$SCRATCH_DIR/search.json"

python3 -c "
import json
d = json.load(open('$SCRATCH_DIR/search.json'))
print(f'Matched {d[\"context\"][\"matched\"]} scenes', file=__import__('sys').stderr)
tiles = {}
for f in d['features']:
    p = f['properties']
    tile = f'{p[\"mgrs:utm_zone\"]}{p[\"mgrs:latitude_band\"]}{p[\"mgrs:grid_square\"]}'
    cc = p['eo:cloud_cover']
    if tile not in tiles or cc < tiles[tile][0]:
        tiles[tile] = (cc, f['assets']['visual']['href'])
for tile, (cc, href) in sorted(tiles.items()):
    print(f'/vsicurl/{href}')
" > "$SCRATCH_DIR/tile_list.txt"

n_tiles=$(wc -l < "$SCRATCH_DIR/tile_list.txt")
echo "==> Using $n_tiles tiles (see $SCRATCH_DIR/tile_list.txt for the list)"

echo "==> Mosaicking + reprojecting to Web Mercator (this takes a while - ~15 min last run)..."
# shellcheck disable=SC2046
gdalwarp \
  -t_srs EPSG:3857 \
  -te_srs EPSG:4326 -te "$MINLON" "$MINLAT" "$MAXLON" "$MAXLAT" \
  -r cubic \
  -co COMPRESS=DEFLATE -co PREDICTOR=2 -co TILED=YES -co BIGTIFF=YES \
  -wm 512 -multi \
  -srcnodata 0 -dstnodata 0 \
  -overwrite \
  $(cat "$SCRATCH_DIR/tile_list.txt") \
  "$SCRATCH_DIR/belize_satellite_mosaic.tif"

echo "==> Converting to MBTiles (WebP, zoom 14 = native ~10m resolution)..."
gdal_translate -of MBTILES \
  -co TILE_FORMAT=WEBP -co QUALITY=75 \
  -a_nodata 0 \
  "$SCRATCH_DIR/belize_satellite_mosaic.tif" \
  "$SCRATCH_DIR/belize_satellite.mbtiles"

echo "==> Building overview zoom levels down to 9 (mobile/App.tsx's MIN_ZOOM -"
echo "    the app can't zoom out further, so there's no point going lower)..."
gdaladdo -r average "$SCRATCH_DIR/belize_satellite.mbtiles" 2 4 8 16 32

mkdir -p "$ROOT_DIR/data/satellite"
cp "$SCRATCH_DIR/belize_satellite.mbtiles" "$ROOT_DIR/data/satellite/belize_satellite.mbtiles"

echo "==> Done: $ROOT_DIR/data/satellite/belize_satellite.mbtiles ($(du -h "$ROOT_DIR/data/satellite/belize_satellite.mbtiles" | cut -f1))"
echo "    Restart Martin to pick it up: cd backend && docker compose up -d martin"
echo "    (martin-config.yaml's mbtiles.sources.satellite already points at it -"
echo "    no config change needed on a re-run of this script.)"
