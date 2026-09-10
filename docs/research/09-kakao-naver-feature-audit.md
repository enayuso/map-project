# What Else Kakao Map / Naver Map Offer — Feature Audit and What's Realistic for Belize

**Date:** 2026-09-10
**Purpose:** [07-naver-kakao-proprietary-gis.md](07-naver-kakao-proprietary-gis.md) and [08-comparative-data-sourcing-landscape.md](08-comparative-data-sourcing-landscape.md) covered how these apps' *data/tech* works. This is different: a live, 2026 audit of their actual *consumer-facing feature sets* — what a user can tap and do — cross-referenced against this project's own status and Belize's real constraints, to answer "what should we build next?"

**Methodology note:** built from two parallel live-research passes (one per app), not recalled from training data — Kakao/Naver ship new features constantly (several found below launched within the last few months of this research date), so anything older than a live search would likely already be stale.

## The full feature lists

Both research passes turned up far more than the synthesis below needs — real-time subway/bus tracking, indoor AR navigation, cadastral overlays, driving-score analytics, receipt-review rewards points, and dozens more, each independently sourced with explicit "could not confirm" flags where the research hit a dead end. Ask if you want the full raw lists; what follows is the synthesis that actually matters for this project: what's already built, what's genuinely blocked, and what's worth doing next.

## Already have (confirmed parity)

Search, category browsing, place cards with travel-time preview, favorites/recents, satellite/hybrid toggle, turn-by-turn navigation with live camera-follow, a Naver/Kakao-style two-field directions card with map-tap/pan-to-select/current-location input, a draggable route bottom sheet, data attribution, 3D-capable vector rendering, zoom/compass controls. See [PLAN.md](../PLAN.md) Phase 4.5 for the full built list.

## Real features, not feasible here (yet) — and why

These aren't oversights; they're blocked by the same structural gaps [08](08-comparative-data-sourcing-landscape.md) already documented, not by engineering difficulty:

| Feature (both apps have it) | Why not now |
|---|---|
| Real-time subway/bus arrival, integrated transit routing | No GTFS feed exists for Belize anywhere, no subway/train at all — already flagged in [PLAN.md](../PLAN.md) Phase 5 as needing hand-authored data before any routing engine can use it |
| Real-time traffic-aware routing | Needs either a government sensor network (Korea's VDS/CCTV feed) or years of first-party probe data from an active user base — already flagged in [PLAN.md](../PLAN.md) Phase 5 |
| Speed/enforcement camera alerts, CCTV/traffic-camera view | Requires a live camera network Belize doesn't have |
| Street-level imagery (로드뷰/거리뷰, launched 2008/2010 respectively) | Already flagged in [PLAN.md](../PLAN.md) Phase 5 — "a lean single-vehicle 360°-camera rig... a meaningful post-launch investment, not v1" |
| EV charging search, gas-price comparison, toll estimates | Belize has negligible EV infrastructure and (per general knowledge of the region, not independently re-verified this pass) government-regulated, largely uniform fuel pricing and no toll roads — low value even if built |
| Business listing pages with owner self-service, reviews, reservations, coupons/deals, delivery handoff | This is exactly Phase 3 Track B (the places platform) — built, verified, then **explicitly reverted at your direction** ("wait for BNSDI... neither Naver nor Kakao actually let ordinary users add places directly"). Nothing here changes that decision |
| Indoor maps for malls/stations | Belize doesn't have complex multi-story venues at the scale that would justify this |
| AR walking/driving navigation | Technically buildable (camera + device heading + our own route data) but a genuinely large lift — ARKit integration, not just a UI feature — and both companies' own AR nav is narrower than it sounds (Naver's is indoor-only via a whole separate spatial-AI pipeline; Kakao's is driving-only and carrier-gated). Worth a future look, not a near-term pick |

## Genuinely worth building — ranked

Unlike the table above, everything here is blocked by nothing except deciding to build it — no missing Belize data, no missing partnership, no licensing wall.

1. **Live location sharing with another person** (Naver/Kakao's own most-recently-overhauled social feature — Kakao's "친구위치" just removed its old time-limit entirely in Nov 2025). Genuinely high-value, and — notably — this is pure product engineering: it needs a small new piece of infrastructure (a live position → share-code mapping, polled or pushed), not richer Belize data. Neither app's version is Belize-data-dependent, so this is a clean port.
2. **A grid-based backup address system** — directly attacks this project's own most-repeated finding: thin/informal addressing (13% housenumber coverage in Belize City, worse elsewhere, per [06-pilot-region-data-audit.md](06-pilot-region-data-audit.md)). Kakao has what3words integration; **the free, Apache-2.0-licensed equivalent is Google's Open Location Code ("Plus Codes")** — confirmed via live licensing research this pass: what3words' API is a paid, usage-billed commercial product, while Plus Codes is fully open-source, free, no fee at any volume ([google/open-location-code](https://github.com/google/open-location-code/blob/main/LICENSE)). Given Locked Decision 3 (hobby budget, avoid anything that becomes a real bill later) and Locked Decision 4 (commercial-permissive licensing only), Plus Codes is the clear pick over what3words, not just the cheaper one. A place with no street address at all could still get a shareable, precise "6-character-plus-locality" code — genuinely more useful here than in Seoul, where thin addressing isn't the problem it is in Belize.
3. **A meeting-point / "fair midpoint" calculator** — interesting: **neither Kakao nor Naver actually has this as a native feature** (confirmed by both research passes independently — both route users to third-party apps built on their APIs for this). Fully buildable with what's already running (Valhalla for route-based fairness, not just straight-line midpoint) — a rare case of building something better than both references, not just catching up.
4. **Distance/area measurement tool** — Kakao has this; low effort, fully self-contained (tap points, draw a line/polygon, sum distance/area), no external data dependency at all.
5. **Named, shareable saved-place folders** (Naver's Dec 2022 upgrade from flat favorites to organized, shareable lists) — builds directly on the existing `favorites.ts`/AsyncStorage groundwork rather than replacing it.

**Lower priority, mentioned for completeness:** a live weather overlay (Open-Meteo is free/keyless and would work, but it's polish, not a gap); a "trending places" home-screen feature (both apps' versions are powered by aggregate usage data at a scale this app doesn't have yet — could be approximated from Typesense search-frequency later, not now).

## What this means

None of the ranked list above requires new Belize-specific data, a new partnership, or a licensing decision beyond "use the free option" (#2). That's a different category of work than most of Phase 3/4.5 — those needed real Belize data engineering; these need product engineering on top of infrastructure that already exists. Worth picking based on what you actually want to use/show off next, not on unlocking new data.

The user-profile system mentioned in conversation (2026-09-10) is a reasonable *next* structural piece after one or more of these — location sharing and shareable saved-place folders in particular would benefit from having real user identity rather than device-local state, but aren't blocked on it (both are buildable device-local/link-based first, same as this app's existing favorites).
