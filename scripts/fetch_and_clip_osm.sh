#!/usr/bin/env bash
# Phase 0: download the Belize OSM extract and clip it to the pilot-region bounding boxes.
# Requires: osmium-tool (brew install osmium-tool)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RAW_DIR="$ROOT_DIR/data/raw"
PILOT_DIR="$ROOT_DIR/data/pilot"

mkdir -p "$RAW_DIR" "$PILOT_DIR"

echo "==> Downloading latest Belize OSM extract from Geofabrik..."
curl -sL --fail -o "$RAW_DIR/belize-latest.osm.pbf" \
  https://download.geofabrik.de/central-america/belize-latest.osm.pbf

echo "==> Clipping to pilot regions..."
# Belize City
osmium extract -b -88.30,17.44,-88.13,17.56 \
  "$RAW_DIR/belize-latest.osm.pbf" -o "$PILOT_DIR/belize-city.osm.pbf" --overwrite

# Ambergris Caye / San Pedro
osmium extract -b -88.05,17.83,-87.75,18.20 \
  "$RAW_DIR/belize-latest.osm.pbf" -o "$PILOT_DIR/ambergris-caye.osm.pbf" --overwrite

echo "==> Done. Files:"
ls -la "$RAW_DIR" "$PILOT_DIR"
