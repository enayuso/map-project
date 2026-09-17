#!/usr/bin/env python3
"""
Fixes a real, precisely-diagnosed OSM data gap that made Belize City <->
San Pedro `auto` routing absurd: Valhalla was returning ~253km/6.6hrs,
looping all the way north to a Corozal-area ferry, instead of the real
~35km direct water-taxi tourists actually use (San Pedro Belize Express,
Ocean Ferry Belize, etc.) — see routing/README.md's "Not yet done" section
for the original diagnosis (2026-09-14).

Root cause, confirmed by this session's own from-scratch investigation
(graph analysis with networkx + isolated single-service Valhalla rebuilds,
not just re-reading the old diagnosis): the direct Belize City -> Caye
Chapel -> Caye Caulker -> San Pedro ferry chain IS one fully-connected
~55km path in OSM, sharing exact node IDs end to end — that part was
already fine. What's actually broken is that *neither end* of that ferry
chain shares a node with the real street network: the Belize City
terminal sits ~47m from the nearest real street (Angel Lane), and the San
Pedro terminal ~114m from the nearest one (Caribeña Street) — a classic
"drawn close but never snapped" OSM digitizing gap. Since a routing graph
only connects ways that share an exact node, and this ferry system's own
component has far lower overall reach than the country's road network,
Valhalla's location-correlation heuristic overwhelmingly prefers a
real-but-connected road, which forces it onto the one ferry service that
*is* fully road-connected (up near Corozal), however geographically
absurd the resulting detour.

The correct long-term fix is a human OSM editor snapping the real
terminal nodes to the real street nodes upstream (Track A in docs/
PLAN.md's own terms — the shared public database, not something to patch
programmatically without on-the-ground judgment). This script does the
next best thing LOCALLY: adds two short `highway=service` connector ways
(a "last few meters to the dock" access path, the same kind of feature a
careful mapper would draw) directly between each ferry terminal node and
its nearest real street node, in our own copy of the extract only.
Nothing is uploaded to OpenStreetMap; upstream is untouched.

Verified end to end before this script existed (throwaway pyosmium/
networkx scripts + three from-scratch isolated Valhalla rebuilds — full
detail in this repo's own session history): with the patch applied,
Belize City -> San Pedro drops from 253.7km/394min to 56.9km/153.8min,
using the real streets to Angel Lane's dock and a single direct 55km
ferry leg — and every other route this project's own test suite checks
(within Belize City, Belize City -> San Ignacio, pedestrian costing) came
back byte-for-byte identical to routing/README.md's documented baselines,
confirming zero regression.

Usage (run whenever data/raw/belize-latest.osm.pbf is refreshed from a new
Geofabrik pull — this only patches routing/'s own copy, never the raw
extract other services import from):
    pip3 install osmium   # once
    python3 scripts/patch_ferry_connectors.py

Requires pyosmium (not a normal project dependency — this script runs
occasionally by hand, not in any container's requirements.txt, same
reasoning as merge_overture_places.py's own optional prerequisites).

Safety: hardcoded node IDs are exact OSM node references from the extract
this was diagnosed against. If a future Geofabrik refresh renumbers or
moves them (a real possibility — these nodes could also simply get fixed
upstream in OSM, making this patch unnecessary), this script verifies
each expected node still exists near its expected coordinate before
patching, and refuses to run silently against a changed extract.
"""

import math
import os
import sys

import osmium
import osmium.osm.mutable as mutable

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(SCRIPT_DIR)
SRC = os.path.join(REPO_ROOT, "data", "raw", "belize-latest.osm.pbf")
DST = os.path.join(REPO_ROOT, "routing", "custom_files", "belize-latest.osm.pbf")

# (node_id, expected_lon, expected_lat, description) — see this file's own
# docstring for how these were found. Tolerance is generous (50m) since
# these are just a sanity check that the extract hasn't changed underneath
# this script, not a precision requirement.
EXPECTED_NODES = [
    (10225925740, -88.1846663, 17.4940558, "Belize City ferry terminal"),
    (4542363162, -88.1848209, 17.4944494, "Belize City street (Angel Lane)"),
    (8264999909, -87.9596012, 17.9202841, "San Pedro ferry terminal"),
    (626242481, -87.960567, 17.9207413, "San Pedro street (Caribeña Street)"),
]
TOLERANCE_DEG = 0.0005  # ~50m at this latitude

# New connector ways: (id, [start_node, end_node], tags). IDs are chosen
# safely above this extract's real max way ID (1,557,252,992) and appended
# at the very end of the ways block — Valhalla's PBF parser rejects
# negative/placeholder IDs outright ("Detected unsorted input data"),
# confirmed the hard way this session, regardless of their relative order.
NEW_WAYS = [
    (1600000001, [10225925740, 4542363162]),
    (1600000002, [8264999909, 626242481]),
]
CONNECTOR_TAGS = {
    "highway": "service",
    "service": "driveway",
    "name": "Ferry Terminal Access (local routing patch — not in upstream OSM)",
}


class NodeChecker(osmium.SimpleHandler):
    def __init__(self, wanted_ids):
        super().__init__()
        self.wanted = wanted_ids
        self.found = {}

    def node(self, n):
        if n.id in self.wanted:
            self.found[n.id] = (n.location.lon, n.location.lat)


class Injector(osmium.SimpleHandler):
    def __init__(self, writer):
        super().__init__()
        self.writer = writer
        self.last_way = None
        self.injected = False

    def node(self, n):
        self.writer.add_node(n)

    def way(self, w):
        self.writer.add_way(w)
        self.last_way = w.id

    def relation(self, r):
        if not self.injected:
            for wid, nodes in NEW_WAYS:
                self.writer.add_way(mutable.Way(id=wid, nodes=nodes, tags=CONNECTOR_TAGS))
            self.injected = True
        self.writer.add_relation(r)


def verify_extract_unchanged():
    checker = NodeChecker({n[0] for n in EXPECTED_NODES})
    checker.apply_file(SRC, locations=True)

    for node_id, exp_lon, exp_lat, desc in EXPECTED_NODES:
        got = checker.found.get(node_id)
        if got is None:
            sys.exit(
                f"ABORT: node {node_id} ({desc}) not found in {SRC}.\n"
                "The extract has changed since this patch was diagnosed — "
                "re-diagnose before patching (see this script's own docstring)."
            )
        lon, lat = got
        if abs(lon - exp_lon) > TOLERANCE_DEG or abs(lat - exp_lat) > TOLERANCE_DEG:
            dist_m = math.hypot((lon - exp_lon) * 105700, (lat - exp_lat) * 111000)
            sys.exit(
                f"ABORT: node {node_id} ({desc}) moved {dist_m:.0f}m from its "
                f"expected position — the extract has changed. Re-diagnose "
                "before patching."
            )


def main():
    if not os.path.exists(SRC):
        sys.exit(f"ABORT: {SRC} not found — fetch the OSM extract first (see docs/PLAN.md Phase 0).")

    print("Verifying the extract still matches this patch's own diagnosis...")
    verify_extract_unchanged()
    print("OK — all 4 expected nodes found at their expected positions.")

    os.makedirs(os.path.dirname(DST), exist_ok=True)
    writer = osmium.SimpleWriter(DST, overwrite=True)
    handler = Injector(writer)
    handler.apply_file(SRC, locations=False)
    if not handler.injected:
        # No relations in the file at all - append after the last way instead.
        for wid, nodes in NEW_WAYS:
            writer.add_way(mutable.Way(id=wid, nodes=nodes, tags=CONNECTOR_TAGS))
    writer.close()
    print(f"Wrote {DST} with {len(NEW_WAYS)} ferry-terminal connector ways added.")
    print("Next: cd routing && docker compose up -d --build (or restart, to pick up the new file).")


if __name__ == "__main__":
    main()
