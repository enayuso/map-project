# 14 — How Naver and Kakao Handle User Profiles (Creation, Customization, Backend) — and What's Realistic Here

**Date:** 2026-09-15
**Purpose:** a user-profile system was already flagged as a reasonable *next structural piece* back in [09-kakao-naver-feature-audit.md](09-kakao-naver-feature-audit.md) and explicitly deferred pending that decision in [10-remaining-feature-gaps.md](10-remaining-feature-gaps.md). Before building one, this is a thorough live-research pass into how Naver and Kakao actually do it — profile creation, customization, *and* the backend/data side (storage, retention, the infrastructure involved) — so a Belize-app version is grounded in what these two actually do, not guessed at, and right-sized for this app's real scale rather than copied wholesale.

**Methodology note:** live web research conducted 2026-09-15, not recalled from training data. Split deliberately into three tiers of confidence, marked at every claim: **confirmed** (an official developer doc, a company's own open-source project/tech blog, or a published privacy policy), **reported** (a specific claim from an independent write-up — a blog, a forum analysis — that looks credible but isn't from Naver/Kakao themselves), and **not found** (searched for, not confirmed, called out rather than guessed). Neither company publishes deep internal architecture for their core identity/profile systems — normal for any company this size, not a gap specific to this pass.

## 1. Naver's profile system (consumer-facing)

One **Naver ID** is the umbrella account across every Naver service (Search, Blog, Cafe, Pay, Map) — there's no Map-specific account, only a Map-specific *surface* on top of the same identity.

That surface is **MY플레이스 (My Place)**, launched 2020: a personal page aggregating everything a user has reviewed on Naver Map/Place, with its own profile customization ("프로필 꾸미기") and a settable review theme. January 2021 added reviewer follow/follower relationships. A 2023 redesign (per ZDNet Korea's coverage) added:

- **Video reviews** — up to 10 clips per review, with in-app filter/crop editing
- **Expanded scope** — reviews/visit-verification extended beyond restaurants/cafes/salons to natural attractions and regional landmarks
- **A "creator" framing** — prolific reviewers are explicitly positioned as content creators, not just customers leaving feedback
- **An SNS-style feed** for browsing other people's reviews, plus "interest location" settings for personalized discovery
- **Trust mechanism**: for paid establishments, only reviews from visits verified by a receipt or card statement are shown publicly — review authenticity is tied to a real transaction record, not just being logged in
- **Badges**: active/quality reviewers earn badges displayed around their profile photo — the exact tier names/thresholds weren't confirmed this pass, but the mechanism (badge as a visible trust/engagement signal, not just cosmetic) is confirmed across multiple sources

Sources: [ZDNet Korea — My Place redesign](https://zdnet.co.kr/view/?no=20230424105053), [나무위키 — 네이버 플레이스](https://namu.wiki/w/%EB%84%A4%EC%9D%B4%EB%B2%84%20%ED%94%8C%EB%A0%88%EC%9D%B4%EC%8A%A4), [Weekly UX/UI Challenge — 네이버 지도 마이플레이스](https://weeklyuxuichallenge.oopy.io/55e4c9d5-b7a9-4ab8-9c70-07d221635d6c)

## 2. Kakao's profile system (consumer-facing)

One **Kakao Account** is the umbrella identity across Kakao's services (Talk, Map, Pay). KakaoTalk's own profile — photo, cover/background image, status message, display name, a "D-day" counter, background music — is the baseline every Kakao service reads from.

**Multi-profile** (멀티프로필, ~2022) is the standout customization feature: up to **3 separate profiles** per account, each independently set (own photo, cover, status message, name, D-day, music). Its real point isn't variety — it's **privacy segmentation**: a "designated friends" list *per profile* controls exactly who sees which version, and a per-profile privacy toggle can hide newly-posted photos/status from anyone not on that specific list. This is solving a genuine friend-graph problem (showing a different face to coworkers vs. close friends vs. a hobby-group chat) that only exists once an app has a real friend graph to segment.

**Kakao Map's own reviewer system** is separate from KakaoTalk's identity customization — it's a trust/reliability layer over reviews:

- **"골드 리뷰어" (Gold Reviewer)** status: 50+ reviews written, with an average rating between 2.5 and 4.2 (excludes both low-effort raters and rubber-stamp 5-star-everything accounts) — *reported* (an independent write-up, not an official Kakao spec)
- A **reliability-weighting formula**, also *reported*, not official: a reviewer's influence on a place's score scales with (a) review volume, log-scaled and saturating around 100 reviews, times (b) rating discrimination — how far their *average* rating sits from an extreme, peaking near 3.2
- **Fake-positive-review ("칭찬봇") detection**, tiered by how suspicious the pattern is: an account averaging ≥4.9 stars is flagged after just 3 reviews; ≥4.7 after 7; ≥4.5 after 25 — the threshold tightens as the average creeps toward "everything gets 5 stars"
- Note: this is *not* the same thing as Danggeun Market (당근마켓)'s well-known "매너 온도" (manner temperature) — that's a different Korean app's peer-rating gauge entirely; Kakao Map's mechanism above is its own, separate system

Sources: [카카오톡 멀티프로필 가이드 — Brunch](https://brunch.co.kr/@meppy/306), [다나와 — 멀티프로필 설정/삭제](https://v.daum.net/v/WFZjB4ZvSH), [카카오맵 리뷰 분석 — 아이보스](https://www.i-boss.co.kr/ab-2987-483352), [카카오맵 리뷰 175만 건 분석 — Brunch](https://brunch.co.kr/@230kimi/64)

## 3. What a "profile" concretely contains — grounded in public developer API schemas

The single most concrete, verifiable layer of this research: both companies publish **exact response schemas** for third-party developers integrating "Login with Kakao/Naver" — which doubles as the best public documentation of what a profile record actually holds internally, since it's a contractually-stable API, not a blog post that can drift.

**Kakao Login** (`GET https://kapi.kakao.com/v2/user/me`) — confirmed directly from `developers.kakao.com`:

| Field | Type | Consent scope |
|---|---|---|
| `id`, `connected_at`, `has_signed_up` | — | none (always returned) |
| `kakao_account.profile.nickname` | string | Profile Info *or* Nickname |
| `kakao_account.profile.profile_image_url` | string, 640×640px | Profile Info *or* Profile image |
| `kakao_account.profile.thumbnail_image_url` | string, 110×110px | Profile Info *or* Profile image |
| `kakao_account.profile.is_default_image` | boolean | Profile Info *or* Profile image |
| `kakao_account.email`, `is_email_valid`, `is_email_verified` | — | Email |
| `kakao_account.name` | string | Name |
| `kakao_account.age_range` | string, e.g. `"20~29"` | Age range |
| `kakao_account.birthyear` / `birthday` / `birthday_type` (SOLAR/LUNAR) | — | Birth Year / Birthday |
| `kakao_account.gender` | enum `female`/`male` | Gender |
| `kakao_account.phone_number` | string | Phone number |
| `kakao_account.ci` | string (encoded national ID linkage) | CI (Connecting Information) |

Every optional field carries its own `{field}_needs_agreement` flag — Kakao's consent model is **field-by-field**, not "all-or-nothing," a genuinely finer grain than the Google/Apple norm of bundling name+email as one consent. Token model: access token ~12h, refresh token ~60 days (auto-renewed once under a month remains), optional OIDC ID token for apps with OpenID Connect enabled.

**Naver Login** (`GET https://openapi.naver.com/v1/nid/me`) — confirmed field list: `id`, `nickname`, `name`, `email`, `gender` (F/M/U), `age`, `birthday`, `birthyear`, `profile_image`, `mobile`. Simpler consent model than Kakao's (coarser scopes), and a real caveat found during this research: developers have publicly reported `age`/`gender`/`profile_image` intermittently returning `null` even with consent granted — worth treating as "may be absent," not guaranteed, in any integration.

Sources: [Kakao Developers — Login REST API](https://developers.kakao.com/docs/latest/en/kakaologin/rest-api), [naver/naveridlogin-sdk-android issue #52 — profile fields returning null](https://github.com/naver/naveridlogin-sdk-android/issues/52)

## 4. Backend/infrastructure — confirmed vs. inferred, kept honestly separate

- **Confirmed** (Kakao's own open-sourced project): Kakao built and open-sourced **S2Graph**, a large-scale distributed graph database running on HBase/HDFS/Hadoop, deployed across 20+ Kakao services including KakaoTalk — purpose-built for real-time breadth-first search over graph-shaped data. That's exactly the *shape* of data a "who's my friend, what profile do I show them" system needs (multi-profile's per-friend visibility rules are a graph query), though Kakao's own write-up doesn't state profile-visibility specifically runs on it. Graph API layer: Scala + Play framework, with HBase/Kafka/Spark underneath.
- **Confirmed** (Kakao's own commercial cloud product): **Kakao Cloud** sells Object Storage + CDN — S3-style storage for unstructured data (images), fronted by a CDN with per-domain cache-policy configuration, marketed with an explicit image-upload tutorial. **Inferred, not confirmed**: Kakao's own consumer apps likely use this same object-storage-plus-CDN shape internally for profile photos, since it's the standard pattern for "many small images served to many users cheaply" — but no source directly states KakaoTalk's photos run on this exact product.
- **Partially confirmed**: Naver's `*.pstatic.net` domains (`phinf.pstatic.net`, `shop-phinf.pstatic.net`, etc.) are Naver's own dedicated image-serving/CDN infrastructure, used across blog posts, product images, and more — confirms a separate image-CDN layer exists, distinct from Naver's main web servers. The actual backing store behind it wasn't found in public documentation this pass.
- **Not found this pass, commonly repeated**: Naver historically built and open-sourced **Cubrid**, a relational database — widely cited in Korean tech discussion, but no source found this pass specifically tying Cubrid to the NAVER ID/account/profile system (as opposed to other Naver products). Flagged as unconfirmed, not stated as fact.
- **Confirmed** (both companies' published privacy policies) — concrete retention/deletion mechanics:
  - **Kakao**: an account inactive 1 year is flagged dormant and its data segregated from the active system; if still never logged into after 4 *more* years, the segregated data is permanently destroyed. A deletion request is honored "without delay," except where other law or internal policy requires retention.
  - **Naver** (via Naver Cloud's published privacy policy — the main consumer naver.com policy wasn't separately fetched this pass, a real gap): personal data is destroyed "without delay" on account withdrawal or once the purpose of collection is fulfilled.
  - Both anchor to Korea's **Personal Information Protection Act (PIPA)** and the Act on Promotion of Information and Communications Network Use — Korea-specific statutes. This app's users wouldn't be under Korean jurisdiction, so this is useful *precedent/context* for a sane retention policy, not a compliance requirement this project inherits.
- **Confirmed, contextual**: neither Naver nor Kakao is a government-designated "본인확인기관" (identity-verification authority) in Korea — real identity verification for things like financial signup still routes through Korean mobile carriers, even though both companies sell their own certificate/authentication products. Relevant only as a reminder that Korean platforms' account systems lean on a *national carrier-verification layer* with no Belize equivalent — not something to try to replicate, and not something a map app's profile would need anyway.

Sources: [Kakao 오픈소스 — S2Graph](https://tech.kakao.com/2016/01/29/opensource-1-s2graph/), [Kakao Cloud — Object Storage](https://kakaocloud.com/services/object-storage/intro), [Kakao Cloud — image upload tutorial](https://docs.kakaocloud.com/en/tutorial/storage/object-storage-image-upload), [Kakao Cloud — CDN overview](https://console.kakaoi.io/docs/posts/cdn/2022-11-20-cdn_ov/cdn_ov), [Kakao Privacy Policy](https://www.kakao.com/policy/privacy?lang=en), [KakaoTalk dormant-account policy coverage](https://www.digitaltoday.co.kr/en/view/655/kakaotalk-accounts-auto-deleted-after-3-years-of-inactivity-personal-data-destroyed-immediately), [NAVER Cloud Privacy Center](https://privacy.navercloudcorp.com/en/PrivacyPolicy/ncs), [네이버·카카오 본인확인기관 관련 — 파이낸셜뉴스](https://www.fnnews.com/news/202304200602031645)

## 5. What this actually means for this app — a scoped, honest recommendation

**Current state check first**: this app has *zero* accounts anywhere today. Every existing per-user-feeling feature — favorites, saved lists, location shares — is either pure on-device AsyncStorage or a short-code trust model with, in `sharing/README.md`'s own words, "no login, no friend graph... **not** real authentication." A profile is a genuinely bigger structural step than anything built so far: the first feature that needs real identity, not a device-local preference or a shareable link.

**The deciding factor isn't Naver/Kakao's approach — it's Apple's.** This app is iOS-only (a standing project constraint), which makes **App Store Review Guideline 4.8** the actual governing rule: if a third-party/social login is offered to set up or authenticate the *primary* account, **Sign in with Apple must also be offered**, meeting three bars — collect only name+email, let the user hide their real email via a relay, and don't track for ads without separate consent. Sign in with Apple satisfies all three itself. The simplest, cheapest compliant path for a solo iOS-only app: **offer only Sign in with Apple** — free, no separate multi-scope consent system to build (unlike Kakao's field-by-field model above), no password storage/reset flow to build or secure, and 4.8 doesn't even trigger since there's no other third-party login alongside it to match.

**What to actually store in v1** — a nickname (editable, doesn't need to be a real name), an optional avatar image, a "member since" date, and links to what's *already real* in this app's own data (e.g., how many saved-place lists exist, how many meetups run) — start at "lightweight identity plus a couple of genuinely-already-true stats," not Naver/Kakao's multi-year-evolved reviewer-grade/badge/creator economy. Their systems answer a trust-and-abuse problem that comes from national-platform scale (tens of millions of reviews, fake-review-bot detection as a real necessity); building "Gold Reviewer" grading or bot-detection now would be anti-abuse infrastructure for an abuse problem this app doesn't have yet.

**Multi-profile (Kakao's per-audience segmentation) doesn't apply** — it solves a friend-graph privacy problem, and this app has no friend graph at all. Worth reconsidering only if/when a social layer gets built on top of a first profile system, not before.

**Backend — extend the existing pattern, don't introduce new infrastructure**: same `belize` Postgres database every other service already uses, same small-FastAPI-service shape as `sharing/` (a new router within it, or a new equally-small service — a call to make once the real field list is settled), keyed by Sign in with Apple's own stable user identifier (**not** email — Apple's "Hide My Email" relay means email isn't a stable per-user key to build on). Two real options for avatar storage, weighed against Locked Decision 3 (hobby budget, avoid anything that quietly becomes a recurring bill) and Locked Decision 4 (commercial-use-permitted licensing):

1. **Store small avatars (capped resolution, a few hundred KB) directly as `bytea` in the same Postgres row.** Zero new infrastructure — consistent with this project's own established reasoning for *not* reaching for Redis in `sharing/` ("genuinely too small to justify standing up unfamiliar new infrastructure"). Downside: grows Postgres backup size over time, no edge/CDN caching.
2. **Cloudflare R2** — S3-compatible object storage, confirmed free tier: 10 GB-month storage, 1M write operations, 10M read operations per month, and — the standout feature versus AWS S3 — **zero egress fees at any volume, on any plan**. Directly relevant to Locked Decision 3: image-serving egress is exactly the kind of usage-based cost that can surprise a hobby project once it has real traffic.

Recommendation: start with option 1 for v1 (expected avatar volume is tiny at launch), move to R2 only once/if avatar traffic actually approaches the free tier's ceiling — don't pre-build for scale this app doesn't have yet, matching how every other infra decision in this project has been made.

**Explicitly skip for now** (same "deferred" call as [10-remaining-feature-gaps.md](10-remaining-feature-gaps.md) already made for the account system generally): reviewer grades/badges, follow/follower graphs, video reviews, fake-review-bot detection, SNS-style feeds. All real, well-built Naver/Kakao features — all solving a trust-and-discovery problem at a user scale this app doesn't have yet. Revisit only once there's a real base of active users and an actual review-quality problem to solve, not preemptively.

## Bottom line

Naver and Kakao's profile systems are the product of years of iteration at national-platform scale (reviewer economies, fraud detection, multi-profile friend-graph segmentation) — genuinely impressive, and genuinely the wrong thing to copy wholesale here. What actually transfers to this app right now is much smaller: **Sign in with Apple (not a Kakao/Naver-style login) + a nickname/avatar row in the existing Postgres**, storing avatars the cheapest way that works today and upgrading only when real usage demands it — the same "self-hosted where sensible, new infrastructure only when justified, defer scale/social features until there's a real audience" pattern every other build decision in this project has already followed.
