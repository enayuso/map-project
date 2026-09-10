# 11 — How Kakao Map / Naver Map Source Restaurant/Cafe/Hospital POI Data (2026-09-10)

Prompted by: "how do they get info concerning restaurants/cafes/hospitals/etc — is it crowdsourced? if yes, how, cautiously?" Live research (Korean-language sources) into both platforms' actual registration/moderation pipelines, not assumption.

## Headline: it's a two-tier system, not open crowdsourcing

Both platforms separate **who can change what** into two very differently-trusted tracks:

### Tier 1 — Business-owner self-service, gated behind real government paperwork

This is the primary path for restaurants/cafes/any registered business, and it's the "specific, cautious way" you suspected. To register or claim a business:

- **Naver**: via [Naver Smart Place](https://new.smartplace.naver.com/bizes/new). Requires uploading a **사업자등록증** (business registration certificate) or telecom sales license (for online stores/gift-certificate sellers), plus the representative's ID (with the resident-registration number masked out). Naver's **Naver Pay business team** manually reviews the submission and follows up by official Naver email if anything's missing. The business owner must personally upload the certificate to get admin rights over that listing.
- **Kakao**: via Kakao Business' 매장 관리 (store management) tool. Same shape — store-owner verification tied to real business registration before the owner gets edit rights or can run ads against that listing.

The effect: every "owned" business listing is tied to a real, government-registered legal entity and a specific verified human, not an anonymous submission — sources: [findby.co.kr registration guide](https://findby.co.kr/stories/2024-how-to-registe-map-for-naver.html), [Kakao Business store registration guide](https://kakaobusiness.gitbook.io/main/tool/mystore/register), [Naver Smart Place verification overview](https://inquivix.com/naver-smart-store/).

### Tier 2 — Anyone can suggest an edit or a new place, but nothing publishes automatically

This is the actual "crowdsourced" layer, and it's how non-owner-claimed places (public landmarks, hospitals, government offices, small unclaimed shops) get in and stay accurate:

- Both apps have a plain "제보"/"정보 수정 제안" (suggest a correction / report a place) flow open to any user — no login-tier restrictions found. Kakao's own help docs list exactly what's editable this way: name, location, category, phone (multiple allowed), website, menu, prices, "other," plus photo attachments.
- Critically: **submissions go into a moderation queue, not a live edit.** Kakao's own devtalk forum answer states a submission gets an "approved or held" (보류) decision by email, typically **about one business day later** — a human operator reviews it against Kakao's own internal policy before it touches the live map. Naver's process is the same shape (their help-center-documented "report an error" flow), though the turnaround specifics weren't as precisely documented in what's public.
- Attaching evidence (exterior photos, phone number, hours) is explicitly called out as making review faster — i.e., the more independently verifiable the submission is, the less scrutiny/back-and-forth it needs.

Sources: [Kakao Map devtalk on registration method/criteria](https://devtalk.kakao.com/t/api/147706), [Kakao 지도 수정 제안 devtalk thread](https://devtalk.kakao.com/t/topic/133063), [cashnote.zendesk.com Kakao Map new-place guide](https://cashnote.zendesk.com/hc/ko/articles/360047707291).

## The honest weak spot: reviews/ratings are much looser than listing data

Interesting asymmetry worth calling out, since it's the kind of thing only live research (not assumption) surfaces: the **business listing data itself** (name/address/category/hours) is tightly gated per above, but **user reviews attached to a listing are not** — Korean consumer-facing sources specifically flag that Kakao Map lets anyone post a review **without any purchase/visit verification** ("인증 없이 악성 리뷰 작성 가능"), which is a known, actively-complained-about weak point for fake/troll reviews. The mitigation there is purely reactive: a per-review "신고" (report) button, not an upfront barrier. So the two are handled completely differently even within the same app: structural data → verified-then-moderated-then-published; opinion/review content → open-then-report-if-bad.

Source: [whiteme.co.kr on unverified Kakao Map reviews](https://www.whiteme.co.kr/%EA%B3%A0%EA%B0%9D%EC%A7%80%EC%9B%90/%EA%B3%A0%EA%B0%9D%EC%82%AC%EB%A1%80/whiteme-20250212).

## Why this matters for this project

This directly informs the **crowd-sourced POI correction flow** item already sitting on [docs/PLAN.md](../PLAN.md)'s shortlist (from [10-remaining-feature-gaps.md](10-remaining-feature-gaps.md), not yet built). The Kakao/Naver blueprint is concretely reusable at hobby scale:

- **Don't** build an open-write "anyone can edit the POI directly" system — neither Kakao nor Naver does that, for good reason (a small, young Belize POI dataset is exactly the kind of thing bad-faith or just-careless edits would quietly wreck).
- **Do** build a lightweight version of Tier 2: a "report wrong info" submission (what field, what correction, optional photo) that lands in a review queue, not a live write — a human (you, at this scale) approves/rejects before it touches the real `pois` Typesense index. This is a small addition on top of infrastructure that already exists in this project (same shape as the hazard-report review-queue trust model already documented in `sharing/README.md`, just applied to POI corrections instead of road hazards).
- A Tier-1-style "business owner self-service" layer is **not** worth building yet — it assumes a business-partner ecosystem and a real-name-verification pipeline this project has no reason to stand up at hobby scale (and Belize has no equivalent of a searchable government business-registry API to verify against, unlike Korea's 사업자등록증 system). Worth revisiting only if this app ever gets real commercial traction with local businesses wanting to self-manage their listing.
