# 10 — Remaining Feature Gaps (2026-09-10)

Follow-up to [09-kakao-naver-feature-audit.md](09-kakao-naver-feature-audit.md), after building live location sharing, the fair meetup-point calculator, the distance/area tool, offline maps, shareable saved-place lists, and weather (with °C/°F). This round asked a broader question: not just "what does Kakao/Naver have," but what's missing across four angles — a refreshed Kakao/Naver check, Google Maps/Waze-style features, Belize/tourism-specific gaps, and iOS-native platform integration (relevant here specifically because this app is iOS-only, which a Kakao/Naver audit — both Android-first apps — would never surface).

Live web research conducted 2026-09-10. Full source links are inline below.

## Angle 1 — Kakao/Naver refresh

Most of their 2025-2026 headline additions (subway/bus live tracking, booking marketplace, Street View/LiDAR-based Road View) depend on infrastructure Belize doesn't have and aren't reconsidered here. Realistic subset:

- **Crowd-sourced POI correction / "report wrong info" flow** — small-medium. A report button + admin review queue; directly useful since the Typesense POI DB is small and young and will have stale/wrong entries (hours, closed businesses, wrong pins).
- **Gas station price/EV tagging** — small. Extends the existing POI category with an optional user-submitted price field; genuinely useful given fuel-price variance across remote parts of the country.
- **Bicycle-specific route exposure** — small. Valhalla already supports bicycle costing; this is UI exposure of what already exists, not new backend work.
- Skip: AR walking overlay (large, low fit for Belize's open sightlines vs. dense Korean cities), booking-marketplace features (assumes a business-partner ecosystem that doesn't exist here).

Sources: [Kakao Map real-time features](https://beautipin.com/blogs/magazine/kakaomap-realtime-subway-guide), [Naver Maps V6 update](https://www.punchkorea.com/naver-maps-update-nov-2025/), [Kakao POI correction](https://www.koreatimes.co.kr/business/tech-science/20250418/local-maps-gain-popularity-but-leave-foreigners-unsatisfied)

## Angle 2 — Google Maps / Waze features

- **Search-along-route** — medium. Find POIs (gas, food, ATMs) with minimal detour along an active route. Reuses existing Valhalla route geometry + Typesense geo search — mostly a query-composition and UI feature, not new infrastructure. Directly useful for Belize's long, sparse inter-town drives (e.g. Belize City–Placencia).
- **User-submitted road hazard/incident reporting** (flooding, washouts, checkpoints, livestock) — medium. Waze's core differentiator, and a real, basically undocumented-anywhere-digital gap in Belize (rainy-season flooding, unpaved-road washouts). Needs a submission UI + auto-expiring reports; skip Waze's new AI voice-based reporting (large, not needed).
- **Saved home/work + one-tap shortcut** — small. Just two named favorites with a quick button, not the same as the deferred account system.
- **Speed limit display/alerts** — medium, with an honest caveat: OSM's speed-limit tagging for Belize's rural roads is patchy, so coverage would be inconsistent outside main highways.
- **Gas price crowd-sourcing** — small-medium, same mechanism as the POI-correction flow above.
- **Nearby search filters (open now, rating, price)** — small if hours/rating/price are already in the POI schema, medium if they need backfilling.
- Defer: **Timeline/location history** — overlaps the deferred user-profile/account-system decision; don't build ahead of that call.

Sources: [Search along route](https://developers.google.com/maps/documentation/places/web-service/sar-overview), [Waze conversational reporting](https://9to5google.com/2025/10/06/waze-conversational-reporting-voice-command-feature/), [Waze gas prices](https://www.autoevolution.com/news/how-to-find-the-cheapest-gas-on-waze-for-android-and-iphone-183791.html), [Google speed alerts](https://developers.google.com/maps/documentation/navigation/android-sdk/speed-alerts)

## Angle 3 — Belize/tourism-specific gaps

Checked existing Belize apps first: the official **Travel Belize** app (BTB) covers activity discovery and itinerary building but *not* live ferry schedules, hurricane logistics, dive-site data, or border-crossing detail. Generic offline-map apps (Belize Offline Map, Mad Map Belize) are static basemaps/POI lists only, no routing integration. Real white space found:

- **Water-taxi/ferry schedule integration** (San Pedro Belize Express, Caribbean Sprinter: Belize City–Caye Caulker–San Pedro–Chetumal) — medium. No app integrates these into a map/routing context today; operators only publish static PDFs. Mostly a data-entry/maintenance task (seasonal schedule changes) plus a UI to show it as a route leg — no live GPS tracking of the boat needed to start.
- **Border-crossing info cards** (Mexico–Santa Elena/Chetumal, Guatemala–Melchor de Mencos: hours, exit-tax reminders, common scam warnings, required documents) — small. Static content pinned to the border POI; directly answers a top pain point in every Belize travel blog checked.
- **Dive-site layer** (Blue Hole, Turneffe, Lighthouse Reef/Half Moon Caye, Glover's Reef — depth, difficulty, recommended operator) — small-medium. No dedicated Belize dive-site map integration exists; this content currently only lives on blog sites. Natural POI-category extension given the reef is Belize's #1 tourism draw.
- **Tour operator directory cross-referenced with BTB's "Gold Standard" licensed-operator list** — small-medium, mostly periodic manual data sync. Helps tourists avoid unlicensed operators, a recurring complaint in Belize travel forums.
- **Hurricane/shelter info panel** (NEMO advisories + shelter locator tied to the user's location) — medium, high value given real hurricane exposure (Jun–Nov), but **honest caveat: no public real-time API from NEMO was found** — this would be manually curated seasonal content, not automated ingestion.
- **Currency/tipping quick-reference card** — small, but low differentiation (easily found elsewhere); nice-to-have filler only.
- **Offline resilience audit** — medium-large. Offline map tiles already work; the next layer is confirming search, saved lists, and the meetup/measurement tools degrade gracefully with zero connectivity, since Belize's 4G coverage (~87% national) drops hard in Mayan villages, jungle interiors, and remote cayes — exactly where tourists most need the app. Note: true satellite SOS is an OS-level iPhone 14+ feature; not something to replicate, just don't let the app crash without signal.

Sources: [Travel Belize app](https://apps.apple.com/us/app/travel-belize/id1566428824), [SPBE ferry schedule](https://belizewatertaxi.com/schedule/), [Caribbean Sprinter](https://sprinter.bz/sailings), [NEMO Belize](https://site.nemo.org.bz/), [Belize border crossing guide](https://alittleadrift.com/crossing-border-belize-chetumal-mexico/), [Belize dive sites](https://www.dive-the-world.com/diving-sites-belize.php), [BTB Gold Standard operators](https://www.vacationbelizetravel.com/belize-gold-standard-approved-tour-operators/), [Belize connectivity](https://ts2.tech/en/belizes-internet-access-exposed-the-untold-story-of-2025s-digital-boom-and-hidden-hurdles/)

## Angle 4 — iOS-native platform integration

React Native cannot run app logic on watchOS or inside a widget/Live Activity in JS — all of these need real native Swift/SwiftUI code bridged via native modules or App Groups. Ranked by complexity-to-payoff:

- **Spotlight search integration** (favorites/recent searches appear in iOS system search) — small-medium, the cheapest native win. Maintained RN wrappers exist (`react-native-spotlight-search`); indexes as Core Spotlight items, handled via an `AppDelegate` continuation callback.
- **Live Activity / Dynamic Island** showing live ETA + next-turn during active navigation — medium-large, but the single most "Kakao/Naver literally cannot do this" feature on the list, and it directly extends the existing Valhalla turn-by-turn feature. Needs an ActivityKit widget extension in SwiftUI plus a native bridge to start/update/end the activity as the route progresses; maintained libraries now exist (`@kingstinct/react-native-activity-kit`) that reduce the native boilerplate.
- **iOS home screen widget** (current weather + nearest favorites, or last-route ETA) — medium. Reuses the weather/favorites data already built; needs a native WidgetKit extension target and an App Group data bridge.
- **Siri Shortcuts / App Intents** ("Hey Siri, navigate to [Favorite]") — medium, and should target the new **App Intents** framework directly (Apple deprecated the older SiriKit intents at WWDC 2026 in favor of App Intents, 2-3 year migration window) rather than legacy `react-native-siri-shortcut`-style libraries.
- **CarPlay** — large. Requires the entire map screen to be Apple's `CPMapTemplate`, not a directly-rendered MapLibre view; no established MapLibre-specific CarPlay reference implementation was found (unlike Mapbox's documented path). A dedicated project, not a quick win.
- **Apple Watch companion app** — large. watchOS has no JS runtime at all — the whole Watch UI has to be written natively in SwiftUI, bridged only for iPhone↔Watch messaging. Effectively a second, fully native app to build and maintain.

Sources: [WidgetKit + RN via App Groups](https://www.unosquare.com/blog/home-screen-widgets-ios-widgetkit-react-native/), [Live Activities RN handbook](https://www.freecodecamp.org/news/react-native-live-activities-handbook/), [CarPlay CPMapTemplate](https://developer.apple.com/documentation/carplay/integrating-carplay-with-your-navigation-app), [App Intents replacing SiriKit](https://dev.to/cross19xx/ios-app-intents-in-an-expo-app-38od), [react-native-spotlight-search](https://github.com/mitsuharu/react-native-search-with-spotlight/), [RN Apple Watch limitations](https://devlancer.io/blog/how-to-build-apple-watch-apps-with-react-native-a-comprehensive-guide-for-2025/)

## Overall shortlist (if only building a handful)

1. Live Activity / Dynamic Island ETA during navigation — flagship iOS-native differentiator
2. User-submitted road hazard/incident reporting — real Belize gap (flooding, washouts, checkpoints)
3. Search-along-route — reuses existing route + POI search infra
4. Ferry/water-taxi schedule integration — no existing app does this well
5. Dive-site layer + border-crossing info cards — small, content-driven, high tourist relevance
6. Crowd-sourced POI correction flow — addresses data-quality debt in a young POI dataset
7. iOS Spotlight integration — cheapest native-iOS win

Defer: AR walk overlay and booking-marketplace features (Angle 1); Timeline/location history (Angle 2 — overlaps the deferred account-system decision); currency/tipping card (Angle 3 — low differentiation); CarPlay and Apple Watch companion (Angle 4 — both large stand-alone native projects, no mature MapLibre path for either).
