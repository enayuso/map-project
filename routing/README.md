# Routing (Phase 4): Valhalla

Car/walk/bike directions + turn-by-turn instructions + GPS map matching, built from the same Belize OSM extract. Self-contained: builds its own routable graph, independent of the Phase 1/2 services.

Chose **Valhalla** over OSRM/GraphHopper per [docs/PLAN.md](../docs/PLAN.md)'s reasoning: multiple routing profiles (car/walk/bike) on one shared graph without separate builds per profile, and built-in map matching — both confirmed working below.

## Start it

```bash
cd routing
mkdir -p custom_files
cp ../data/raw/belize-latest.osm.pbf custom_files/
docker compose up -d
```

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
- **Belize City ↔ San Pedro `auto` routing is still genuinely bad, not just "long/indirect" as first noted above** — re-checked 2026-09-14: today it drives ~370km/5.7hrs north to Corozal to use the *Corozal↔San Pedro* ferry relation, rather than anything resembling the actual ~75min direct water-taxi tourists use from Belize City itself. That direct route simply isn't in OSM as a routable way at all — this is a real data gap, not a Valhalla config issue, and the app's own [Ferries feature](../mobile/README.md) already has the real schedule/operator data as curated content specifically *because* this isn't routable. Worth either mapping the direct route in OSM, or having the mobile app detect a mainland↔caye trip and point at the Ferries panel instead of returning the driving route as if it were sensible.

**Wired into the mobile app** since Phase 4/4.5 — directions, live turn-by-turn navigation, search-along-route, and the fair meeting-point calculator's travel-time matrix all call this service. See [mobile/README.md](../mobile/README.md).
