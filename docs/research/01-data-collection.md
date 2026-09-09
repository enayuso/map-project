# Research: How Naver/Kakao Map Gather & Maintain Data

*Part of the "지도" (Belize map app) research series. See [../RESEARCH-SUMMARY.md](../RESEARCH-SUMMARY.md) for the executive synthesis and [../PLAN.md](../PLAN.md) for the build plan.*

**Methodology note**: Naver and Kakao do not publish comprehensive technical documentation of their full data pipelines (unlike Google's "Ground Truth" disclosures). Findings below combine confirmed public statements (press releases, MOUs, patents/product pages, help-center docs, developer forums) with reasonable inference from comparable systems (Google Maps, OpenStreetMap) where marked explicitly.

---

## 1. Base Map Data Sources

**Findings:**
- Korea's base geometry (topography, elevation, cadastral boundaries) is fundamentally rooted in **government-produced national datasets**, not privately surveyed from scratch by Naver/Kakao. The core public agency is **국토지리정보원 (National Geographic Information Institute, NGII)** under MOLIT (국토교통부).
- NGII flies **annual aerial photography**: urban areas at 12cm resolution, non-urban at 25cm, converted into **orthophotos (정사영상)**. Its **국토위성센터 (National Land Satellite Center)** also produces satellite imagery (~0.5m panchromatic / 2m color) from Korea's own Arirang/CAS satellites. LiDAR-based 1m-grid Digital Elevation Models were built nationwide 2005–2021 and are now refreshed on a **2-year cycle**. ([NGII](https://www.ngii.go.kr/kor/content.do?sq=202), [NGII DEM](https://www.ngii.go.kr/kor/content.do?sq=204))
- NGII/MOLIT expose much of this as open data via **VWorld (브이월드)** — a 2D/3D national spatial-data open-API platform offering ~900 datasets including continuous cadastral maps (연속지적도), land-use zoning maps, and 3D city models. ([VWorld](https://www.vworld.kr/v4po_main.do))
- In **May 2025, Naver and Naver Labs signed an MOU directly with NGII** to combine NGII's aerial/satellite/3D/indoor spatial data with Naver Labs' digital-twin tech to build a "high-precision map" — explicit confirmation that Naver's base layer is built jointly with, not independently of, the government's geodetic data. ([ZDNet Korea](https://zdnet.co.kr/view/?no=20250514092710), [Financial News](https://www.fnnews.com/news/202505141822237016), [Electronic Times](https://www.etnews.com/20250514000022))
- Both companies **do operate their own mobile-mapping fleets** for the layers government data can't provide (fine road-surface detail, panorama imagery, 3D building fronts):
  - **Naver Labs** built proprietary systems: **R1** (vehicle-mounted Mobile Mapping System — multiple cameras, 2D/3D LiDAR, GPS, IMU, FOG, wheel encoders — for HD maps used in autonomous driving) and **P1** (panoramic street-view capture vehicle). Its **"Alike"** solution fuses city-scale aerial photography with R1's 3D point clouds via AI to mass-produce 3D digital twins/HD road maps faster and more cheaply than MMS-only pipelines. It has built a full 3D model of Seoul (605 km², 2,092 km of road) with Seoul Metropolitan Government, and separately exported this to a Saudi smart-city project. ([Naver Corp](https://navercorp.com/en/media/pressReleasesDetail?seq=30506), [naverlabs.com](https://www.naverlabs.com/en), [Korea Herald](https://www.koreaherald.com/view.php?ud=20190625000744))
  - **Kakao (originally Daum)** built its Road View (로드뷰) fleet starting ~2008: cars (New Pride, New Morning), a Jeep, Segways, backpack-mounted 360° panoramic cameras for pedestrian areas, boats/rubber dinghies for coastal/marine views, and snowmobiles for ski resorts. ([Kakao Corp](https://www.kakaocorp.com/page/detail/6234), [Kakao Corp](https://www.kakaocorp.com/page/detail/6353))
- Not publicly documented: the exact algorithmic pipeline for converting raw MMS/LiDAR point clouds into published vector road/building geometry, or the split of NGII-sourced vs. self-surveyed geometry in the current production map.

**Implication for Belize:** A from-scratch Belize app has no NGII-equivalent to lean on. Realistic sourcing options are: (a) commercial satellite/aerial imagery providers (Maxar, Airbus, Planet) for a base ortho layer, (b) OpenStreetMap's existing Belize road/building data as a bootstrap vector layer (already reasonably populated in populated areas), (c) a lightweight in-house mobile-mapping effort (a car with a 360° camera + GPS logger is a fraction of the cost of Naver/Kakao's MMS fleets and can meaningfully improve POI/road accuracy in Belize City, San Ignacio, etc.). No government MOU pipeline is available, so the product must budget for imagery licensing costs directly.

---

## 2. Address & Administrative Data

**Findings:**
- Korea runs a **dual address system**: the legacy **지번주소 (land-lot/parcel address)**, based on cadastral parcel numbers, and the newer **도로명주소 (road-name address)**, introduced nationally in 2014 to modernize navigation and logistics.
- The authoritative government source is the **행정안전부 (Ministry of the Interior and Safety)**, which operates **주소정보누리집 (juso.go.kr)** — letting anyone look up/convert between the two address types, and exposing real-time address search/lookup APIs. ([juso.go.kr](https://www.juso.go.kr/), [공공데이터포털](https://www.data.go.kr/data/15057017/openapi.do))
- MOLIT also publishes a road-name-address dataset and a general search API returning both address types plus coordinates via **data.go.kr**. ([공공데이터포털](https://www.data.go.kr/data/15059020/openapi.do?recommendDataYn=Y))
- Naver/Kakao's geocoders surface both address forms side by side, implying an internal reconciliation layer keyed on building/parcel ID — a Kakao developer-forum thread explicitly flags "주소 API 불일치" (address API mismatches) as a recognized ongoing issue. ([Kakao DevTalk](https://devtalk.kakao.com/t/api/147706))

**Implication for Belize:** Belize has no equivalent dual/legacy address system — many addresses are informal (landmark-based). This is actually a *simpler* starting point than Korea's legacy-vs-modern reconciliation problem, but the app cannot lean on any government geocoding API for structured addresses. Needs a hybrid approach: building/plot-level pins keyed to POI-anchored addressing, with a crowdsourced overlay for informal address descriptions.

---

## 3. POI / Business Listing Data

**Findings:**
- Both platforms run a **self-registration model gated by proof of business registration**:
  - **Naver Smart Place (스마트플레이스)**: business name must exactly match the 사업자등록증 (business registration certificate); doubles as an ongoing management console feeding both Search and Map. ([크몽 가이드](https://kmong.com/article/1216--%EA%B0%80%EA%B2%8C-%EC%8B%A0%EA%B7%9C-%EC%98%A4%ED%94%88-%ED%9B%84-%EB%84%A4%EC%9D%B4%EB%B2%84-%EC%A7%80%EB%8F%84-%EB%93%B1%EB%A1%9D-%ED%95%98%EB%8A%94-%EB%B0%A9%EB%B2%95))
  - **Kakao 매장관리**: any address/category change requires re-submission of the business registration certificate, manually checked against the registration number; identity separately verified via KakaoTalk (individuals) or certificate + phone (corporate). ([Kakao Help Center](https://cs.kakao.com/helps_html/1073208314?locale=ko), [Kakao Business Guide](https://kakaobusiness.gitbook.io/main/tool/mystore/register))
- **Supplementary data source**: Korea's SME agency (소상공인시장진흥공단) publishes a free nationwide **상가(상권)정보** dataset via data.go.kr — name, category, both address types, lat/long for every registered storefront — a plausible cross-check source. ([공공데이터포털](https://www.data.go.kr/data/15012005/openapi.do))
- **Freshness/expiry** (Naver): closure reports require photographic evidence (e.g. a "for lease" banner); lighter changes get lighter verification including staff phone calls; verified edits earn 200 Naver Pay points. ([나무위키](https://namu.wiki/w/%EB%84%A4%EC%9D%B4%EB%B2%84%20%ED%94%8C%EB%A0%88%EC%9D%B4%EC%8A%A4))

**Implication for Belize:** No comprehensive national business-registration dataset exists to cross-check against, and formal registration is far less universal (many informal vendors/markets/roadside businesses). Cannot replicate the "certificate-gated" model as primary onboarding — would exclude too much of the real economy. Better: open self-registration with lightweight verification (phone OTP + storefront photo, no certificate requirement), supplemented by direct outreach in high-traffic areas (markets, tourist zones), with a later claim/verify flow for owners to take over a crowdsourced listing.

---

## 4. Crowdsourcing & User Contributions

**Findings:**
- **Naver**: user corrections routed through Smart Place-linked flows; verified edits rewarded with 200 Naver Pay points (real transactable currency, unlike Google's points-only Local Guides). Verification is tiered by risk (photo proof for closures, lighter checks for minor edits).
- **Kakao**: "장소 제안" (place suggestion) lets any user propose new places/edits; explicitly goes through **"운영자 검수" (operator/moderator review)** before going live — a human moderation queue, not automatic. ([Kakao Help Center](https://cs.kakao.com/helps_html/1073192977?locale=ko))
- Neither platform runs an open OSM-style direct-edit model — contributions are funneled into a moderated review queue. (OSM itself has a separate, independent Korean contributor community entirely outside Naver/Kakao's systems.)

**Implication for Belize:** Crowdsourcing is arguably *more* essential for Belize than Korea, since there's no government registry backstop. Recommend: (1) lightweight "suggest an edit/report an error" flow with a small human-review queue (feasible at Belize's scale); (2) modest incentive (small airtime/data credit or badge/leaderboard, not a cash system, until volume justifies one); (3) tiered verification — photo required for destructive edits (marking closed), lighter touch for additive edits.

---

## 5. Imagery Layers

**Findings:**
- NGII flies the whole country annually (12cm cities / 25cm elsewhere); this is the presumptive backbone for Naver/Kakao satellite/aerial view, especially post the 2025 Naver–NGII MOU. Naver's 2007-era launch used 50cm aerial (Seoul/Gyeonggi/Dokdo) and 2m satellite nationwide, partly via Korea Aerospace Industries / the Arirang-2 satellite. ([Naver Corp](https://navercorp.com/media/pressReleasesDetail?seq=26767))
- **Kakao Sky View (스카이뷰)**: imagery is only re-shot when judged outdated, and — notably — **all newly captured imagery passes a national security review (국가보안심사)** before being reflected on the map. ([나무위키](https://namu.wiki/w/%EC%B9%B4%EC%B9%B4%EC%98%A4%EB%A7%B5))
- **Street-level panorama**: Naver's "Street View 3D" (Dec 2024) uses the P1 vehicle + LiDAR for true 3D depth, rolled out district-by-district (7 Seoul districts + Bundang as of source checked). Kakao Road View (~2008, first in Korea) uses the diverse vehicle/Segway/backpack/boat/snowmobile fleet; anecdotally refreshed less often than Naver's.

**Implication for Belize:** No domestic satellite program or aerial-survey mandate exists, so imagery must be fully commercially sourced (Maxar/Airbus/Planet tasking, or free/coarse options like Sentinel-2/Landsat, or a licensed Bing/Esri basemap) — budget and refresh cadence become a deliberate product decision. Full Naver/Kakao-scale street-view capture isn't justifiable at Belize's size; a single vehicle-mounted 360° camera + GPS rig covering main highways/town centers is the realistic initial target.

---

## 6. Licensing & Regulatory Constraints

**Findings:**
- Korea's export restriction is anchored in security regulations on national spatial information (~2014-era), capping **state-surveyed export data at coarser than 1:25,000 scale** without approval, and restricting publication of imagery showing security/military facilities. ([Wikipedia](https://en.wikipedia.org/wiki/Restrictions_on_geographic_data_in_South_Korea))
- A multi-agency **Map Export Review Committee** (NGII + Defense, Foreign Affairs, Science/ICT, National Intelligence Service) historically required unanimous approval — every Google export request was denied from 2007 through 2016 and 2023. ([ITIF](https://itif.org/publications/2025/06/27/south-koreas-export-restrictions-on-high-precision-geospatial-data/), [JURIST](https://www.jurist.org/news/2026/02/south-korea-conditionally-approves-googles-high-precision-map-data-export/))
- Direct effect: Google/Apple were capped at 1:25,000 while Naver/Kakao operate at 1:5,000+ — a structural moat widely credited with cementing their dominance (ITIF estimates ~$130M/yr in lost US map-provider revenue).
- **Feb 27, 2026**: Korea's committee **conditionally approved Google's export** of 1:5,000-scale data — but with strict conditions (domestic-partner processing on Korean servers, Korean coordinates restricted on global services, sensitive-site obscuring, contour data excluded entirely, a "red button" takedown mechanism, an in-country compliance officer). Reporting attributes this more to US trade pressure than any security reassessment. ([Korea Herald](https://www.koreaherald.com/article/10684189), [JURIST](https://www.jurist.org/news/2026/02/south-korea-conditionally-approves-googles-high-precision-map-data-export/))
- Even domestic imagery isn't unregulated: Kakao's Sky View imagery goes through the same national security review before publication.

**Implication for Belize:** This is the strongest argument that a from-scratch Belize app is *structurally easier* than a hypothetical Korea competitor — no known Belizean law restricts high-precision map export, no military-obscuring mandate, no national security review gating imagery publication. The app can freely use best-available imagery, host data on any cloud region, with no domestic-server/local-partner requirement. The Belize risk profile is entirely about data *quality/availability* (thin datasets, informal addressing, no incumbent to license from), not regulatory *access* — the opposite problem from Korea's market.

---

### Summary Table

| Topic | Korea reality | Belize implication |
|---|---|---|
| Base map | NGII aerial/LiDAR/satellite + Naver/Kakao MMS fleets, now MOU-linked | No NGII equivalent; commercial imagery + OSM bootstrap + lean in-house MMS |
| Addresses | Dual 지번/도로명 system, reconciled against MOIS's juso.go.kr | No structured dual system; hybrid POI-anchored/informal addressing needed |
| POI/business | Certificate-gated self-registration + likely SME-agency dataset cross-check | No national registry to gate on; open registration + light verification + field outreach |
| Crowdsourcing | Moderated report queues, tiered verification, Naver Pay micro-rewards | Even more essential given data gaps; small human-review queue feasible at Belize's scale |
| Imagery | Annual NGII flights, Arirang satellite, Naver P1/Kakao Road View fleets, security-reviewed | Fully commercial sourcing; lean single-vehicle capture rig realistic |
| Regulation | Export capped at 1:25,000 for foreign firms since 2014; only conditionally lifted for Google Feb 2026 | No equivalent restriction likely — a genuine structural advantage for a new entrant |
