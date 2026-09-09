# Research: Naver's and Kakao's Proprietary GIS / Vector-Map Systems

*Part of the "지도" (Belize map app) research series. See [../RESEARCH-SUMMARY.md](../RESEARCH-SUMMARY.md) for the executive synthesis and [../PLAN.md](../PLAN.md) for the build plan.*

Follow-up requested directly (2026-09-09), after Phase 4.5 shipped: "how do Naver and Kakao actually have their own proprietary GIS/vector-map system?" [02-map-rendering.md](02-map-rendering.md) had flagged tile-generation/rendering internals as a **genuine disclosure gap** ("no public Naver D2 or Kakao tech blog post... was found"). This follow-up closes a real part of that gap — Kakao Mobility's own engineering blog turned out to have exactly this material, in more depth than expected — and goes further into the data-collection layer underneath both companies' rendering stacks.

**Headline finding, up front**: "proprietary" mostly means two things — **their own collected data** (streets they've personally driven/scanned, buildings they've personally photographed) and **their own client-side rendering engine** (a custom renderer they built instead of adopting Mapbox GL/MapLibre). The *backend spatial database* underneath at least one of them is confirmed to be **plain PostgreSQL/PostGIS** — the exact same open-source technology this project's [backend/](../../backend/) already uses. Being a large, well-funded company building a "proprietary GIS" didn't mean reinventing the spatial database; it meant funding an enormous, sustained data-collection operation and a custom renderer on top of otherwise-ordinary infrastructure.

---

## 1. Data collection: mobile mapping systems (MMS)

Both companies run their own vehicle (and non-vehicle) fleets, distinct from — but complementary to — government aerial photography (see [01-data-collection.md](01-data-collection.md) on NGII).

### Naver — a named fleet of purpose-built devices, not just "a car with a camera"

Naver Labs (the R&D arm) has disclosed at least three distinct, separately-branded mapping devices, each for a different capture context:

- **R1** — a lightweight autonomous mobile-mapping robot for HD-map production, explicitly positioned as a cheaper alternative to "expensive traditional MMS vehicles," fusing LiDAR, cameras, GPS, IMU, and wheel encoders. ([naverlabs.com HD map dataset](https://hdmap.naverlabs.com/dataset.html))
- **P1** — a vehicle-mounted panoramic LiDAR rig, described as an "optimized vehicle-based panoramic mapping system," which powers Naver Map's **"거리뷰 3D" (Street View 3D)** feature launched December 2024 — rolled out first to Seoul's dense commercial districts (Gangnam, Mapo, Songpa, Yongsan, Yeongdeungpo, Jongno, Jung-gu) and Bundang-gu. It adds real depth/3D positioning on top of ordinary 2D panoramic street view, enabling things like tappable individual storefronts and auto-play "walk this route" playback. ([ZDNet Korea, 2024-12-16](https://zdnet.co.kr/view/?no=20241216084950))
- **M1** — an indoor-mapping robot (360° camera + laser scanning) that builds 3D maps of enclosed spaces (e.g., Incheon Airport), feeding Naver's AR indoor-navigation product and a separate consumer delivery/guide robot ("Around," commercialized with Hyundai Heavy Industries). ([Korea Herald, 2018-10-11](https://www.koreaherald.com/view.php?ud=20181011000759))

All three feed a platform Naver calls **xDM ("eXtended Definition & Dimension Map")** — described as an integrated location/mobility platform combining HD mapping, localization, and navigation for both consumer maps and robotics/autonomous-vehicle customers (Naver has stated an intent to expose xDM as third-party APIs/SDKs). ([Korea Herald](https://www.koreaherald.com/view.php?ud=20181011000759); [BioSpace — NAVER/LG robotics MOU](https://www.biospace.com/article/releases/naver-and-lg-electronics-agree-on-joint-r-and-amp-d-for-robotics-to-apply-naver-labs-location-and-amp-mobility-platform-xdm-to-lg-s-guide-robot/))

**Older, non-robotic street-view capture** (the original "파노라마"/panorama product, pre-dating the 3D relaunch): a small dedicated vehicle with **four Nikon DSLRs (D700/D800) on the roof, one per cardinal direction, each with a 10.5mm fisheye lens (185° field of view)**, plus tripod-mounted motorized "rotator" rigs for pedestrian-only areas, and fully manual capture for indoor spaces, mountain trails, and bike paths a vehicle can't reach. ([Bloter.net teardown](https://www.bloter.net/news/articleView.html?idxno=17150) — this describes older-generation hardware; treat the specific camera models as historical, not current-fleet, given the P1/M1/R1 disclosures above are newer)

### Kakao — a documented vehicle fleet history, aerial subcontracting, and improvised edge cases

Per a detailed (community-maintained, not an official Kakao disclosure — treat as medium confidence) NamuWiki teardown of **카카오맵 로드뷰 (Kakao Map RoadView)**:

| Period | Primary capture vehicle(s) |
|---|---|
| 2008–2010 | Daewoo Matiz, Kia Morning |
| 2010–2013 | Kia Pride (primary), Kia Morning |
| 2014–2017 | Hyundai Accent, Chevrolet Cruze |
| 2020–2023 | Kia Sportage (4th gen) |
| 2023–present | Kia Sportage (5th gen) |

For terrain a car can't reach: backpack-mounted panoramic cameras and tripods on foot; private tour boats/rubber dinghies for coastal and water-adjacent imagery; snowmobiles or direct ski-run footage for resort slopes; drones for select beach imagery (e.g., Manripo Beach). Historical street-view snapshots are retained back to 2008 (16+ years of timeline data). Aerial photography is sourced via third-party contractor **Samah Aviation**, and the wiki notes some highway/street segments appear to share the *same* source photography as Naver Map — implying subcontracted/shared capture arrangements exist between the two rival companies at least for some imagery, not fully independent fleets. ([NamuWiki 카카오맵](https://namu.wiki/w/카카오맵) — community-sourced; the vehicle-model table and Naver-overlap claim specifically should be read as plausible-but-unconfirmed rather than official)

Kakao Map's own lineage: Daum (Kakao's predecessor after their 2014 merger) acquired the map viewer Kongnamool.com in 2004, then launched **RoadView in December 2008 — reportedly Korea's first street-level imagery product, ahead of Naver's equivalent by roughly two years.** Branding unified from "Daum Map" to "Kakao Map" in 2016–2019 following the corporate merger.

### Kakao Mobility's separate, autonomous-driving-focused HD map pipeline

Distinct from consumer RoadView: **Kakao Mobility** (spun off from Kakao Corp in 2017) runs its own HD-map production for autonomous vehicles — used in Seoul's late-night autonomous taxi pilot (Gangnam district, 7,754 rides between Sept 2024 and Feb 2026) and Daegu's "Dalgubeol" self-driving shuttle. Per their own if(kakao)25 conference recap: the pipeline **fuses LiDAR + camera + GNSS to build "city-scale precision 3D maps,"** with a machine-learning step that automatically removes dynamic objects (moving vehicles, pedestrians) from the point cloud and automates spatial alignment and attribute detection — explicitly positioned to extend beyond autonomous driving into robotics and smart-city use cases (the same generalization story Naver tells about xDM). ([Kakao Mobility Developers tech blog — if(kakao)25 recap](https://developers.kakaomobility.com/techblogs/ifkakao-2025.html))

**Parallel structure worth noting**: both companies independently arrived at the same shape — a lightweight/robotic HD-map capture arm, feeding a generalized "location platform" pitched at robotics/AV customers beyond their own consumer map app (Naver's xDM vs. Kakao Mobility's HD-map/dataset asset-sharing plan for Korea's AV industry).

---

## 2. The rendering engine: Kakao's KNMSDK (the strongest primary-source find)

Kakao Mobility published a genuinely detailed engineering post (2026-01-28) about a from-scratch rewrite of **Kakao Navi's map SDK (KNMSDK)** — this is the single best piece of primary-source evidence found in this whole research thread, describing real architecture decisions with measured before/after performance numbers. ([Kakao Mobility Developers — "모바일 지도 SDK의 재설계"](https://developers.kakaomobility.com/techblogs/knmsdk-mapv2.html))

- **Before**: Android and iOS each independently implemented their own rendering logic in Kotlin and Swift respectively — minimal shared code between platforms (the same "N separate native rendering stacks" problem most map SDKs historically had, including early Kakao Map itself).
- **After — a shared C++ core** across both platforms, with a thin platform-specific adapter layer handling only UI/system integration.
- **A custom Graphics Device Interface (GDI)** abstracting **Metal, Vulkan, and OpenGL ES** behind one common interface — handling resource creation, synchronization, and queue submission uniformly, with automatic fallback (e.g., devices where Vulkan proves unstable fall back to OpenGL ES). This is architecturally the same *idea* as what MapLibre Native does (abstract over platform graphics APIs), independently built in-house.
- **GPU-driven rendering techniques**: SSBOs (Shader Storage Buffer Objects) for GPU-driven draw submission, half-float vertex formats to cut memory, image/font atlasing for draw-call batching, and pipeline-state caching to reduce CPU overhead — genuinely modern GPU techniques, comparable to or exceeding what typical open-source vector map engines do.
- **Tile format: FlatBuffers**, not Mapbox Vector Tile/protobuf (the format MapLibre, and this project's own Martin-based backend, use). Chosen specifically to minimize parsing overhead versus protobuf. This is a concrete point of divergence from the "MVT is the de facto standard" framing in [02-map-rendering.md](02-map-rendering.md) — Kakao judged the parsing-overhead tradeoff differently and rolled their own binary tile schema.
- **Streaming tile loading** — requests only the tiles actually needed rather than a full dataset upfront, for progressive map display.
- **Rendering decoupled from map data structures** — explicitly designed to support satellite/hybrid layers and custom themes as data sources swapped under the same renderer, not hard-coded to one data shape.
- **Measured results**: with 2× more map data than the old SDK, iOS gained ~2× GPU frame-time improvement, Android up to 20×; overall 35% memory reduction and 25% power-consumption reduction.

This single post directly resolves what [02-map-rendering.md](02-map-rendering.md) called an inference gap ("community teardown suggests the web client's 'vector-like' smoothness may be CSS/canvas animation over raster tiles... not officially confirmed") — at least for **Kakao Navi** (their standalone turn-by-turn navigation app, not necessarily identical to the Kakao Map consumer app's own separate codebase, which the same 2022 mobile-vector-rendering transition referenced in that doc applies to). Confidence: **high** for KNMSDK specifically (primary source, Kakao's own engineering team); **medium** for whether Kakao Map (the map-browsing app) shares this exact engine versus a related-but-distinct one.

**Naver's rendering side, by contrast**, remains comparatively undisclosed at this level of technical depth — the strongest concrete finding is still the **coordinate-system migration** already documented in [02-map-rendering.md](02-map-rendering.md): a legacy internal `UTMK_NAVER` projection variant, migrated to standard Web Mercator (EPSG:3857) for the newer "StyleMap" tile product — itself a small, telling data point about a Korean provider giving up a bespoke local grid in favor of interoperating with the modern vector-tile tooling ecosystem (the same tooling this project uses).

---

## 3. The spatial database layer: confirmed PostgreSQL/PostGIS at Kakao Mobility

The most reassuring finding for this project specifically. A separate Kakao Mobility engineering post on integrating address/building/land datasets ([developers.kakaomobility.com — "도로명주소와 건축물·토지 데이터 레이어링"](https://developers.kakaomobility.com/techblogs/address-structure-3.html)) describes:

- Combining three government data sources: **도로명주소 (road-name address)**, **건축물대장 (building ledger)**, and **토지특성도 (land characteristics map)** — Korea's equivalent of the cadastral/admin-boundary data this project sought (unsuccessfully so far) from Belize's LIC ([05-belize-official-data-verification.md](05-belize-official-data-verification.md)).
- Matching records via two standardized identifier codes: a **26-digit road-address management code** and, for buildings lacking a road address, a **19-digit PNU (Property Number Unit) parcel code** — direct government-issued join keys, not fuzzy matching alone.
- **"PostgreSQL 쿼리"** using string-manipulation functions for text normalization (e.g., `(1123동) → 1123동`), combined with **"공간 연산(Spatial Join)"** — spatial-join operations, PostGIS's own terminology — to resolve records where identifier codes are missing or corrupted in the source government data, backstopped by text-similarity matching for the remaining edge cases.

In other words: even a company with Kakao Mobility's scale and a custom C++/GPU rendering engine underneath its navigation app runs its geospatial data-integration layer on **plain PostgreSQL with PostGIS's spatial-join functions** — not a bespoke in-house spatial database. This directly validates this project's own architecture choice ([backend/](../../backend/): PostGIS + Martin) as the same class of tool real, large-scale Korean map platforms actually use at this layer, not a "budget substitute" for something more sophisticated. Confidence: **high** (primary source, though it doesn't explicitly confirm the extension is PostGIS by name rather than just PostgreSQL's own native geometry handling — "Spatial Join" terminology strongly implies PostGIS given that's the standard tool providing that exact operation on PostgreSQL).

No equivalent disclosure was found for Naver's backend database technology — treat as an open gap, not "presumed different."

---

## 4. Routing: Kakao Mobility's published, peer-reviewed reinforcement-learning router

Also from the if(kakao)25 recap: Kakao Mobility uses a **Multi-Armed Bandit (MaB) reinforcement-learning algorithm** for real-time route-recommendation tuning — using *drivers' own rerouting behavior* (i.e., when a driver deviates from the suggested route) as the reward signal to continuously recalibrate how well recommended routes match real-world road conditions. Reported results: overall route-compliance rate improved from 68.12% to 68.78%; compliance on routes the system had specifically modified improved more substantially, from 64.22% to 70.87%. This work was published in **_Transportation Research Part C: Emerging Technologies_**, an SCI-indexed peer-reviewed journal — a genuinely citable, externally-validated research contribution, not just a marketing claim. ([Kakao Mobility Developers — if(kakao)25 recap](https://developers.kakaomobility.com/techblogs/ifkakao-2025.html))

This is a meaningfully different (and more sophisticated) approach than this project's own routing layer ([routing/](../../routing/): Valhalla with static, free-flow costing — see [04-routing-traffic.md](04-routing-traffic.md)), which has no live-traffic or driver-feedback component at all. Not something to chase for Belize's pilot scale, but worth naming as the actual gap between "a working router" (what this project has) and "a continuously self-tuning router" (what a company with millions of daily trips can build).

---

## 5. Search/geocoding: Korea's dual address system as a structural difference

A structural difference from Belize (and most of the world) worth naming explicitly, since it explains *why* Korean map platforms' geocoding layer looks different from what [03-geocoding-search.md](03-geocoding-search.md) designed for Belize: Korea legally operates **two parallel, government-maintained address systems simultaneously**:

- **지번주소 (land-lot address)** — the older system, keyed to a unique parcel number (지번) per land division within an administrative district.
- **도로명주소 (road-name address)** — adopted nationally in 2014, keyed to a road name plus a baseline number assigned at 20-meter intervals along the road, then a building number — explicitly designed to be more intuitive in dense urban environments than the parcel system.

Both are standardized with fixed-width government identifier codes (19-digit parcel/PNU codes; 26-digit road-address management codes) specifically so systems like Kakao Mobility's can join across them deterministically rather than through fuzzy text matching alone (see §3). Nominatim's OSM-derived hierarchy (what this project actually uses) has no equivalent — it's a single, flatter address model, which is part of why [03-geocoding-search.md](03-geocoding-search.md) already found Nominatim's default parsing sufficient for Belize's simpler addressing reality, no dual-system reconciliation logic needed. ([Kakao Mobility Developers — "지번주소와 도로명주소"](https://developers.kakaomobility.com/techblogs/address-structure-2.html))

---

## Summary Table: What This Follow-Up Confirmed vs. What's Still a Gap

| Layer | Naver | Kakao / Kakao Mobility | Confidence |
|---|---|---|---|
| Named MMS fleet(s) | R1 (lightweight robot), P1 (vehicle LiDAR/panoramic), M1 (indoor robot) — all disclosed | Vehicle fleet history 2008–present (community-sourced), separate autonomous-driving HD-map pipeline (official) | Naver: high (official); Kakao vehicle history: medium (community wiki) |
| Aerial imagery sourcing | NGII partnership (2025 MOU, per [01-data-collection.md](01-data-collection.md)) | Third-party contractor "Samah Aviation"; possible shared sourcing with Naver on some segments | Medium — community-sourced for Kakao |
| "Generalized location platform" beyond consumer map | xDM | Kakao Mobility's AV/robotics dataset + HD-map + API asset-sharing plan | High — both officially stated |
| Client rendering engine internals | Not disclosed at this depth; coordinate-system migration (UTMK→Web Mercator) is the strongest concrete data point | **KNMSDK**: C++ core, custom Metal/Vulkan/OpenGL ES abstraction, SSBO GPU-driven rendering, FlatBuffers tiles — fully disclosed with performance numbers | Kakao: high (primary source); Naver: low-medium |
| Backend spatial database | Not disclosed | **Confirmed PostgreSQL, with PostGIS-style spatial joins** | High for Kakao; unknown for Naver |
| Routing/traffic sophistication | Not investigated this round | Multi-Armed Bandit RL rerouting, peer-reviewed publication | High (published research) |
| HD map automation (AV-grade) | R1/P1 sensor fusion, ML processing implied | LiDAR+camera+GNSS fusion, ML dynamic-object removal, automated alignment — explicitly described | Both: medium-high |

## What This Means for the Belize Project

Nothing here changes [PLAN.md](../PLAN.md)'s locked decisions — this was requested as pure research, not a scope change. But it does sharpen the honest answer to "are we building a toy version of what Naver/Kakao have": the **rendering architecture** (vector tiles, GPU rendering, style-driven theming) is the same *idea* at every scale, from MapLibre Native up through Kakao's custom KNMSDK — confirmed directly relevant, not just analogous, now that KNMSDK's own internals are visible. The **spatial database** (PostGIS) is, per Kakao Mobility's own admission, identical technology to what this project already runs, not a "real companies use something better" gap. What large-scale Korean platforms are actually spending money on that a hobby-budget Belize app can't replicate is almost entirely **data collection at scale** (fleets of purpose-built vehicles/robots, years of accumulated street-level imagery, government data-sharing MOUs) and **a large, continuously-retrained ML/RL layer** (dynamic-object removal from point clouds, bandit-based route tuning) — not fundamentally different core architecture.
