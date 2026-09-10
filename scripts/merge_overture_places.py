#!/usr/bin/env python3
"""
Phase 2 supplement: merge Overture Maps' Places theme into the same Typesense
"pois" collection build_poi_index.py already builds from OSM — a second,
independent data source, not a replacement (see docs/research/
08-comparative-data-sourcing-landscape.md for why Overture: its
Places/Addresses theme is CDLA-Permissive-2.0-licensed, more permissive than
OSM's own ODbL, and includes real, current Belize business data — including
postcodes OSM often lacks — sourced in part from Meta).

Must run AFTER build_poi_index.py in the same reindex: that script drops and
recreates the collection from a fresh OSM export, so this one only appends
to whatever's already there, via upsert (never drop/recreate) — one supplies
the base, this one enriches it.

Prerequisites (not run by this script, since they touch the network/take a
while and don't need to happen on every reindex — see search/README.md):
  1. `pip3 install overturemaps shapely`
  2. `python3 -m overturemaps download --bbox=-89.35,15.75,-86.75,18.6 \
        -f geojson -t place -o data/overture/places-belize.geojson`
     (bbox matches mobile/App.tsx's own MAX_BOUNDS, for consistency)
  3. Belize's real country boundary, for filtering out the bbox's rectangular
     spillover into Guatemala/Mexico/Honduras: `curl -sL
     https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/BLZ/ADM0/geoBoundaries-BLZ-ADM0.geojson
     -o data/overture/belize-boundary.geojson` (geoBoundaries, CC BY 4.0 —
     used here only as an internal filtering tool, not redistributed).

Why the filtering matters, confirmed empirically: of the 18,900 raw features
in a Belize-bbox download, only 8,016 (42%) are actually inside Belize's own
border — the rest are real places in neighboring countries that happen to
fall inside the rectangular bounding box.
"""
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from difflib import SequenceMatcher

from shapely.geometry import Point, shape

TYPESENSE_URL = "http://127.0.0.1:8108"
TYPESENSE_API_KEY = "typesense_dev_local_only"
COLLECTION = "pois"

PLACES_PATH = "data/overture/places-belize.geojson"
BOUNDARY_PATH = "data/overture/belize-boundary.geojson"

# Below this, Overture's own confidence score (its estimate of how reliable
# this record's conflation/geocoding is) is judged too unreliable to trust —
# checked the real distribution first (median 0.71 among in-Belize, named
# records) rather than guessing a threshold; 0.5 keeps 80% of them.
MIN_CONFIDENCE = 0.5

# How close (and how similar the name) counts as "this is already in our
# OSM-sourced data, don't add it again". Belize-scale POI density means a
# 100m radius rarely nets more than a handful of nearby candidates to check.
DEDUP_RADIUS_KM = 0.1
NAME_SIMILARITY_THRESHOLD = 0.6

# Overture's own primary-category taxonomy runs to ~700 distinct values
# globally. Mapped here onto this project's fixed ~18-category enum (the
# same one build_poi_index.py's AMENITY_MAP/SHOP_MAP/TOURISM_MAP populate),
# covering every category that actually showed up with real frequency in a
# live Belize download (the top ~90 values, 75% of all in-Belize/named/
# confident candidates) — not a guess at Overture's full taxonomy. Anything
# not listed here still gets imported, just filed under "other" with the
# original Overture category preserved in osm_tag for traceability, same
# principle as build_poi_index.py's own AMENITY_MAP/SHOP_MAP/TOURISM_MAP.
CATEGORY_MAP = {
    "restaurant": "restaurant", "fast_food_restaurant": "restaurant",
    "bar_and_grill_restaurant": "restaurant", "caribbean_restaurant": "restaurant",
    "mexican_restaurant": "restaurant", "seafood_restaurant": "restaurant",
    "pizza_restaurant": "restaurant", "chinese_restaurant": "restaurant",
    "ice_cream_shop": "restaurant", "food_truck": "restaurant",
    "cafe": "cafe", "coffee_shop": "cafe",
    "bar": "bar", "lounge": "bar", "dance_club": "bar",
    "bank_credit_union": "bank_atm",
    "pharmacy": "pharmacy",
    "hospital": "healthcare", "dentist": "healthcare",
    "school": "school", "high_school": "school", "elementary_school": "school",
    "college_university": "school", "education": "school",
    "gas_station": "fuel",
    "car_rental_agency": "transport", "airport": "transport",
    "transportation": "transport",
    "church_cathedral": "worship", "religious_organization": "worship",
    "catholic_church": "worship",
    "central_government_office": "government",
    "public_service_and_government": "government",
    "grocery_store": "grocery", "convenience_store": "grocery",
    "bakery": "grocery", "butcher_shop": "grocery",
    "scuba_diving_center": "dive_watersports",
    "beauty_salon": "shop", "barber": "shop", "spas": "shop",
    "clothing_store": "shop", "womens_clothing_store": "shop",
    "hardware_store": "shop", "shopping": "shop", "shopping_center": "shop",
    "flowers_and_gifts_shop": "shop", "car_dealer": "shop",
    "automotive_repair": "shop", "auto_parts_and_supply_store": "shop",
    "electronics": "shop", "furniture_store": "shop",
    "mobile_phone_store": "shop", "nursery_and_gardening": "shop",
    "boutique": "shop", "car_wash": "shop", "laundromat": "shop",
    "tattoo_and_piercing": "shop", "construction_services": "shop",
    "jewelry_store": "shop", "pawn_shop": "shop",
    "printing_services": "shop", "travel_services": "shop",
    "hotel": "hotel_lodging", "resort": "hotel_lodging", "lodge": "hotel_lodging",
    "holiday_rental_home": "hotel_lodging", "accommodation": "hotel_lodging",
    "bed_and_breakfast": "hotel_lodging", "hostel": "hotel_lodging",
    "tours": "attraction", "landmark_and_historical_building": "attraction",
    "park": "attraction", "beach": "attraction", "mountain": "attraction",
    "arts_and_entertainment": "attraction", "wildlife_sanctuary": "attraction",
    "art_gallery": "attraction", "national_park": "attraction",
}


def typesense_request(method, path, body=None, content_type="application/json"):
    req = urllib.request.Request(f"{TYPESENSE_URL}{path}", data=body, method=method)
    req.add_header("X-TYPESENSE-API-KEY", TYPESENSE_API_KEY)
    req.add_header("Content-Type", content_type)
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def find_nearby(lat: float, lon: float, radius_km: float) -> list[dict]:
    # sort_by is load-bearing, not cosmetic: without it, Typesense's default
    # ordering for a q="*" search is unspecified rather than distance-based,
    # so in a dense area (many POIs within radius_km) the actual *closest*
    # candidates — the ones most likely to be the same real-world place —
    # can get crowded out of the top `per_page` results by farther ones,
    # silently letting real duplicates through. Confirmed this the hard way:
    # a second run of this script (with the first run's imports now also
    # sitting in the index) let 175 already-imported places re-match as
    # "new" under an unsorted query, before this fix.
    params = {
        "q": "*",
        "query_by": "name",
        "filter_by": f"location:({lat}, {lon}, {radius_km} km)",
        "sort_by": f"location({lat}, {lon}):asc",
        "per_page": 25,
    }
    status, body = typesense_request(
        "GET", f"/collections/{COLLECTION}/documents/search?{urllib.parse.urlencode(params)}"
    )
    if status != 200:
        return []
    return [hit["document"] for hit in json.loads(body).get("hits", [])]


def is_duplicate(name: str, lat: float, lon: float) -> bool:
    for doc in find_nearby(lat, lon, DEDUP_RADIUS_KM):
        if SequenceMatcher(None, name.lower(), doc["name"].lower()).ratio() >= NAME_SIMILARITY_THRESHOLD:
            return True
    return False


def main():
    try:
        boundary = shape(json.load(open(BOUNDARY_PATH))["features"][0]["geometry"])
        places = json.load(open(PLACES_PATH))["features"]
    except FileNotFoundError as e:
        print(f"Missing input file: {e}. See this script's own module docstring for the download steps.", file=sys.stderr)
        sys.exit(1)

    candidates = []
    dropped_no_name = dropped_low_confidence = dropped_outside = 0
    for f in places:
        props = f["properties"]
        name = (props.get("names") or {}).get("primary")
        if not name:
            dropped_no_name += 1
            continue
        confidence = props.get("confidence") or 0
        if confidence < MIN_CONFIDENCE:
            dropped_low_confidence += 1
            continue
        lon, lat = f["geometry"]["coordinates"]
        if not boundary.contains(Point(lon, lat)):
            dropped_outside += 1
            continue
        overture_category = (props.get("categories") or {}).get("primary") or "unknown"
        candidates.append({
            "id": f["id"],
            "name": name,
            "category": CATEGORY_MAP.get(overture_category, "other"),
            "osm_tag": f"overture_category={overture_category}",
            "source": "overture",
            "location": [lat, lon],
        })

    print(f"Loaded {len(places)} raw Overture features.")
    print(
        f"Dropped: {dropped_no_name} no name, {dropped_low_confidence} below "
        f"confidence {MIN_CONFIDENCE}, {dropped_outside} outside Belize's real boundary "
        "(bbox spillover into neighboring countries)."
    )
    print(f"{len(candidates)} candidates remain — checking each against existing OSM-sourced POIs...")

    new_docs = []
    duplicates = 0
    for i, c in enumerate(candidates):
        if i % 1000 == 0 and i > 0:
            print(f"  ...{i}/{len(candidates)}", file=sys.stderr)
        lat, lon = c["location"]
        if is_duplicate(c["name"], lat, lon):
            duplicates += 1
        else:
            new_docs.append(c)

    print(f"\n{duplicates} matched an existing POI within {int(DEDUP_RADIUS_KM * 1000)}m by name — skipped as duplicates.")
    print(f"{len(new_docs)} are genuinely new.")

    if not new_docs:
        print("Nothing to import.")
        return

    jsonl = "\n".join(json.dumps(d) for d in new_docs).encode()
    status, body = typesense_request(
        "POST", f"/collections/{COLLECTION}/documents/import?action=upsert",
        jsonl, content_type="text/plain",
    )
    results = body.decode().strip().split("\n")
    successes = sum(1 for r in results if json.loads(r).get("success"))
    failures = len(results) - successes
    print(f"\nImported {successes}/{len(new_docs)} new Overture-sourced documents ({failures} failures).")
    if failures:
        for r in results:
            parsed = json.loads(r)
            if not parsed.get("success"):
                print("  FAILED:", parsed, file=sys.stderr)

    counts = Counter(d["category"] for d in new_docs)
    print("\nNew-doc category breakdown:")
    for cat, n in counts.most_common():
        print(f"  {cat:20s} {n}")


if __name__ == "__main__":
    main()
