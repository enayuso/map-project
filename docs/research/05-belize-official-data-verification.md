# Verification: Belize's Own GIS Infrastructure (BNSDI & LIC)

*Follow-up to [01-data-collection.md](01-data-collection.md), which flagged Belize's National Spatial Data Infrastructure (BNSDI) portal and Land Information Centre (LIC) but didn't verify them in depth. This document does that verification directly. Date checked: 2026-09-09.*

## Short answer

**Both are real, legitimate, currently-existing Belizean government bodies** — this was correct. But **the live web portal for both is unreachable right now** (verified independently three ways below), and even when it's up, the public-facing side looks like a **metadata catalog/viewer**, not a self-serve bulk-download API — practical access to the actual cadastral/parcel data likely requires a **formal request to a physical LIC office**, not a script hitting a download URL. Treat these as a real, valuable supplementary/enrichment data source to pursue in parallel, not as an automatable Phase-0 data source to depend on for the pilot build.

---

## 1. Confirmed identity and history

- **BNSDI (Belize National Spatial Data Infrastructure)**: a real government initiative under the **Ministry of Natural Resources**, publicly unveiled as a web portal — covered by Belizean national news at the time. Its stated purpose: "a framework for the coordinated development and sharing of geospatial data and its application to sustainable and climate resilient national development and investment." ([Channel 5 Belize archive](https://archive.channel5belize.com/archives/190458), [portal.bnsdi.gov.bz](https://portal.bnsdi.gov.bz/))
- **LIC (Land Information Centre)**: established in **1992** as the first Belizean government agency with GIS capacity; base layers originally came from the U.K. Directorate of Overseas Surveys' 1:50,000 topographic sheets. It "centralizes, compiles/generates, organizes and shares data pertaining to the land" — surveys, parcel data, valuation zones, zoning plans, land use maps, land inventory — and separately serves as a repository for protected areas, land use/land cover, infrastructure, and building-footprint data. ([Caribbean GIS: Belize NSDI](http://www.caribbeangis.org/2009/08/belize-nsdi.html), [portal.bnsdi.gov.bz/lic](https://portal.bnsdi.gov.bz/lic))
- **The technical backbone is real and substantial**: LIC's cadastral/land-registration system runs on **Landfolio** (Trimble, now Spatial Dimension), integrating the Surveys and Mapping, Valuation, Land Registry, Physical Planning, National Estates, and Inland Revenue departments across six district offices. A vendor case study gives concrete scale: **126,360 parcels registered under the Land Registration Act (Torrens system)**, **~2,659 Certificates of Title**, **~20,776 Common Law Conveyance deeds**, and **1.6 million paper land records digitized and linked to mapped parcels**. Initial digitized parcel positions needed correction via field survey + orthophoto alignment — i.e., real remediation work has gone into positional accuracy, not just a raw scan of old maps. ([Spatial Dimension case study](https://www.spatialdimension.com/articles/belize-land-information-system))

**Conclusion**: this is not vaporware or an abandoned announcement — Belize genuinely has a multi-decade-old land administration system with six-figure parcel counts, run by a real technical vendor, integrated across multiple ministries.

## 2. Live accessibility, verified today (2026-09-09)

I tested `portal.bnsdi.gov.bz` and `naturalresources.gov.bz` (the ministry site hosting LIC's office directory) from **three independent network paths**:

| Path | Result |
|---|---|
| This session's sandbox (`curl`, direct) | Connection timed out |
| Anthropic's WebFetch service | Connection refused |
| In-app Chromium browser (separate network) | Navigation denied/failed |

To rule out a network block on my end rather than a real outage, I checked other Belizean government domains from the same sandbox: **`sib.org.bz`, `customs.gov.bz`, and `elections.gov.bz` all responded normally (HTTP 200)**; `www.belize.gov.bz` returned a 503 (its own server error). This isolates the problem to the BNSDI/Ministry of Natural Resources hosting specifically (both sites resolve to the same IP subnet, `200.32.193.28`/`.30`) — **not** a general block against `.bz` government sites.

**This looks like a real, current outage on the government's end** — but not a long-dead project: the Wayback Machine has a clean, successful capture of the BNSDI portal's "About" page as recently as **April 13, 2026** (~5 months before this check), and a "Data Source Table" capture from **January 22, 2026**. So the portal was functioning within the last two quarters; today's unreachability should be treated as **intermittent government-infrastructure uptime, not permanent shutdown** — worth periodically rechecking, not writing off.

## 3. What the portal actually offers (from archived captures + search-indexed descriptions)

One technical wrinkle limited how much I could recover from archives: BNSDI's portal is a JavaScript-heavy site (ASP.NET-based, `Secure/Login.aspx` auth path visible in the markup) where the actual content — page text, and especially the data-source-table rows — loads via a backend AJAX call after the page shell renders. The Wayback Machine only captures the static shell, not that follow-up API call, so every archived content page shows a generic **"Some thing went wrong; Contact administrator"** placeholder instead of real text. This is an archiving artifact, not evidence the live site is broken this way.

Piecing together what's real from the site's navigation structure and independently-crawled search snippets, the portal offers:

- **Geo-Portal** (`/geo_portal`) — an interactive map viewer
- **Data Source Table** (`/data-source-table`) — a catalog organized by **Ministry → Department → DataID → Dataset Name → National Basemap Theme** (confirmed structure from a partially-rendered archived screenshot: e.g. "Ministry of Agriculture, Forestry, Fisheries, the Environment, Sustainable Development and Climate Change → Agriculture Department" as one category)
- **Meta Data**, **FGDS** (Fundamental Geospatial Data Set), and a **Metadata Profile/disclaimer** page — standard NSDI metadata-registry components
- A **Landuse Tool**
- Content explicitly mentioned in search-indexed summaries: locations of **hospitals, health clinics, police stations, fire stations, and tourist attractions**, plus LIC's **protected areas, land use/land cover, and infrastructure** layers

**This is the profile of a metadata catalog/map viewer, not a bulk open-data download API.** That's a very common pattern for early-/mid-stage national SDIs worldwide (think a GeoNetwork-style catalog: records describe what a dataset is and who owns it, pointing you to the custodian agency, rather than serving a direct shapefile/GeoJSON download or a WFS endpoint). Nothing found confirms a public download or web-service (WMS/WFS/REST) endpoint independent of the portal's own viewer.

## 4. How LIC data is actually obtained in practice

LIC's own public-facing page (on `naturalresources.gov.bz`, a separate WordPress-based site that archived cleanly — no AJAX issue) is a **directory of physical district offices**, not a data catalog:

| Office | Address | Phone |
|---|---|---|
| Belize City | Queen Street, Belize City | (501) 280-5263 |
| Belmopan City | H.M. Queen Elizabeth II Blvd, Cayo | (501) 822-0667 / 880-0667 |
| San Ignacio | Buena Vista Street, Cayo | (501) 880-5263 |
| Dangriga | St. Vincent Street, Stann Creek | (501) 580-5263 |
| Punta Gorda | 41 Prince Street, Toledo | (501) 780-5263 |
| Orange Walk | Otro Benque Road, Orange Walk | (501) 480-5263 |
| Corozal | 5th Street South, Corozal | (501) 580-5263 |

Hours: Mon–Thu 8:00am–5:00pm, Fri 8:00am–4:30pm.

**This confirms the practical access model**: LIC operates as a land-registry/survey service with a real office network, oriented around property-transaction services (registration, titles, valuation) — not an open-data portal. Getting cadastral/parcel shapefiles for the pilot region almost certainly means a **direct data-sharing request** (email/call/visit — the Belize City office is the relevant one for the pilot's Belize City coverage) rather than a script hitting a URL.

## 5. Implication for the project plan

This changes Phase 0 in one concrete way: **BNSDI/LIC data is real and worth having, but it's a manual/relationship-based acquisition track running in parallel to the automated pipeline, not a Phase-0 blocking dependency.**

- ✅ **Keep OpenStreetMap as the primary, automatable Phase 0/1 data source** — it's the only source that's reliably scriptable today (Geofabrik/HOT extracts, no request process, no uptime risk).
- 🔜 **Open a parallel track: formally request pilot-region data from LIC.** Concretely — contact the Belize City LIC office (Queen Street, (501) 280-5263) and/or the Belmopan HQ, and ask specifically for: cadastral/parcel boundaries, administrative boundary polygons, and any road-centerline data for Belize City and Ambergris Caye/San Pedro. Frame it as a data-sharing/collaboration request; government land agencies often have a formal process for this (sometimes an MOU) rather than instant self-serve access — expect this to take real calendar time, so start it early rather than blocking Phase 1 on it.
- 🔁 **Periodically recheck `portal.bnsdi.gov.bz`** (both the Geo-Portal and Data Source Table) — it was working as recently as April 2026, so this is plausibly a temporary outage. If/when it's back up, its **Data Source Table** is the fastest way to see exactly what's downloadable without needing the office visit.
- 🗺️ **When BNSDI/LIC data is obtained, it should supersede OSM for the layers it covers** (parcels, admin boundaries) per [research/03-geocoding-search.md](03-geocoding-search.md)'s reverse-geocoding recommendation — OSM remains the fallback/gap-filler, not the other way around, for anything Belize's own authoritative source actually provides.

**Sources**: [Channel 5 Belize — BNSDI portal unveiled](https://archive.channel5belize.com/archives/190458), [portal.bnsdi.gov.bz](https://portal.bnsdi.gov.bz/) (navigation structure via Wayback Machine captures [2026-01-22](http://web.archive.org/web/20260122133309/https://portal.bnsdi.gov.bz/data-source-table), [2026-04-13](http://web.archive.org/web/20260413114449/https://portal.bnsdi.gov.bz/about-us)), [Caribbean GIS blog — Belize NSDI](http://www.caribbeangis.org/2009/08/belize-nsdi.html), [Spatial Dimension — Belize Land Information System case study](https://www.spatialdimension.com/articles/belize-land-information-system), [naturalresources.gov.bz — Land Information Center](https://naturalresources.gov.bz/index.php/land-information-center/) (via [Wayback capture, 2026-03-15](http://web.archive.org/web/20260315113804/https://naturalresources.gov.bz/index.php/land-information-center/)), direct connectivity tests run 2026-09-09 against `portal.bnsdi.gov.bz`, `naturalresources.gov.bz`, `sib.org.bz`, `customs.gov.bz`, `elections.gov.bz`, `www.belize.gov.bz`.

## 6. Re-checked, same day (2026-09-09) — still down, but new technical detail

Asked directly whether the outage had changed or whether we're already using BNSDI (we're not — OSM remains the only live data source). Re-ran the same three-path check:

| Path | Result |
|---|---|
| Sandbox `curl` | Connection timed out (same as before) |
| WebFetch | `ECONNREFUSED 200.32.193.28:443` (same IP, same failure) |
| In-app browser | Navigation denied (same as before) |

**Still an active outage**, not resolved since the original check — but a full Wayback CDX query (1,837 captures across the domain, not just the two pages checked before) found a **more recent successful capture than previously documented**: `/NSDI` returned HTTP 200 on **2026-06-14** — about 3 months before today, versus the April 13 capture found originally. Also newly found: `/landuse-tool` (200, 2026-05-17), `/status-update` (200, 2026-02-09), `/EC` (200, 2026-03-16) — pages not previously known to exist. So the outage is more recent than first thought, but the portal was genuinely alive within the last quarter, not the last two.

**New technical detail**: the Geo-Portal (`/webGIS/`) is a **self-hosted Esri ArcGIS Web AppBuilder (Developer Edition) application** — confirmed directly from a cached page shell (`jimu.js`, `ArcGIS Web Application` title, standard WAB file structure: `env.js`, `simpleLoader.js`, `init.js`). This is useful context for a future data-sharing conversation (whoever administers it is running real, recognizable GIS infrastructure, not something bespoke) but doesn't help access data right now: it's self-hosted rather than backed by Esri's own cloud (no `arcgis.com` references), so its underlying ArcGIS REST feature services — which is where the actual downloadable data would live — are presumably hosted on the same government infrastructure that's currently down, not independently reachable. The WAB app's `config.json` (which would list those exact REST service URLs) was never crawled by Wayback, so the precise service endpoints remain undiscovered — worth checking for directly (e.g. `portal.bnsdi.gov.bz/webGIS/config.json`) once the portal is reachable again.

**Bottom line, unchanged**: OpenStreetMap remains the only live, automatable data source this project actually uses. BNSDI is real, worth periodically rechecking, and now slightly better understood technically — but still not accessible today, and still not something to build automation around until (a) it's back up and (b) its actual data-access model (self-serve download? REST API? still request-only?) is confirmed once someone can actually load the site.
