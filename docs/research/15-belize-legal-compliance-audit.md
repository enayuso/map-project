# 15 — Belize Legal Compliance Audit: Data Protection, App Store, Consumer/E-Transactions, Mapping Law, Extraterritorial Privacy Law, and Business Registration

**Date:** 2026-09-16
**Purpose:** asked to do a thorough legal-research pass across *every* aspect of compliance this app should be checking — not just the account-deletion-specific retention question already covered in [main.py's own delete_profile docstring](../../sharing/app/main.py) and `sharing/README.md`'s Account Deletion follow-ups — explicitly framed against how Naver/Kakao adhere to their own regulatory environment. Six parallel live-research passes (WebSearch + WebFetch, direct primary-source reading where possible), each covering one distinct legal domain grounded in what this app *actually does* (React Native + MapLibre Native map of Belize; live location sharing; shared lists; crowdsourced hazard reporting; crowdsourced POI corrections; curated ferry/dive-site/border-crossing info; email+password accounts with email verification and a soft-delete/30-day-grace-period deletion flow already shipped; Sign in with Apple built but not yet enabled, pending a paid Apple Developer account; **zero** analytics/ads/tracking SDKs of any kind — confirmed by grepping `mobile/package.json` and `ios/Podfile.lock` before dispatching this research).

**Methodology note, same as doc 14**: every claim below is tagged by confidence — **confirmed** (primary statutory text read directly, or an official developer/government doc), **reported** (a credible secondary source, not primary text), or **not found/unresolved** (searched for, not located — called out, not guessed). Belizean government web infrastructure is a *documented, recurring* reliability problem for this whole project (the BNSDI portal outages noted in earlier research, `nationalassembly.gov.bz` "Account Suspended," `digitalagenda.gov.bz`'s expired SSL cert, `dig.watch` and `coe.int` both 403ing repeatedly) — this pass hit the same wall again in places, worked around it with alternate mirrors and reputable secondary sources where primary text stayed unreachable, and says so explicitly rather than presenting a secondary-sourced claim as verbatim statute.

**Correction to this project's own prior research**: earlier work in this repo (this session, before this doc) referred to Belize's supervisory body as "**The Belize Data Protection Authority**," sourced from a Clym.io regulatory summary. This pass read the Act's actual primary text directly and found that's not quite right — see §1.6 below.

---

## 1. Belize Data Protection Act, 2021 (Act No. 45 of 2021) — full depth

Primary source: the gazetted Act's full text, read directly (a working mirror was found at `tasbelize.com` after `nationalassembly.gov.bz` again returned "Account Suspended" and `digitalagenda.gov.bz` again 403'd — same recurring pattern as before). Section numbers below are as printed in that text. **Confirmed** unless marked otherwise.

### 1.1 Data protection principles (s.4(1))

Personal data must be: (a) processed lawfully, fairly, transparently; (b) collected for specified/explicit/legitimate purposes, not used incompatibly with them; (c) adequate/relevant/limited to what's necessary; (d) accurate and kept up to date, with inaccurate data erased/rectified without delay; (e) kept identifiable for no longer than necessary; (f) processed with appropriate technical/organisational security. Structurally close to GDPR Art. 5, but its own distinct six-item list, not a copy.

### 1.2 Lawful bases for processing (s.7)

Consent is **one basis among several**, not mandatory for everything: contract necessity/pre-contract steps, legal-obligation compliance, vital-interest protection, administration of justice, public-authority functions, and — notably — **legitimate interest** (s.7(1)(ix)-(x)), "except where such interests are overridden by the interests or fundamental rights and freedoms of the data subject... in particular where the data subject is a child."

Consent itself (s.8) must be demonstrable, "clearly distinguishable from other matters, in an intelligible and easily accessible form, using clear and plain language," freely withdrawable at any time without retroactively invalidating prior processing. **s.8(5) explicitly targets consent-bundling** — a controller must consider whether contract performance was wrongly made conditional on consent to something not actually necessary for that contract.

### 1.3 Data subject rights (Part III, ss.11–22)

Full GDPR-shaped set: access (s.11, including a free electronic copy on request), rectification (s.12), erasure (s.13, same grounds as GDPR Art.17), restriction (s.14), notification-to-recipients duty (s.15), **data portability** (s.16 — limited to consent/contract-based automated processing, like GDPR Art.20), objection to damage/distress-causing processing (s.17, 21-day mechanism, Supreme-Court-enforceable), objection to direct marketing (s.18), protection from solely-automated decisions/profiling (s.19).

**Response timeline (s.22(6)-(8))**: "without undue delay and in any event within **one month**," extendable by **two months** for complex/numerous requests (subject informed of the extension within the first month). Free, except manifestly unfounded/excessive requests (burden of proof on the controller, s.22(12)-(15)).

### 1.4 Registration/notification duty and Data Privacy Officer

**No general registration or notification duty to the Commissioner exists.** Confirmed against the full text and independently against a law-firm analysis (Bartlett Morgan): "unlike Barbados' law, the [Belize] Bill does not include an obligation to maintain a register of data processors and controllers." Part VII (s.58) requires only *internal* records-of-processing, self-maintained, not filed with anyone.

A **Data Privacy Officer** (s.65(1)) is required only for: a public authority/body, "regular and systematic monitoring of data subjects on a large scale," or "large scale" processing of sensitive data — functionally identical to GDPR Art. 37's threshold, and very unlikely to be met by this app at its current or near-term scale. A single DPO can cover a whole group of undertakings.

### 1.5 Cross-border data transfer (Part IV, ss.23–29)

General rule (s.23(1)): transferor must ensure either an adequate level of protection, or appropriate safeguards with enforceable rights and effective legal remedies. **A cloud-storage carve-out exists (s.23(2)), quoted exactly**: "nothing in this Act prevents the transfer of data from Belize to a country or territory outside Belize for the purposes of cloud storage and consent of any data subject is not required for transfer of data from Belize to a country or territory outside Belize for the purposes of cloud storage." Independent **derogations (s.27)** also cover consent- or contract-necessity-based transfers regardless of the cloud carve-out. Non-compliance with s.23 carries a **$20,000 fine** (s.28).

Directly relevant: this app's backend is self-hosted outside Belize by a non-Belizean developer — covered either by the cloud carve-out (if the hosting is a genuine cloud-storage service) or, independently and more robustly, by the ordinary consent/contract-necessity derogations, as long as the privacy policy discloses the arrangement.

### 1.6 Correction: there is no "Belize Data Protection Authority" — it's a single Commissioner post

This project's own prior research (this session) named "The Belize Data Protection Authority" as the supervisory body, per a Clym.io summary. **Reading the primary text directly corrects this**: s.68(1) creates a single-officer post inside government — "a public officer in the Ministry responsible for digital transformation, e-governance or information technology, to be called the **Data Protection Commissioner**" — not a standalone "Authority." Qualification requires 7+ cumulative years across law, cyberlaw, telecom law, economics, finance, information security, or technology (s.68(2)); the Commissioner must "act independently and remain free from external influence" (s.68(3)); staff are separately appointed by the Public Services Commission (s.70); a **Data Protection Tribunal** exists for appeals (s.88), with further appeal on a point of law to the Supreme Court; the Commissioner must submit an annual report to the Minister within 3 months of the financial year end, tabled in the National Assembly (s.73) — **no such report was found published anywhere**, despite searching.

**Is it operational?** The National Cyber Security Index scores Belize 100% on both "Personal Data Protection Legislation" and "Personal Data Protection Authority" — but that measures legal/institutional existence on paper, not demonstrated casework. No news article, no named Commissioner, and no enforcement action, fine, or investigation was found anywhere. Most telling: the Ministry that would house the Commissioner published its own **2025 Annual Technical Report** covering a brand-new national biometric Digital Identity system integrating health, tax, vital-statistics, and social-security data — exactly the kind of large-scale sensitive-data processing that should trigger this Act's DPIA/Commissioner-consultation machinery — and **the report never once mentions the Data Protection Act, a Commissioner, or a DPIA process.** Its own "Investment Opportunities" section instead lists, as a *future* ask: "Belize is actively seeking investment in cybersecurity infrastructure, including... data privacy frameworks... for ensuring compliance with **emerging** digital laws" — the government's own 2025 framing treats a functioning compliance apparatus as still aspirational, four years after the Act was gazetted.

### 1.7 Open question this pass surfaced, not previously flagged: was the Act ever actually brought into force?

**Section 97(1) of the Act itself: "This Act comes into force on a day to be appointed by the Minister by Order published in the Gazette."** The 30 Nov 2021 Gazette notice published the Act's *text* — that is not automatically the same thing as a s.97 commencement order bringing it (or any part of it) into legal force. No subsequent Statutory Instrument/Commencement Order was found — checked the National Assembly's Statutory Instruments listings and the Belize Government Press Office's SI page (2020–2026, dominated by COVID/emergency-powers instruments; no Data Protection Act commencement order appears). Every secondary source that calls the Act "in force since 2021" (Clym, DataGuidance, dig.watch summaries, and this project's own prior research) repeats that framing **without citing a commencement order** — this genuinely could not be independently confirmed either way from a primary source. Flagged as **unresolved**, not settled, and worth a periodic recheck rather than an assumption in either direction.

### 1.8 Children's / sensitive data

"Child" = under 16 (s.2), but a **child's own consent is valid from age 13** (s.9(1)) — below that, a parent/guardian must consent. s.9(2): "A child shall receive the same privacy protections and rights as an adult" once on the platform (no watered-down access/erasure rights for a 14-year-old user). **Sensitive personal data** (s.2) covers racial/ethnic origin, political/religious beliefs, union/political-body membership, genetic/biometric data, sexual orientation, **financial record or position** (a Barbados-derived, non-GDPR-standard inclusion), and criminal records — processing is prohibited by default (s.10) absent an enumerated ground (explicit consent, employment-law necessity, vital interests, data the subject already made public, legal proceedings, medical purposes, equality-monitoring, etc.).

### 1.9 Breach notification (ss.61–62) — a real drafting inconsistency worth knowing about

To the Commissioner: "without undue delay and, where feasible, not later than **seventy-two hours** after having become aware of it," unless the breach is "unlikely to result in a risk to the rights and freedoms of an individual" (late notification requires stated reasons). To affected data subjects, where high risk: the Act's own printed text says **"seventy hours"** (not seventy-two) at s.62(1) — this reads like a genuine drafting error in the statute rather than an intentional 2-hour-shorter deadline, but it's the Act's actual printed wording, not a transcription mistake in this research. Practical takeaway: **notify at 72 hours or sooner regardless**, which satisfies either reading. Subject notification can be skipped if data was already unintelligible (encrypted) or subsequent measures eliminated the high risk, or replaced with public communication if individual notice would be disproportionate effort (s.62(3)).

### 1.10 Full penalty ladder (confirmed against primary text)

| Offense | Section | Penalty |
|---|---|---|
| Controller engages a processor without a compliant written contract | s.5(7) | **$500,000** and/or 3 years imprisonment |
| Cross-border transfer non-compliance | s.28 | $20,000 |
| Processor acting outside controller's instructions | s.57(2) | $20,000 |
| Public officer breaches Commissioner-related confidentiality | s.71(3) | $20,000 |
| False/reckless statement re: an Information Notice | s.81(2) | $20,000 |
| Obstructing a warrant / false statement to police | s.87 | $20,000 |
| Failure to comply with an Enforcement/Information/Special Information Notice | s.81(1) | $5,000 |
| Unlawful obtaining/disclosure of personal data | s.92(3) | $10,000 |
| Individual harmed by any contravention | s.91 | Uncapped civil compensation (private right of action) |

(The $500,000/3-year figure is far higher than anything previously surfaced in this project's research — it attaches specifically to the controller-processor-contract requirement, s.5(7), not to data-subject-facing violations generally.)

### 1.11 The single most important practical finding: a likely small-business exemption

**Section 3(3): "small businesses are exempted from the application of this Act"** — defined as annual turnover ≤ **BZD $3,000,000** in the prior financial year — **except** a small business that provides a health service, trades in personal information as a business, operates a residential-tenancy database, is a credit-reporting body, is an AML-reporting entity, is a registered employee association, is prescribed by regulation, or has voluntarily opted in.

A solo, pre-revenue hobby map app falls into none of those exceptions — it doesn't sell/trade personal data, isn't a credit bureau or tenancy database, etc. **As currently constituted, this app is very likely outside the Act's scope entirely**, not merely lightly regulated — though this should be confirmed with local counsel before relying on it fully, and it evaporates automatically the moment turnover crosses roughly USD $1.5M/year, which matters given the app's own stated intent to eventually monetize (Locked Decision 4 in `docs/PLAN.md`).

### 1.12 What this means for the app specifically

- Email/password sign-in is squarely "necessary for the performance of a contract" (s.7(1)(b)(i)) — no separate consent is legally required for that flow specifically, though the transparency duties (s.20: identity, purposes, legal basis, retention, rights) still call for a clear privacy notice.
- **Live GPS location sharing is the one feature that should be consent-gated on its own, not bundled into a general ToS acceptance** — because it's disclosed to *other users*, not just processed internally, and isn't strictly necessary to use the rest of the app, it doesn't cleanly fit "contract necessity." It should rely on s.7(1)(a) consent: a real opt-in toggle, in plain language, as easy to withdraw as to give (s.8(2)-(3)) — not a line buried in a Terms of Service.
- No DPO or Commissioner-registration burden applies regardless of size — there is no registration regime in this Act at all.
- Cross-border hosting is fine under either the cloud-storage carve-out or the ordinary consent/contract-necessity derogations, as long as it's disclosed.
- Age 13 is a sensible anchor for a minimum-age policy if the app wants/needs one.
- Realistic enforcement risk today is low (no seated Commissioner found, no enforcement history, the host Ministry's own 2025 report treats "data privacy frameworks" as an *investment ask*, not an active program) — but that describes current enforcement capacity, not legal non-applicability; the small-business exemption (§1.11), not enforcement inactivity, is the actual reason to feel reasonably comfortable today.

---

## 2. Apple App Store legal/policy requirements

Pulled live from `developer.apple.com` and `support.apple.com`, September 2026.

### 2.1 Privacy policy — required, and currently missing entirely

**Guideline 5.1.1(i)**: every app must include a privacy-policy link both in App Store Connect metadata *and* "within the app in an easily accessible manner" — the app must clearly identify what data it collects, confirm third parties get equivalent protection, and "explain its data retention/deletion policies and describe how a user can revoke consent and/or request deletion." **This app currently has no privacy policy at all** — a real, concrete gap, independent of whatever Belizean law itself requires.

### 2.2 App Privacy "Nutrition Label" — what this app would need to declare

Current App Store Connect taxonomy includes Contact Info, Location (Precise/Coarse), Identifiers, User Content, Usage Data, Diagnostics, etc. For this app's actual feature set: **Email Address** (Contact Info, linked to account), **Precise Location** (linked — tied to the account for live sharing/hazard reporting/navigation), **User ID** (Identifiers, linked), and **Other User Content** (hazard reports/POI corrections, linked). None should be marked "Used to Track You" — that flag specifically means linking with a *third party's* data for ads/data-broker purposes, and there are no third-party SDKs.

### 2.3 App Tracking Transparency (ATT) — confirmed not required

Apple's own definition: tracking means linking data with *other companies'* apps/sites/offline data for targeted advertising/measurement, or sharing with data brokers. On-device-only linking, or a broker used solely for fraud/security, doesn't count. Given zero ads, zero third-party SDKs, and zero data-broker relationships, **ATT/`NSUserTrackingUsageDescription` is not required** — confirmed directly from Apple's own definition, not inferred.

### 2.4 Location permission requirements

Purpose strings must "clearly and completely describe the app's use... and, in most cases, provide an example" — vague strings are a known rejection trigger. Guideline 5.1.5 requires using location "only when directly relevant" and obtaining consent before collecting/transmitting it. Background location (2.5.4) is an accepted intended use for a live-location-sharing feature, but reviewers specifically probe *why* an app requests "Always" authorization — only declare it if the sharing feature genuinely needs background updates while active; use "When in Use" for hazard reporting/navigation, with a distinct, concrete purpose string per use case.

### 2.5 Account deletion — the just-shipped soft-delete design is explicitly compliant

Current guideline 5.1.1(v): apps supporting account creation must offer account deletion in-app. Apple's own separate developer-support elaboration directly answers the exact question this app's design raises:

> "Does account deletion need to be immediate and automatic? No. If your process for account deletion is manual or otherwise takes time to complete, this is acceptable. Inform the user how long it will take to delete the account and provide a confirmation when the deletion has been completed."

**A documented grace-period soft-delete is explicitly compliant** — provided (a) deletion is *initiated* immediately when requested, (b) the user is told how long final purge will take, (c) a confirmation is given once truly purged, and (d) the data is genuinely erased at the end of the window (an indefinite soft-delete with data retained forever would *not* qualify — "temporarily deactivate... is insufficient"). This app's design meets (a); (b)/(c)/(d) are not yet surfaced to the user at all — see §7 action items.

### 2.6 Age rating — a live, very recent overhaul (deadline Jan 31, 2026)

Apple **removed the 12+ and 17+ age bands** and replaced them with 13+, 16+, and 18+ alongside the existing 4+/9+, with a new mandatory questionnaire covering (among other things) "Messaging and Chat" and "User-Generated Content" capabilities. Every app must re-answer the updated questionnaire by **January 31, 2026**. Given this app's live location-sharing (a direct user-to-user communication capability) and unmoderated-at-submission-time UGC, the realistic outcome is **13+**, not 4+/9+ (which restrict/exclude open messaging and UGC capabilities).

### 2.7 User-generated content moderation (Guideline 1.2) — two real gaps

Exact current requirements: a method for filtering objectionable content before posting, **a mechanism to report offensive content**, **the ability to block abusive users**, and published developer contact info. Assessed against this app's actual design:

| Requirement | Status |
|---|---|
| Pre-posting filtering | **Met** — hazard reports/POI corrections land as "pending" for human review via `scripts/review_poi_corrections.py` before being trusted |
| Report mechanism | **Gap** — no explicit in-app "report this" affordance exists for hazard reports specifically |
| Block-user mechanism | **Gap** — no way to block another user exists anywhere, notably including the live-location-sharing feature, which is a direct social/contact capability |
| Published contact info | Not confirmed — verify a support email/contact is visible in-app and/or on the App Store listing |

Apple's four sub-requirements are cumulative — pre-moderation alone doesn't substitute for an explicit report affordance or a block-user control, and live location-sharing specifically raises the stakes on "block," since without it a user has no way to stop receiving shares from someone they no longer want contact with.

### 2.8 Kids Category — confirmed not applicable, correctly

Guideline 1.3's stricter rules (no third-party analytics/ads at all, COPPA-grade requirements) only apply to apps that *opt in* via the "Made for Kids" checkbox. This app isn't targeting children and should simply not select that category — general Guideline 1.2 rules apply instead, which the app already meets the privacy bar for incidentally (no third-party SDKs regardless).

---

## 3. Belize consumer protection, Electronic Transactions Act, and liability for user-generated safety content

### 3.1 No general Consumer Protection Act exists

Belize's own Bureau of Standards states its Consumer Protection Unit "currently operates without an established legislative framework," coordinating between other regulators rather than enforcing a dedicated statute. What *does* exist is narrow and unrelated: the Supplies Control Act (price controls on essential goods — fuel, groceries) and the Public Utilities Commission Act (electricity/water/telecom only) — neither applies to a free app. Belize is only now (2025) running capacity-building workshops toward a *future* general competition-law framework, described in industry press as something the country has "long gone without."

**Research correction found and worth recording**: a low-quality source (lawgratis.com) claims Belize has a "Consumer Protection Act, 2007" and a "Fair Trading Commission" — this traces to a confusion with **Barbados** law (which really does have that trio of statutes), mis-tagged in a way that surfaces in generic searches as if Belizean. It is not. Treat any source claiming a Belizean Consumer Protection Act or Fair Trading Commission as unreliable absent a real National Assembly Act number.

**Practical effect**: no Belizean statutory floor exists for fair-dealing terms, mandatory disclosures, or refund/cooling-off rights, free or paid — if/when this app monetizes, the operative consumer protections will come from Apple's own App Store rules, not Belizean statute.

### 3.2 Electronic Transactions Act, 2021 (Act No. 25 of 2021) — confirmed real, validates e-signatures, but doesn't fix the app's actual gap

Confirmed statute (repealed/replaced the original 2005 Act), aligning Belize with the UNCITRAL Model Law on Electronic Commerce: a contract/signature can't be denied legal validity "merely on the grounds that they were completed electronically," consent to transact electronically can be inferred from conduct (best practice is still an explicit consent clause), with standard UNCITRAL carve-outs for wills/court process/certain deeds — none relevant to an app ToS. A companion **Electronic Evidence Act** (updated 2021) governs admissibility of electronic records in Belizean courts — meaning a well-logged tap-to-accept event (timestamp, account ID, IP, document-version hash) would be evidence-ready if ever needed.

**The actual gap is upstream of this Act entirely**: the Act validates the *electronic form* of an agreement — it does nothing to create an agreement where no terms were ever shown. **This app's signup flow currently presents no Terms of Service or Privacy Policy at all** for the user to accept. Under ordinary common-law contract formation (offer + acceptance + assent to specific terms), there is currently no contract in place, electronic or otherwise — this needs fixing at the product level before the Electronic Transactions Act's validity protection does any work at all.

### 3.3 Liability for crowdsourced safety content — no Belize-specific statute or case; general common-law question

No Belizean statute or case was found addressing crowdsourced/UGC safety-information liability specifically — this is a general common-law question, not a codified one, and should be presented to the user that way rather than as settled law. Belize is a common-law jurisdiction whose final appellate court moved from the UK Privy Council to the Caribbean Court of Justice (CCJ) in 2010; modern Belizean negligence law draws on CCJ/Commonwealth Caribbean jurisprudence built on classic English authority (e.g., *Hedley Byrne v Heller* on negligent-misstatement liability for information relied upon) as persuasive authority, though no case applying it to this exact fact pattern was found.

**Important scoping point**: Belize received English common law only up to a historical cutoff (the Imperial Laws (Extension) Act, pre-1899) — later English consumer-protection statutes (UK Unfair Contract Terms Act 1977, Consumer Rights Act 2015) were **never automatically received into Belizean law**, and no Belizean re-enactment of an equivalent was found. So exclusion/limitation clauses in a Belizean contract are tested by *pure* common-law doctrine (fair notice/incorporation, contra proferentem, and a general public-policy refusal to let a party exclude liability for death/personal injury from its own gross negligence or willful misconduct) rather than a statutory "reasonableness test."

**Real, on-point local precedent** (the strongest thing found for this question): the **Belize Tourism Board** — a Belizean government entity in exactly the business of publishing travel/safety-adjacent information — uses precisely the disclaimer pattern this app needs: content provided "as is" with no warranty, no representations about "suitability, reliability, availability, timeliness... and accuracy," broad exclusion of direct/indirect/consequential damages, governed by Belizean law with Belize Supreme Court jurisdiction (its Cruise App terms use identical language). The clearest functional analog for the hazard-reporting feature specifically is **Waze's** Terms of Use: explicit "as is," an explicit warning that community-submitted content "may be faulty or inaccurate," and an explicit instruction to trust real-world signage/authorities over the app. Belizean dive operators separately use signed waiver/assumption-of-risk forms for the diving *activity* itself (a different instrument from an app's informational disclaimer) — confirming the local industry norm of never leaving risk-adjacent content unqualified.

### 3.4 Enforceability of a standard mobile ToS under Belizean law

No mandatory Belizean governing-law clause, no requirement for a Belizean registered address for dispute notices (that requirement exists only for Belize-*incorporated* entities, not for a foreign developer with Belizean users). Belize has an Arbitration Act (Cap. 125) domesticating the 1958 New York Convention — a standard arbitration clause should be enforceable, no consumer-arbitration carve-out or prohibition was found. No statutory liability-cap override exists (no UCTA-equivalent) — the only real constraint is the common-law public-policy limit on excluding death/personal-injury liability from gross negligence or fraud, plus ordinary fair-notice requirements for unusual/onerous terms.

---

## 4. Belize mapping/surveying law, the Belize-Guatemala border, and a real data-licensing landmine

The direct parallel the user asked for — Korea's own well-known restriction (Naver/Kakao/Google Maps Korea can't export detailed map data, must host domestically, on national-security grounds).

### 4.1 No Belizean equivalent of Korea's spatial-data export/localization law

**Land Surveyors Act, Cap. 187** — the closest thing on the books — is scoped to *cadastral* surveying (land-title/boundary surveys for property purposes), not general cartography. Its one clause touching "maps" (s.3(4)) restricts reusing the government's own certified *official maps*, not publishing independent maps from other sources. Its aerial-photography notice requirement (s.20) targets physically flying over Belize to photograph it, not downloading pre-existing ESA Sentinel-2 imagery already captured under an open license by a third party. **National Lands Act, Cap. 191** has no map-publication restriction at all — its map/survey references are purely internal government administration. **No Belizean statute or authority requires government approval before a private entity publishes a commercial map app** built from OSM/GADM/Sentinel-2 data.

### 4.2 The Belize-Guatemala border — no law, but a genuinely live, current diplomatic situation

No Belizean statute prescribes how the disputed border must be depicted. Guatemala, by contrast, has an active domestic directive (intensified Nov 2025 ahead of ICJ oral hearings) requiring its *own* official maps to show a dotted "Línea de Adyacencia" with an explicit territorial-dispute disclaimer — a Guatemalan internal instruction with no legal force over a Belize-based app, but it shows how charged this specific line currently is. **This is not theoretical**: on Sept 10, 2026 (six days before this research), Guatemalan vessels blocked Belizean nationals' customary transit near Sarstoon Island, prompting a formal Belizean diplomatic protest.

Live inspection of how existing commercial map products actually render it: **OpenStreetMap** (the base data this app already uses) renders it as an ordinary **solid** boundary line, styled identically to Belize's undisputed borders — OSM's own "Disputed territories" wiki page doesn't even list Belize-Guatemala among its special cases. **Google Maps** renders it **dashed/dotted**, visually flagged as unresolved. **Bing Maps** renders it **solid**, same as Google Maps' Guatemala-Mexico border. No instance was found of Belize's government requesting a takedown or correction from any commercial map provider over this specific depiction.

**Practical takeaway**: this app already inherits OSM's own settled, non-outlier depiction (an ordinary solid line) — a defensible default, not an oversight. Given the live diplomatic tension, a low-cost, purely optional hedge worth considering is rendering it dashed instead (Google's approach) — no legal requirement to do so, but cheap, and it signals awareness of the dispute rather than an implicit position on it.

### 4.3 Satellite imagery — not a realistic concern at this resolution

No Belize-specific statute restricting commercial display of satellite imagery was found. Independent of any legal question, Sentinel-2's ~10m resolution is far too coarse to resolve individual buildings/installations at a level any government typically regulates (that concern usually attaches to sub-1m commercial imagery like Maxar/Planet) — moot for this app as built.

### 4.4 A real finding outside the original question: the GADM administrative-boundary data is likely non-commercial-only

**This is the single most concrete, actionable finding in this whole section.** GADM's own license page states: "The data are freely available for academic use and other non-commercial use. **Redistribution or commercial use is not allowed without prior permission.**" The HDX COD-AB Belize dataset (`data.humdata.org/dataset/cod-ab-blz`) is sourced from GADM, and it could not be confirmed whether HDX independently relicensed the data (e.g., under CC-BY) or whether GADM's non-commercial restriction passes through unchanged (HDX's own license field returned a 403 in this session). **This is a data-licensing issue, not a Belizean-law issue** — but for a project explicitly locked in as a commercial venture (Locked Decision 4), it's more concrete and immediate than anything in the Land Surveyors Act.

**Good news: this dataset was never actually adopted.** This project's own prior research this session (see the conversation's earlier "check on these: data.humdata.org/dataset/cod-ab-blz..." exchange) was pure scouting — the user explicitly said "hold off for now, just wanted to know what these were," and nothing from HDX/COD-AB/GADM has been integrated into the app. This finding is a landmine to remember *before ever adopting that data source*, not a current violation.

---

## 5. GDPR, CCPA/CPRA, and other extraterritorial privacy law

### 5.1 GDPR Article 3(2) — a tourist using the app while physically in Belize

**Conclusion: does not apply, and this is not a close call.** Article 3(2) requires the data subject to be "in the Union" at the moment of the triggering activity (an intentional offer of services, or monitoring taking place within the Union). The EDPB's own Guidelines 3/2018 give worked examples directly on point: an Australian news app used by a subscriber who travels to Germany stays out of GDPR scope because the service targets only Australia, not the EU; a US tourist in Europe using a US-market-only news app is likewise unaffected. Contrast the EDPB's own example of a US city-mapping app that *is* caught — because it names EU cities (Paris, Rome) as service locations and does location-based ad-targeting. This app is destination-defined around Belize (not an EU location) and does no ad-targeting or profiling at all — closer to, and arguably an easier case than, the "out of scope" examples.

### 5.2 An EU resident downloading/using the app before their trip, while still in the EU — the genuinely closer case, still likely out of scope

Here the "in the Union" threshold *is* met, so the analysis turns entirely on intentional EU-targeting (Art. 3(2)(a)) or EU-specific behavioral monitoring (Art. 3(2)(b)). Recital 23 is explicit that mere accessibility, or using a language generally spoken in the developer's home country, is *not enough* to show EU-targeting — what matters is EU-specific currency, marketing, a Member-State domain, etc. (the CJEU's *Pammer*/*Hotel Alpenhof* "directing activity" factors). The EDPB's own closest analogous example (a Swiss university offering a program generically in German/English worldwide, with no EU-specific advertising) was held *not* to show EU targeting — functionally identical to a Belize-focused app in generic English aimed at "anyone visiting or living in Belize." On monitoring: Recital 24 requires a profiling/behavioral-analysis purpose, and this app has zero analytics of any kind. **Currently out of scope, but the one scenario worth re-checking if marketing strategy ever becomes EU-specific** (EU-targeted App Store ad campaigns, EU-currency pricing, partnerships with EU travel bloggers) — that combination could tip the analysis.

### 5.3 CCPA/CPRA — a clean, confirmed no, regardless of user count

Coverage requires a for-profit "business" meeting at least one of: >$26.625M annual gross revenue (2025 CPI-adjusted figure), buying/selling/sharing 100,000+ consumers'/households' personal information annually, or deriving 50%+ of revenue from selling/sharing personal information. A free, zero-revenue, solo-developer app with no third-party data sharing fails every prong by a wide margin, and there is no separate catch-all making CCPA apply simply because some Californians use the app. **Confirmed clean, not a close call.**

### 5.4 Other jurisdictions, briefly

UK GDPR mirrors EU GDPR's Art. 3(2) test (same conclusion, same reasoning). Brazil's LGPD has a similarly GDPR-like targeting test (same conclusion). No other major regime has a materially more aggressive reach relevant to a Belize-tourism app.

### 5.5 Practical takeaway

No formal EU-style compliance program (Art. 27 representative, DPO, Art. 30 records) is warranted at this scale/targeting. The one sensible, low-cost hedge — which also independently satisfies the App Store's own privacy-policy requirement (§2.1) and most of the Belize Data Protection Act's transparency duty (§1.12) — is a single plain-language privacy notice: what's collected, why, confirmation of no third-party sharing/sale/ads, retention/deletion practice, and a contact for privacy requests. One document, three separate obligations addressed.

---

## 6. Belize business registration and tax exposure

### 6.1 No registration trigger from a free app used by Belizean residents/tourists

Belize's Business Names Act and company-registration framework (via the Belize Companies and Corporate Affairs Registry) are keyed to people *setting up a business in Belize*, not to foreign businesses whose product happens to reach Belizean users. Belize's well-known International Business Companies (IBC) framework runs the opposite direction — a vehicle for people who *want* to incorporate in Belize, not a trap for those who haven't. The Economic Substance Act (2019) only reaches companies *already* incorporated in Belize conducting specific regulated activities (banking, insurance, IP holding, etc.) — not applicable here at all.

### 6.2 Tax exposure once App Store revenue starts flowing — currently a non-issue, one point unverified

Belize has no dedicated non-resident digital-services VAT/GST regime (no EU-OSS-style mechanism), and general GST/business-tax exposure is keyed to Belize-sourced business activity or a local permanent establishment, not merely to customer location. Apple itself acts as merchant of record and remits VAT/GST directly in roughly 64–70 App Store territories that have specifically legislated a non-resident digital-VAT mechanism — **Belize's presence on that list could not be confirmed** (the actual current territory list lives behind an App Store Connect login), but every jurisdiction confirmed on it has a digital-VAT law Belize doesn't yet have, making this likely moot for now. Belize is actively modernizing its tax administration (a GST e-invoicing mandate phasing in through 2026) — worth rechecking if/when in-app revenue actually starts.

### 6.3 Data Protection Act — no local-representative requirement, confirmed

Unlike GDPR Art. 27, the Act does not require a non-established controller to appoint a Belizean representative (the one mention of a "representative," s.6(3)(a)(ii), is conditional on having voluntarily nominated one) — consistent with §1.4's finding of no registration regime at all.

### 6.4 Clear triggers to revisit this whole section

Hiring a Belize-based employee/contractor or opening a local office; taking payment through a Belizean bank account or entity (as opposed to Apple's global IAP rails); Belize enacting a non-resident digital-services GST rule; Apple adding Belize to its VAT-remittance territory list (check directly in App Store Connect once IAP is live); or the Data Protection Act being amended to add a registration/local-representative clause. None of these apply to the project's current state.

---

## 7. What this actually means for this app — prioritized, concrete action list

Ranked by a mix of urgency (App Store submission blockers first) and cost-to-fix (cheap/high-value first):

1. **Write and publish a Privacy Policy + Terms of Service, and actually present them at signup.** This single document closes the biggest gaps across *three* separate research threads at once: Apple's hard App Store requirement (§2.1, currently unmet), the Electronic Transactions Act's need for an actual agreement to exist before its validity-protection does anything (§3.2, currently unmet — no ToS is shown at all today), and most of the Belize Data Protection Act's transparency duty (§1.12) and the GDPR/CCPA hedge (§5.5). Model the safety disclaimers on the Belize Tourism Board's own "as is"/no-warranty language (§3.3) and Waze's crowdsourced-content disclaimer specifically for the hazard-reporting feature; add a distinct, feature-specific paragraph each for hazard reports, dive-site info, and ferry/border-crossing info rather than one generic blanket disclaimer.
2. **Add a consent-gated toggle for live location sharing, separate from general ToS acceptance** — the Data Protection Act's own consent-bundling rule (s.8(5)) and the general principle that this feature isn't strictly necessary for the rest of the app both point the same way: a real opt-in, in plain language, not a line buried in a Terms screen.
3. **Add an in-app "report content" affordance and a "block user" mechanism** — Guideline 1.2's two genuinely missing pieces (§2.7), made more urgent by the fact that live location-sharing is a direct social/contact feature with no way to stop unwanted contact today.
4. **Complete Apple's new age-rating questionnaire before January 31, 2026** — expect a 13+ outcome given messaging/location-sharing plus UGC (§2.6).
5. **Fill out the App Privacy "Nutrition Label" accurately** (§2.2) once the above are in place — Location (Precise, linked), Contact Info (Email, linked), Identifiers (User ID, linked), User Content (linked); nothing marked "Used to Track You."
6. **Surface the soft-delete grace period to the user explicitly** — Apple's own guidance (§2.5) requires telling the user how long final deletion will take and confirming once it's actually purged; the backend logic already does the right thing (see the account-deletion work earlier this session), but the mobile UI doesn't yet say any of this to the user.
7. **Write purpose strings for location permissions that name the specific feature** (live sharing vs. hazard reporting/navigation) rather than a single generic string (§2.4) — a known rejection trigger if left generic.
8. **Remember, don't act on yet: never adopt the HDX/COD-AB (GADM-sourced) administrative-boundary dataset without first resolving its non-commercial-use restriction** (§4.4) — it was only ever scouted, never integrated, so this is a landmine to avoid stepping on later, not a current violation.
9. **Optional, low-cost hedge**: consider rendering the Belize-Guatemala border as a dashed line (matching Google Maps) rather than OSM's default solid line, given the live diplomatic tension (§4.2) — no legal requirement either way, purely a judgment call.
10. **No action needed right now** on: GDPR/CCPA compliance program (§5), Belizean business registration (§6), a Data Protection Officer or Commissioner registration (§1.4/§1.11 — likely exempt as a small business anyway), or Belizean mapping/surveying permits (§4.1) — all confirmed out of scope at the app's current size and design, with clear triggers noted for each in case that changes.

## Bottom line

The single biggest, most surprising finding of this whole pass is **§1.11: the app is very likely entirely outside the Belize Data Protection Act's scope right now**, via its own small-business exemption — a much stronger legal footing than "the regulator probably isn't enforcing yet" (§1.6), which was the framing this project had been implicitly relying on. That said, the *practical* priorities (§7) are almost entirely driven by **Apple's own App Store rules**, not Belizean law — a privacy policy, a ToS, UGC report/block controls, and the new age-rating questionnaire are all real, concrete, near-term requirements regardless of what Belizean statute does or doesn't currently reach, and none of them are difficult or expensive to build. Everything genuinely exotic that was checked (GDPR/CCPA extraterritoriality, Belizean business registration, mapping/surveying restrictions, the Belize-Guatemala border) came back low-risk or non-applicable, with the one real exception being a data-licensing landmine (GADM/HDX, §4.4) in a dataset this project already chose not to adopt.
