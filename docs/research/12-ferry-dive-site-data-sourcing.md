# 12 — Where to Source Ferry Schedules and Dive-Site Data for Belize (2026-09-11)

Follow-up to [10-remaining-feature-gaps.md](10-remaining-feature-gaps.md), which flagged ferry-schedule integration and a dive-site layer as real white space nobody else covers well. Before building either, this asked the honest question first: is there an actual reliable (government or otherwise) source, or does this need manual curation? Two extensive live research passes (government portals, private operators, regional science bodies, aggregators, OSM checked directly via Overpass) — not assumption.

**Headline for both: no API, feed, or authoritative structured source exists for either dataset — government or private.** Both are real, buildable features, but both require this project's first genuinely ongoing *content-curation* commitment (not a one-time data pull) rather than a data-pipeline problem to solve once.

## Ferry / water-taxi schedules

### Government sources — regulate, don't publish
- **Belize Port Authority** (portauthority.bz, confirmed live) — the actual statutory authority (Water Taxi Regulations, SI 29/2019): operators need a permit + Seaworthiness Certificate, must submit passenger manifests 15 min pre-departure. Publishes the *licensing process* only — zero operator directory, zero routes, zero schedules.
- **Belize Tourism Board** (travelbelize.org) — one paragraph of prose naming two operators, no timetable. Its own Terms of Use also **prohibit republishing site content** without permission.
- **Belize open-data portal** — doesn't exist. `data.gov.bz` has no DNS record at all.
- **BNSDI** (portal.bnsdi.gov.bz) — domain is real and was once launched publicly, but every live-fetch and direct `curl` attempt this session failed (`ECONNREFUSED` / timeout) — **currently unreachable**, and its indexed content (Land Information Center) never covered maritime/transport anyway.
- **Border Management Agency / Immigration** — confirmed real, useful supplementary fact: San Pedro's Point of Entry operates **8:00 AM–5:00 PM daily**, a hard constraint on the international Chetumal leg (no boat can legally arrive/depart outside this window) — but this is a checkpoint-hours fact, not a sailing schedule.

### Private operators — every one of them is image/prose-only
San Pedro Belize Express (schedule is a **JPG image**), Caribbean Sprinter (plain HTML, states outright that Facebook is their own change-notification channel — not a feed), Water Jets International/San Pedro Water Jets (plain HTML), Thunderbolt Travels (WhatsApp/Facebook only, no website), Hokey Pokey Water Taxi (a **2016 Google Sites page**), Belize Sea Shuttle Express (WhatsApp contact form only). None use a recognizable SaaS booking platform (Rezdy/FareHarbor/etc.), none publish an API or ICS feed. ("Triple J" and "RGV," names carried over from earlier casual research, could not be confirmed as currently-active operators at all.)

**Concrete proof schedules drift**: Caribbean Sprinter's live page currently shows 6 daily Belize City departures; OpenStreetMap's copy of the same route (last edited Jan 2024) shows only 5, missing two of today's real times. That's ~20 months of confirmed drift on one route alone.

### Aggregators — nothing usable
Rome2Rio and Direct Ferries list Belize routes but disclose no data source (Direct Ferries does run a real B2B booking API, but no evidence Belize's small operators are on it). Transitland and the Mobility Database (the GTFS-feed clearinghouses) have **zero Belize entries** — confirmed via direct search and API probe.

### OpenStreetMap — the one genuinely useful, genuinely imperfect source
Direct Overpass query (not secondhand): **21 `route=ferry` relations** in Belize, several carrying real `operator`/`opening_hours` (actual departure-time lists)/`phone`/`website` tags for SPBE, Water Jets International, Thunderbolt, Sprinter, and Nautilus. ODbL-licensed, free, queryable today with one API call. But confirmed **1.5–2.5 years stale** on spot-check (edit history), incomplete (some routes have no times at all), and demonstrably wrong on at least one route right now (the Sprinter discrepancy above).

### Recommendation
1. Hand-curate a first-party schedule table, sourced primarily from operators' own live pages (belizewatertaxi.com/schedule/, sprinter.bz/sailings, sanpedrowatertaxi.com) — these are also literally what BTB itself links to.
2. Use OSM's Overpass data as a **free seed/cross-reference only**, never as source of truth — every time value needs manual confirmation.
3. Sprinter publishes a free, real **KML of route geometry** (`sprinter.bz/caribbean-sprinter-routes-full.kml`) — worth pulling for map-layer route lines even though it carries no schedule data.
4. Budget a **recurring refresh every 2–3 months**, or right after hurricane season (Jun–Nov) disruption — this is an ongoing content-ops line item, not a one-time build task. There is no way to automate this away given the current state of Belizean digital infrastructure.

## Dive-site data

### Government / conservation authorities — real boundaries, no site-level data
- **Belize Fisheries Department** (fisheries.gov.bz) — the legal authority for marine-reserve zoning (Statutory Instruments). Publishes zone descriptions and one static PDF map (World Bank-produced, 2020). Zero GIS files, zero individual dive sites.
- **CZMAI** (coastalzonebelize.org) — the strongest official GIS lead: a real Coastal and Marine Data Centre with shapefile inventories (zoning, habitat, biodiversity). Only 3 layers are public direct downloads (planning regions, shipping ports/lanes) — everything else, including all habitat/zoning layers, needs a written data-request letter to their Director. Boundary/zoning data only, not dive sites.
- **Belize Audubon Society** (belizeaudubon.org) — names 5 real dive sites at Half Moon Caye (Half Moon Caye Wall, Angelfish Wall, Elkhorn Forest, Tarpon Caves, Eagle Landing) with narrative depth ranges — but no coordinates, no formal difficulty rating.
- **Turneffe Atoll Trust** (turneffeatoll.org) — genuinely has a "Dive Sites" map among 14 downloadable maps — but it's **PDF-only**; site names/coordinates aren't exposed as data, would need manual digitizing.
- **BNSDI** — unreachable this session, same as the ferry finding above.
- **BTB / Franko Maps** — BTB's 2012 "Village Community Dive Map" turned out to be commercially produced by Franko Maps Ltd. and is still sold today for $4.99 as a **georeferenced raster PDF** (Avenza Maps) — not open data, not attribute-queryable.

### Regional science bodies — real data, wrong shape
- **Healthy Reefs Initiative** — real, active reef-health monitoring (coral cover, fish biomass) at hundreds of sites region-wide, with an ArcGIS-based geoportal — but this is ecological *survey* data, not dive-tourism metadata (no depth/difficulty/operator info), and bulk-download access wasn't confirmable this session.
- **Protected Planet / WDPA + Data Basin** — real, downloadable MPA boundary layer for Belize, legally derived from Statutory Instruments — but dated to 2003-04 (predates at least one current reserve) and boundary-level only.
- **UNESCO World Heritage listing** — the cleanest official find of the whole search: **7 named component areas of the Belize Barrier Reef Reserve System with precise centroid coordinates and legal hectare areas** (Bacalar Chico, Blue Hole, Half Moon Caye, South Water Caye, Glover's Reef, Laughing Bird Caye, Sapodilla Cayes) — the best available official anchor points, though still reserve-level, not individual dive sites.
- **REEF** (Reef Environmental Education Foundation) — real global fish-sighting database with a site geocoding system, but Belize's specific zone entries weren't retrievable this session, and the data shape (species sightings) doesn't match dive-tourism needs anyway.
- **WCS Belize** — active, real presence (runs the Glover's Reef research station), no public dataset found.

### OpenStreetMap — directly queried, confirmed thin
Live Overpass query: exactly **4** `sport=scuba_diving` points in all of Belize (Hol Chan Cut, Long Caye Aquarium, Half Moon Wall, one unnamed cave node) — **zero at Turneffe, zero at Glover's Reef** — none carrying depth or difficulty tags. This project already ingests OSM/Overture for its POI pipeline, so this gap is now directly quantified, not assumed.

### Commercial/tourism sources — editorial only, plus one honest surprise
PADI's per-site pages have real depth figures (confirmed: Great Blue Hole, 125m/410ft) but are HTML-only, no API. Island Expeditions and similar sites are good for a **site-name checklist** by atoll but carry no coordinates. A GitHub community project, **dive-vibe-community**, looked promising (11 Belize sites, clean JSON with name/lat/lng/difficulty/maxDepth) — but tracing its own data confirmed it's built directly from the same 4 OSM points plus the same PADI/blog sources already surveyed here, with its own changelog candidly flagging unconfirmed claims it had to walk back. **Not an independent source** — a convenient schema to fork from, not a shortcut past manual verification. (Three other "dive-site API" projects — OpenDeepMap, OpenDiveMap, thediveapi.com — exist with promising schemas but unconfirmed/unverifiable Belize coverage; worth a follow-up check with a real browser render, not a dead end, just unresolved.)

### Recommendation
Two tiers, kept explicitly separate:
1. **Reserve/atoll-level positioning — official and usable today**: UNESCO's 7 component centroids, Data Basin's MPA boundary layer (flag its 2003-04 vintage), and CZMAI's zoning shapefiles if pursued via their formal request process.
2. **Individual named dive-site data — genuinely doesn't exist as structured data anywhere.** Manually curate from the most-authoritative descriptive sources actually verified live (PADI's per-site pages for real depth figures, Belize Audubon's Half Moon Caye page, Island Expeditions/AmbergrisCaye.com for site-name breadth per atoll, Turneffe Atoll Trust's PDF map digitized by hand), then **position each curated site against the tier-1 boundary data** (e.g., place "Half Moon Wall" inside the Half Moon Caye Natural Monument centroid) rather than inventing precise coordinates — and label site coordinates as curator-estimated unless later refined. Don't build on OSM alone (confirmed too thin), but do consider contributing curated sites back to OSM afterward, consistent with this project's existing OSM/Overture-based pipeline philosophy. The dive-vibe-community JSON schema is fine to fork structurally; every fact in it still needs the same verification as the underlying blogs.

## What this means for this project

Both features are real and worth building, but both convert this project's usual "find a real API/tool, verify it live, wire it up" pattern into something new: a **manually-curated content dataset with an explicit, recurring maintenance cadence** — closer in spirit to the POI-correction moderation queue ([11-kakao-naver-poi-data-sourcing.md](11-kakao-naver-poi-data-sourcing.md)) than to any of this project's other routing/search/tile infrastructure, all of which are live, self-updating services. Scoping either feature should budget for that ongoing cost explicitly, not just the initial build.
