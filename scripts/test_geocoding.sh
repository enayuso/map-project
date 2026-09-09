#!/usr/bin/env bash
# Quick smoke test for the Phase 2 Nominatim geocoding service.
# Requires: geocoding/docker-compose.yml stack running (see geocoding/README.md).
set -euo pipefail

BASE="http://127.0.0.1:8082"

echo "=== status ==="
curl -sS --max-time 10 "$BASE/status"; echo

echo -e "\n=== search: Belize City ==="
curl -sS --max-time 15 "$BASE/search?q=Belize+City&format=json&limit=3" | python3 -m json.tool

echo -e "\n=== search: San Pedro, Belize (should disambiguate the Ambergris Caye town) ==="
curl -sS --max-time 15 "$BASE/search?q=San+Pedro,+Belize&format=json&limit=3" | python3 -m json.tool

echo -e "\n=== reverse: a point in Belize City ==="
curl -sS --max-time 15 "$BASE/reverse?lat=17.4995&lon=-88.19&format=json" | python3 -m json.tool

echo -e "\n=== reverse: a point on Ambergris Caye ==="
curl -sS --max-time 15 "$BASE/reverse?lat=17.9146&lon=-87.9614&format=json" | python3 -m json.tool
