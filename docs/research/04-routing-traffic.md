# Research: Routing, Navigation, Real-Time Traffic & Transit

*Part of the "지도" (Belize map app) research series. See [../RESEARCH-SUMMARY.md](../RESEARCH-SUMMARY.md) for the executive synthesis and [../PLAN.md](../PLAN.md) for the build plan.*

---

## 1. Road Network Graph Construction

Raw geometry (typically OSM ways) becomes a directed graph: **nodes** = intersections/decision points, **edges** = road segments carrying length, speed, one-way flag, access restrictions, surface, road class.

**Turn restrictions** are the hard part — a plain node/edge graph can't represent "no left turn" because cost depends on the *incoming* edge, not the node. Standard fix: **edge-based (edge-expanded) graphs** — each directed edge becomes a graph node, transitions between edges carry turn costs. GraphHopper requires `turn_costs=true` + an edge-based build for this. ([GraphHopper](https://github.com/graphhopper/graphhopper), [geospatialrouting.com](https://www.geospatialrouting.com/osm-graph-architecture-network-modeling/handling-turn-restrictions-in-routing-graphs/))

**Elevation**: sampled from a DEM (e.g. SRTM), attached to edges/points, used for display and costing (uphill/downhill affects bike/pedestrian/EV-range costs). ([GraphHopper 1.0 release notes](https://www.graphhopper.com/blog/2020/05/25/graphhopper-routing-engine-1-0-released/))

**Data structures**: OSRM keeps a flat memory-mapped graph. **Valhalla** uses **spatially partitioned tiles in a hierarchy of levels** (highway/arterial/local, plus transit) so a query only loads needed tiles and memory scales with region size, not planet size. ([Valhalla "Why tiles?"](https://valhalla.github.io/valhalla/concepts/why-tiles/))

**Korea-specific (confirmed)**: MOLIT runs **표준노드링크 (Standard Node-Link)**, a government-maintained canonical node/link graph of the entire national road network, field-surveyed on change, redistributed at 5-minute intervals via the ITS 국가교통정보센터. Naver/Kakao/Tmap key their live speed data to this standard link ID system, not raw OSM ways. ([its.go.kr/nodelink](https://www.its.go.kr/nodelink/)) Kakao Mobility separately builds its own HD/precision map on top via MMS vehicles (see §6).

**Implication for Belize**: OSM is the only viable geometry source (no 표준노드링크 equivalent). Run OSM extracts through an existing graph compiler (Valhalla/GraphHopper/OSRM) rather than building one from scratch; assume turn-restriction/one-way tagging in Belize OSM data is sparse/inconsistent and needs spot validation, not just automated import.

---

## 2. Routing Algorithms

Plain Dijkstra/A* aren't fast enough for continent-scale sub-100ms queries. Two production speedup families:

- **ALT** (A*, Landmarks, Triangle inequality): precompute distances from landmark nodes to every node, use the triangle inequality as a tight A* heuristic. ~91% fewer nodes settled, ~85% less time vs plain Dijkstra. Weakness: doesn't handle live-changing weights well (landmark distances are precomputed against one fixed weighting). ([arxiv 1603.01607](https://arxiv.org/html/1603.01607))
- **Contraction Hierarchies (CH)**: precompute a node-importance order, contract least-to-most important, inserting shortcut edges. Queries run a small bidirectional Dijkstra over shortcuts — gets continent-scale queries to milliseconds. Tradeoff: bakes in one fixed edge-weight function, hard to combine with live traffic without full re-preprocessing. ([OSRM wiki](https://github.com/Project-OSRM/osrm-backend/wiki/Running-OSRM))
- **Customizable CH (CCH)**: splits CH into a metric-independent structural phase (once) + a fast "customization" phase (re-derive shortcut weights whenever the cost function changes) — without full re-contraction. **Kakao Map switched to CCH** specifically to run several routing profiles (main-roads-first, shortest-distance, "comfortable"/avoid-narrow-roads) on one shared hierarchy. ([tech.kakao.com CCH post](https://tech.kakao.com/2021/05/10/kakaomap-cch/))
- **OSRM** offers both CH and **MLD (Multi-Level Dijkstra)**; MLD is now the recommended default since it tolerates live traffic updates better, CH reserved for huge distance-matrix workloads.
- **Valhalla** deliberately avoids CH — keeps a flexible tiled hierarchical A*-style search ("Thor" module) so costs stay fully dynamic per request (any profile, live traffic, time-dependent routing), at some query-speed cost.
- **Multi-modal profiles**: GraphHopper/Valhalla/OSRM support separate cost functions (car/bike/foot/truck) over the same base graph; CH sometimes needs a separate build per profile since it bakes in one metric.
- **Kakao Navi's newer twist**: per their if(kakao)25 talk, replacing fixed road-attribute link costs with a **reinforcement-learning (multi-armed bandit) approach** — driver route-deviation behavior becomes a reward signal continuously recalibrating link costs against real driving patterns. ([Kakao Mobility techblog](https://developers.kakaomobility.com/techblogs/ifkakao-2025.html))

**Implication for Belize**: at Belize's tiny scale (a few thousand km of roads), CH/CCH's main benefit — sub-100ms continent-scale queries — is largely unnecessary; plain bidirectional Dijkstra/A* will already be fast enough. Use an existing engine (**OSRM, GraphHopper, or Valhalla**) out-of-the-box rather than reimplementing any of this. Prefer **Valhalla or GraphHopper over OSRM** if multiple profiles or future live-traffic costing are wanted, since OSRM's CH mode is least flexible for dynamic weights.

---

## 3. Real-Time Traffic Data Collection

**Floating/probe car data (FCD)** is the general industry standard: phones/devices periodically report GPS position/heading/speed; providers aggregate per road segment into current-vs-free-flow speed. No roadside hardware needed. (TomTom sources ~61B anonymized GPS points/day from 600M+ devices, refreshed every 30s.) ([Wikipedia: FCD](https://en.wikipedia.org/wiki/Floating_car_data), [TomTom](https://www.tomtom.com/products/speed-profiles/))

**Waze**: explicit FCD from phones while driving + user-submitted incident reports (crashes, hazards, police), merged into one traffic layer.

**Kakao Mobility (confirmed sources)**:
- **Kakao T taxi fleet as probe source**: dispatch business generates large-scale real-time location/route/travel-time data, reused for city-scale movement modeling and (in its logistics arm) real-time congestion/travel-time for delivery routing. ([Hankyung, Feb 2026](https://www.hankyung.com/article/202602191408i))
- **Government C-ITS/VDS/CCTV feed-in**: Seoul's C-ITS collects signal/hazard/construction data via loop detectors, video detectors, geomagnetic detectors, feeding this into private nav apps — **Kakao Navi and Tmap were the selected pilot partners**. Seoul alone runs 214,000+ CCTV units across agencies. ([Seoul city release](https://news.seoul.go.kr/traffic/archives/506719))
- **National standard link-level feed**: ITS 국가교통정보센터 distributes real-time congestion tied to 표준노드링크 at 5-minute intervals — the common integration point for road authorities/expressway operators/local governments.
- **HD map/MMS substrate**: Kakao Mobility's custom vehicle ("ARGOS" — camera + LiDAR + GNSS + IMU, 8+ hr continuous capture) extracts lane markings/turn angles/signs via AI for its precision HD map + "VL-Navi" lane-level guidance. ([Kakao Mobility Report](https://report.kakaomobility.com/ultra-precise-navigation-ai-meets-hd-map))
- **Naver**: less documented; secondary coverage suggests aggregation of municipal/government feeds, news, user reports for incidents, plus real-time bus-arrival data — consistent with general FCD + government-feed practice but not Naver-confirmed at engineering depth.

**Implication for Belize**: none of these sources exist at any scale — no large ride-hailing fleet, no VDS/loop-detector/CCTV traffic-sensor network, no national standard link-level feed. **Real-time traffic is not attainable at launch.** Two realistic paths: (a) build a tiny crowdsourced probe layer from app users' own GPS once there's a meaningful active user base, or (b) defer live traffic entirely and ship static/historical-only speed estimates. This is a load-bearing constraint, not a "phase 2" afterthought.

---

## 4. ETA Calculation & Re-routing

**Historical + live blending is the norm**: TomTom compiles multi-year rolling archives of "speed profiles" (typical speed in 5-min buckets per hour/day-of-week/segment/direction), blended with real-time probe feeds. Weekday traffic typically shows two commute peaks (~8-10am, ~5-8pm); weekends show one midday peak. ([TomTom Speed Profiles](https://www.tomtom.com/products/speed-profiles/))

**Google/DeepMind**: blends live conditions + historical patterns + Waze incidents + government data, using **Graph Neural Networks** to model how a localized slowdown propagates through the adjacent network, predicting conditions 15–45 min ahead — reported up to 50% ETA-accuracy improvement in some cities. ([DeepMind blog](https://deepmind.google/blog/traffic-prediction-with-advanced-graph-neural-networks/))

**Kakao's route-cost learning**: folds live recalibration directly into link cost via the multi-armed-bandit approach (§2) rather than a separate ETA model layered on top.

**Live re-routing** (general architecture, inferred): turn-by-turn apps continuously re-run the routing query in the background as new traffic weights/off-route positions arrive, comparing current-route vs alternative ETA, triggering reroute past some threshold (to avoid flapping). CCH-style engines suit this well since "customization" (re-deriving weights) is cheap relative to full re-contraction.

**Implication for Belize**: with no historical speed-profile archive and no live probe layer, ETAs at launch can only be **static, free-flow-speed-based** (posted/OSM speed limit × distance, maybe a flat rural/urban degradation factor). No substrate yet for time-of-day/day-of-week blending or GNN-style prediction — building one requires months-to-years of accumulated trip data from your own users. State this explicitly as a phased roadmap item, not a missing feature.

---

## 5. Public Transit Routing (GTFS)

**GTFS** is the near-universal standard: developed with Portland's transit agency (2005-06), "un-Googled" into the vendor-neutral **General Transit Feed Specification** by 2009. Used by 10,000+ agencies worldwide to publish schedules/stops/routes/fares as a standard flat-file (CSV-in-zip). **GTFS-Realtime** layers live vehicle positions/delays/alerts on top. ([GTFS.org](https://gtfs.org/), [GTFS-RT docs](https://developers.google.com/transit/gtfs-realtime))

**OpenTripPlanner's algorithm**: OTP2 moved from A* to **RAPTOR** (Round-Based Public Transit Optimized Router, MSR) for the transit-search leg, keeping A* for street-network (walk/bike/drive) legs — round-based rather than graph-search, scales to nationwide GTFS with native multi-criteria optimization (arrival time, transfers, duration, operator). ([OTP2 changelog](https://docs.opentripplanner.org/en/latest/Changelog/))

**Korea's transit plumbing (confirmed)**: **국가대중교통정보센터 (TAGO)** under MOLIT/KOTSA integrates real-time bus location/arrival (BIS) from every local government's separate system, plus subway/rail/intercity/express-bus/air/marine schedules, into ~13 standardized datasets — and **feeds this free to Naver, Kakao, and Tmap**, who surface it as real-time transit info. TAGO functions as a single standardizing intermediary so Naver/Kakao don't need to negotiate with 200+ local bus operators individually — functionally analogous to a national GTFS aggregator. ([tago.go.kr](https://www.tago.go.kr/center/center_intro))

**Belize: no formal transit data exists.** No official GTFS/GTFS-RT feed found in the Mobility Database (6,000+ feeds, 99+ countries — [mobilitydatabase.org](https://mobilitydatabase.org/)) or elsewhere. Only third-party, crowd-maintained bus-schedule sites/apps exist (e.g. "Belize Bus Schedules" — [belizebusschedules.com](https://belizebusschedules.com/)), compiling intercity coach timetables manually, with no confirmed real-time vehicle-position layer.

**Implication for Belize**: this is a genuine data-scarcity constraint, not an integration gap — without a GTFS feed, RAPTOR-style engines have nothing to route against; the algorithm isn't the blocker, the *data* is. Two paths: (a) manually author a minimal static GTFS feed for Belize's known intercity bus routes (digitizing the same schedules third-party sites already compile) to unlock basic static transit directions, or (b) defer transit routing entirely for v1, scoping to car/walk directions only, with transit as a stretch goal contingent on someone doing the GTFS-authoring work Belize's government hasn't done.

---

## 6. Turn-by-Turn Navigation UX (Map Matching)

**Map matching**: raw GPS fixes are noisy and don't sit exactly on road centerlines; the app must infer which segment (and direction) the user is on, using plausibility of the implied path from previous points, not just the current fix.

**OSRM's approach**: **Hidden Markov Model** — each GPS point has candidate nearby segment matches scored by emission probability (spatial closeness) and transition probability (plausibility of implied speed/path between consecutive points); **Viterbi algorithm** finds the most probable path through candidates. Outlier points get near-zero probability and are dropped/split. Based on Newson & Krumm's "Hidden Markov Map Matching Through Noise and Sparseness"; works well for GPS pings up to ~30s apart at driving speed, returns a 0–1 confidence score. ([Telenav OSRM doc](https://github.com/Telenav/open-source-spec/blob/master/osrm/doc/osrm_mapmatching.md))

**Valhalla's Meili** module implements the same HMM/Viterbi family, integrated with Valhalla's tiled graph.

**Turn-by-turn instruction generation**: once matched, the engine walks the route's edge sequence and generates instructions at maneuver points using edge attributes (bearing change, road-name change, ramp/exit tags). GraphHopper stores a StringIndex per edge; Valhalla stores sign/exit metadata per edge for this, separate from pure shortest-path cost.

**Kakao's HD-map-assisted variant**: "VL-Navi" goes beyond road-centerline matching to **lane-level** positioning (HD map + AI-processed camera/GNSS/IMU fusion), specifying which lane to be in — a precision level generic OSM-based matching doesn't attempt. ([Kakao Mobility Report](https://report.kakaomobility.com/ultra-precise-navigation-ai-meets-hd-map))

**Implication for Belize**: OSRM's or Valhalla's built-in map matching (HMM/Viterbi) is directly reusable against an OSM-derived Belize graph, needs no custom development — a solved, off-the-shelf problem at the "snap to road + generate turn instructions" level. Lane-level HD-map guidance (Kakao's differentiator) is out of reach without Belize-specific MMS data collection and not worth pursuing for v1; standard road-level map matching is appropriate and sufficient.

---

## 7. Belize Geospatial & Transit Open Data — Quick Assessment

- **Road network via OSM**: Belize road coverage in OSM is estimated at ~72% of actual road length, with average data age ~1yr 7mo and only ~7% of roads edited in the last 6 months — usable for main highways/towns but thinner/staler for secondary/unpaved roads (Maya Mountains, Cayo District interior). Offline nav apps like Maps.me already rely on this same data for real-world Belize navigation — a practical validation signal. ([HDX Belize Roads OSM export](https://data.humdata.org/dataset/hotosm_blz_roads))
- **Government geospatial infrastructure exists but is nascent**: Belize's **National Spatial Data Infrastructure (BNSDI)** portal ([portal.bnsdi.gov.bz](https://portal.bnsdi.gov.bz/)), run by the Ministry of Natural Resources, has a geo-data catalog including a "Transportation Network" layer, plus a separate "Open Data for Belize" ArcGIS hub. Worth checking as a supplementary/higher-accuracy source alongside OSM — no indication either publishes live traffic sensors, a standard node-link network, or a transit feed.
- **No public transit standard data at all**: confirms §5 — no GTFS/GTFS-RT feed found; only manually-compiled third-party bus-schedule sites/apps.

**Overall implication**: pragmatic build order is (1) OSM extract → off-the-shelf routing engine (**Valhalla or GraphHopper** preferred over OSRM for profile flexibility and eventual live-traffic hooks) for car/walk/bike directions, cross-checked against BNSDI's road layer where it disagrees with OSM; (2) **no live traffic or historical-speed ETA at launch** — ship free-flow-speed estimates, treat probe-based traffic as a multi-year-out goal contingent on the app's own user base becoming a de facto probe network; (3) transit directions deferred behind manually authoring a minimal static GTFS feed, since no government/crowdsourced standard feed exists; (4) road-level map matching/turn-by-turn (OSRM/Valhalla built-ins) is realistic immediately — the one area where "just use the standard open-source tool" fully closes the gap with Naver/Kakao, since lane-level HD-map guidance is the only piece genuinely out of reach without Belize-specific survey investment.
