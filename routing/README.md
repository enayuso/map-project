# Routing (Phase 4): Valhalla

Car/walk/bike directions + turn-by-turn instructions + GPS map matching, built from the same Belize OSM extract. Self-contained: builds its own routable graph, independent of the Phase 1/2 services.

Chose **Valhalla** over OSRM/GraphHopper per [docs/PLAN.md](../docs/PLAN.md)'s reasoning: multiple routing profiles (car/walk/bike) on one shared graph without separate builds per profile, and built-in map matching — both confirmed working below.

## Start it

```bash
pip3 install osmium   # once, for the ferry-connector patch below
python3 scripts/patch_ferry_connectors.py   # writes routing/custom_files/belize-latest.osm.pbf
cd routing
docker compose up -d
```

The patch script (not a plain `cp` — see its own header comment, and the dated follow-up below) fixes a real Belize City ↔ San Pedro ferry-routing bug in our own copy of the extract only; nothing is uploaded to OpenStreetMap.

First start builds the routable graph from the PBF. For all of Belize this takes **under a minute** (67 tiles) — dramatically faster than Nominatim's import, since building a routing graph is much lighter work than a full geocoding search index. Watch it with `docker logs -f belize-valhalla`; ready when you see `Found config file. Starting valhalla service!`.

API is on **http://127.0.0.1:8002** — the standard [Valhalla API](https://valhalla.github.io/valhalla/api/) (`/route`, `/trace_route`, `/trace_attributes`, `/locate`, `/status`, etc).

Run `../scripts/test_routing.sh` for a full smoke test.

## Verified working (2026-09-09)

| Test | Result |
|---|---|
| `costing: auto`, within Belize City | Real turn-by-turn: "Drive south on Lakeview Street" → "Turn left onto Ebony Street" → ... → through Queen Street Roundabout. 1.85 km, 5 min. |
| `costing: pedestrian`, same trip | 1.74 km, 20.6 min (~5 km/h walking pace) |
| `costing: bicycle`, same trip | 1.85 km, 6.8 min |
| `costing: auto`, Belize City → San Ignacio (111 km cross-country) | Correctly routes via **George Price Highway / AR1** — the real highway connecting Belize City to Cayo District. 114 min. |
| `costing: auto`, Belize City → San Pedro (the two pilot regions — separated by open water) | **Did not fail** — found a real route with `"has_ferry": true`, using an actual OSM-mapped ferry connection. Confirms our two pilot areas are connected in the routable graph via the water-taxi service tourists actually use. Route came back long/indirect (253 km, ~6.6 hrs) — worth revisiting the ferry-route OSM data quality later, but the core ferry-aware routing capability works. |
| `/trace_route` (map matching) on a synthetic 3-point GPS trace along Queen Street | Correctly snapped to "Queen Street" and generated a coherent instruction — Valhalla's built-in HMM/Viterbi map matching (see [docs/research/04-routing-traffic.md](../docs/research/04-routing-traffic.md)) needed zero custom development, exactly as the research predicted. |
| Turn restrictions | 36 simple turn restrictions parsed from the OSM relations and loaded into the graph (matches the count found in [docs/research/06-pilot-region-data-audit.md](../docs/research/06-pilot-region-data-audit.md)'s Belize City audit). Not independently field-verified against ground truth — flagged in the original research as worth spot-checking once real usage surfaces any wrong-way routing. |

## Config notes

- `build_admins: True` / `build_time_zones: True` — Belize borders Mexico and Guatemala, so border-crossing-aware routing and correct driving-side detection matter from day one.
- `build_elevation: False` — skipped for now; not needed for v1, revisit if bike routing ever needs to account for hills.
- `use_default_speeds_config: True` — uses the [OpenStreetMapSpeeds](https://github.com/OpenStreetMapSpeeds/schema) community speed table rather than Valhalla's bare defaults, which matters given [docs/research/06-pilot-region-data-audit.md](../docs/research/06-pilot-region-data-audit.md) found most Belize roads are unpaved (`surface=unpaved`) — realistic default speeds per surface/road-class type are doing real work here, not just decoration.

## Not yet done

- **No live or historical traffic** — ETAs above are static/free-flow-speed-based, exactly as scoped in [docs/PLAN.md](../docs/PLAN.md) Phase 4 (no traffic data source exists for Belize yet — see [docs/research/04-routing-traffic.md](../docs/research/04-routing-traffic.md))
- **Turn-restriction/one-way accuracy** not field-verified — the data loaded correctly, but whether it matches real-world signage is unconfirmed
- ~~**Belize City ↔ San Pedro `auto` routing is still genuinely bad**~~ — **fixed 2026-09-17**, see the dated follow-up below. Was: drove ~370km/5.7hrs north to Corozal instead of the real ~75min direct water-taxi.

**Wired into the mobile app** since Phase 4/4.5 — directions, live turn-by-turn navigation, search-along-route, and the fair meeting-point calculator's travel-time matrix all call this service. See [mobile/README.md](../mobile/README.md).

## Follow-up (2026-09-17): fixed the Belize City ↔ San Pedro ferry-routing bug

Re-diagnosed from scratch (not just re-reading the 2026-09-14 note above) using this session's own from-scratch investigation — networkx graph analysis over the raw `.pbf`'s real node IDs, plus three isolated single-service Valhalla rebuilds to test hypotheses directly rather than guessing from the API responses alone. **The 2026-09-14 diagnosis was half right**: the direct Belize City → Caye Chapel → Caye Caulker → San Pedro ferry chain is *not* actually fragmented internally — it's one fully node-connected ~55km path (confirmed via networkx `dijkstra_path` over the real OSM node graph). What's actually broken is that **neither terminal shares a node with the real street network**: the Belize City dock sits ~47m from the nearest real street (Angel Lane), the San Pedro dock ~114m from the nearest one (Caribeña Street) — ordinary "drawn close but never snapped" OSM digitizing gaps, not fragmentation of the ferry route itself. Since Valhalla only connects ways that share an exact node, and this ferry system's own component has far lower overall graph "reach" than the country's road network, its location-correlation heuristic strongly prefers a connected road over a correctly-near-but-disconnected ferry edge whenever there's any alternative — forcing the whole route onto the one ferry link that *is* road-connected, all the way up near Corozal.

**Fix**: [scripts/patch_ferry_connectors.py](../scripts/patch_ferry_connectors.py) (new) adds two short `highway=service` connector ways — a "last few meters to the dock" access path, exactly the kind of feature a careful mapper would draw — directly between each ferry terminal node and its nearest real street node. Local-only: it patches `routing/custom_files/belize-latest.osm.pbf`, never `data/raw/`'s pristine copy, and nothing is uploaded to OpenStreetMap. The correct long-term fix is still a human OSM editor snapping this upstream (Track A in [docs/PLAN.md](../docs/PLAN.md)'s own terms) — this is the local equivalent for our own app now, not a replacement for that.

One real implementation trap hit along the way, worth recording: the obvious way to add two synthetic ways — `osmium apply-changes` with an OsmChange file using placeholder negative IDs (the standard OSM-editing convention for new elements) — silently produces a file Valhalla's PBF parser rejects outright (`terminate called after throwing an instance of 'std::runtime_error': Detected unsorted input data`), regardless of the negative IDs' relative order or an explicit `osmium sort` pass afterward. Root cause never fully isolated (Valhalla's parser apparently just doesn't accept negative way IDs, sorted or not) — worked around by using a small pyosmium script instead, with plain positive placeholder IDs safely above the extract's real max way ID (1,557,252,992), appended after the very last real way. A second, unrelated trap: pyosmium's `SimpleWriter.add_way()` silently accepts a plain Python `dict` and writes a garbage empty way (id 0, no tags, no nodes) with no error — the actual API needs `osmium.osm.mutable.Way(id=..., nodes=..., tags=...)`. Both confirmed the hard way, by reading the file back after every attempt rather than trusting "the script ran with no exception."

**Verified**: three from-scratch isolated Valhalla builds (small-bbox extract, then full-country, from a scratch directory *outside* Colima's shared mount at first — which silently mounts as empty rather than erroring, another real trap worth remembering) before ever touching the real `belize-valhalla` container. With the final fix: `scripts/patch_ferry_connectors.py` verifies its 4 hardcoded node IDs still sit within 50m of their expected coordinates before patching (aborts loudly instead of silently mispatching a future refreshed extract). Rebuilt the real container (`rm` the stale `valhalla_tiles`/`valhalla_tiles.tar`/`file_hashes.txt`, `docker restart belize-valhalla` — a plain `docker compose up -d` does *not* pick up a changed bind-mounted file on its own) and ran `scripts/test_routing.sh`: Belize City ↔ San Pedro now returns **56.9km / 153.8min** (was 253.7km/394min) via real Belize City streets to Angel Lane's dock and a single direct ferry leg — matches this session's own pure-graph-theory shortest-path calculation almost exactly. Every other route the smoke test checks (within Belize City for all three profiles, Belize City → San Ignacio, GPS map matching) came back byte-for-byte identical to this file's own documented baselines above — zero regression.
