#!/usr/bin/env python3
"""
Phase 2: build the Typesense POI/place search index from the Phase 1 PostGIS
data. Run after `scripts/db_exec.sh` has exported named POI points to CSV
(see search/README.md for the full pipeline).

Category taxonomy: a small, fixed, consumer-facing enum (~18 categories,
sized like Kakao's category_group_code model per docs/research/03-geocoding-
search.md) mapped from OSM amenity=*/shop=*/tourism=* tags. Every mapped
POI keeps its source OSM tag for traceability (docs/PLAN.md Phase 2 item 6).
"""

import csv
import json
import sys
import urllib.request

TYPESENSE_URL = "http://127.0.0.1:8108"
TYPESENSE_API_KEY = "typesense_dev_local_only"
COLLECTION = "pois"

# OSM tag value -> our category. Checked in order: amenity, then shop, then
# tourism. Anything not listed here (but still amenity/shop/tourism-tagged)
# falls into "other" rather than being dropped, per the plan's "traceability"
# call — we'd rather see it show up as "other" in the data than silently
# vanish, so gaps in this mapping are visible.
AMENITY_MAP = {
    "restaurant": "restaurant", "fast_food": "restaurant",
    "cafe": "cafe",
    "bar": "bar", "pub": "bar",
    "bank": "bank_atm", "atm": "bank_atm",
    "pharmacy": "pharmacy",
    "hospital": "healthcare", "clinic": "healthcare", "dentist": "healthcare", "doctors": "healthcare",
    "school": "school", "college": "school", "university": "school", "kindergarten": "school",
    "fuel": "fuel",
    "parking": "parking",
    "bus_stop": "transport", "ferry_terminal": "transport", "bicycle_rental": "transport", "car_rental": "transport",
    "place_of_worship": "worship",
    "townhall": "government", "public_building": "government", "post_office": "government",
    "police": "government", "fire_station": "government",
}
SHOP_MAP = {
    "supermarket": "grocery", "convenience": "grocery", "greengrocer": "grocery",
    "deli": "grocery", "bakery": "grocery", "butcher": "grocery", "variety_store": "grocery",
    "scuba_diving": "dive_watersports",
    "clothes": "shop", "hardware": "shop", "gift": "shop", "jewelry": "shop",
    "mobile_phone": "shop", "car_parts": "shop", "beauty": "shop", "hairdresser": "shop",
    "laundry": "shop", "alcohol": "shop", "art": "shop", "travel_agency": "shop", "yes": "shop",
}
TOURISM_MAP = {
    "hotel": "hotel_lodging", "guest_house": "hotel_lodging", "hostel": "hotel_lodging",
    "motel": "hotel_lodging", "apartment": "hotel_lodging", "chalet": "hotel_lodging", "camp_site": "hotel_lodging",
    "attraction": "attraction", "museum": "attraction", "gallery": "attraction",
    "viewpoint": "attraction", "artwork": "attraction", "information": "attraction",
}


def categorize(amenity: str, shop: str, tourism: str) -> tuple[str, str]:
    """Returns (category, source_osm_tag)."""
    if amenity and amenity in AMENITY_MAP:
        return AMENITY_MAP[amenity], f"amenity={amenity}"
    if shop and shop in SHOP_MAP:
        return SHOP_MAP[shop], f"shop={shop}"
    if tourism and tourism in TOURISM_MAP:
        return TOURISM_MAP[tourism], f"tourism={tourism}"
    if amenity:
        return "other", f"amenity={amenity}"
    if shop:
        return "other", f"shop={shop}"
    if tourism:
        return "other", f"tourism={tourism}"
    return "other", "untagged"


def typesense_request(method: str, path: str, body: bytes | None = None, content_type: str = "application/json"):
    req = urllib.request.Request(f"{TYPESENSE_URL}{path}", data=body, method=method)
    req.add_header("X-TYPESENSE-API-KEY", TYPESENSE_API_KEY)
    req.add_header("Content-Type", content_type)
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def ensure_collection():
    # Drop and recreate for a clean re-index (fine at this data volume).
    typesense_request("DELETE", f"/collections/{COLLECTION}")
    schema = {
        "name": COLLECTION,
        "fields": [
            {"name": "name", "type": "string"},
            {"name": "category", "type": "string", "facet": True},
            {"name": "osm_tag", "type": "string"},
            {"name": "location", "type": "geopoint"},
        ],
    }
    status, body = typesense_request("POST", "/collections", json.dumps(schema).encode())
    if status != 201:
        print(f"Failed to create collection: {status} {body}", file=sys.stderr)
        sys.exit(1)
    print("Collection created.")


def load_documents(csv_path: str):
    docs = []
    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        header = next(reader)
        for row in reader:
            osm_id, name, amenity, shop, tourism, lat, lon = row
            category, osm_tag = categorize(amenity, shop, tourism)
            docs.append({
                "id": osm_id,
                "name": name,
                "category": category,
                "osm_tag": osm_tag,
                "location": [float(lat), float(lon)],
            })

    jsonl = "\n".join(json.dumps(d) for d in docs).encode()
    status, body = typesense_request(
        "POST", f"/collections/{COLLECTION}/documents/import?action=create",
        jsonl, content_type="text/plain",
    )
    results = body.decode().strip().split("\n")
    successes = sum(1 for r in results if json.loads(r).get("success"))
    failures = len(results) - successes
    print(f"Imported {successes}/{len(docs)} documents ({failures} failures).")
    if failures:
        for r in results:
            parsed = json.loads(r)
            if not parsed.get("success"):
                print("  FAILED:", parsed, file=sys.stderr)

    # Category breakdown, for a quick sanity check against docs/PLAN.md item 6.
    from collections import Counter
    counts = Counter(d["category"] for d in docs)
    print("\nCategory breakdown:")
    for cat, n in counts.most_common():
        print(f"  {cat:20s} {n}")


if __name__ == "__main__":
    csv_path = sys.argv[1] if len(sys.argv) > 1 else "/tmp/pois_raw.csv"
    ensure_collection()
    load_documents(csv_path)
