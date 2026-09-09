#!/usr/bin/env bash
# Quick smoke test for the Phase 4 Valhalla routing service.
# Requires: routing/docker-compose.yml stack running (see routing/README.md).
set -euo pipefail

BASE="http://127.0.0.1:8002"
BELIZE_CITY='{"lat": 17.4995, "lon": -88.1962}'
FORT_GEORGE='{"lat": 17.4975, "lon": -88.1839}'
SAN_IGNACIO='{"lat": 17.1560, "lon": -89.0670}'
SAN_PEDRO='{"lat": 17.9146, "lon": -87.9614}'

route() {
  local from="$1" to="$2" costing="$3" label="$4"
  echo "=== $label ($costing) ==="
  curl -sS --max-time 20 "$BASE/route" -X POST -H "Content-Type: application/json" -d "{
    \"locations\": [$from, $to],
    \"costing\": \"$costing\"
  }" | python3 -c "
import json, sys
d = json.load(sys.stdin)
if 'trip' in d:
    s = d['trip']['summary']
    print(f\"  distance: {s['length']} km | time: {round(s['time']/60, 1)} min | ferry: {s.get('has_ferry', False)}\")
else:
    print('  ', json.dumps(d))
"
  echo
}

echo "=== status ==="
curl -sS --max-time 10 "$BASE/status" | python3 -m json.tool
echo

route "$BELIZE_CITY" "$FORT_GEORGE" "auto" "Within Belize City"
route "$BELIZE_CITY" "$FORT_GEORGE" "pedestrian" "Within Belize City"
route "$BELIZE_CITY" "$FORT_GEORGE" "bicycle" "Within Belize City"
route "$BELIZE_CITY" "$SAN_IGNACIO" "auto" "Belize City -> San Ignacio (cross-country)"
route "$BELIZE_CITY" "$SAN_PEDRO" "auto" "Belize City -> San Pedro (island, expects ferry)"

echo "=== Map matching: GPS trace along Queen Street ==="
curl -sS --max-time 15 "$BASE/trace_route" -X POST -H "Content-Type: application/json" -d '{
  "shape": [
    {"lat": 17.4966, "lon": -88.1858},
    {"lat": 17.4970, "lon": -88.1850},
    {"lat": 17.4974, "lon": -88.1842}
  ],
  "costing": "auto",
  "shape_match": "map_snap"
}' | python3 -c "
import json, sys
d = json.load(sys.stdin)
for m in d['trip']['legs'][0]['maneuvers']:
    print('  -', m.get('instruction'))
"
