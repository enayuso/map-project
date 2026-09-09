#!/usr/bin/env python3
"""
Phase 3 Track B: seed (or re-sync) the canonical `places` table from the
current OSM import, via the PostgREST write API (places-schema.sql).

Reuses build_poi_index.py's categorize() function directly rather than
duplicating the AMENITY_MAP/SHOP_MAP/TOURISM_MAP taxonomy — one taxonomy,
not two that can drift apart.

Safe to re-run: upserts on osm_id (PostgREST's on_conflict=osm_id, backed
by places.places_osm_id_unique_idx), so re-running after a fresh OSM
re-import updates existing OSM-seeded rows in place rather than duplicating
them. Never touches rows with osm_id IS NULL (app-created places) — those
aren't part of this INSERT's conflict target at all.
"""

import csv
import json
import sys
import urllib.request
from datetime import date

sys.path.insert(0, "/".join(__file__.split("/")[:-1]))
from build_poi_index import categorize  # noqa: E402

POSTGREST_URL = "http://127.0.0.1:3001"


def load_places(csv_path: str) -> list[dict]:
    today = date.today().isoformat()
    places = []
    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        header = next(reader)
        for row in reader:
            osm_id, name, amenity, shop, tourism, lat, lon = row
            category, osm_tag = categorize(amenity, shop, tourism)
            places.append({
                "osm_id": int(osm_id),
                "name": name,
                "category": category,
                "geom": f"SRID=4326;POINT({lon} {lat})",
                "verification_status": "osm_import",
                "source": f"OSM import ({today}), {osm_tag}",
            })
    return places


def upsert(places: list[dict]) -> None:
    body = json.dumps(places).encode()
    req = urllib.request.Request(
        f"{POSTGREST_URL}/places?on_conflict=osm_id",
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
    )
    try:
        with urllib.request.urlopen(req) as resp:
            print(f"Upserted {len(places)} places (HTTP {resp.status}).")
    except urllib.error.HTTPError as e:
        print(f"FAILED: HTTP {e.code}: {e.read().decode()}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    csv_path = sys.argv[1] if len(sys.argv) > 1 else "/tmp/pois_raw.csv"
    places = load_places(csv_path)
    print(f"Loaded {len(places)} POIs from {csv_path}, categorized, upserting...")
    # PostgREST handles a batch this size (a few thousand rows) fine in one
    # request, but chunk anyway so one bad row doesn't fail the whole batch
    # and so progress is visible for a larger future import.
    CHUNK = 500
    for i in range(0, len(places), CHUNK):
        upsert(places[i:i + CHUNK])
    print("Done.")
