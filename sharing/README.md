# Location Sharing, Shared Lists, Hazard Reports, POI Corrections & Curated Reference Data (Phase 4.5)

Six things, one small service: live "share my location with someone" (Naver/Kakao both have this — Kakao's own "친구위치" just had its time limit removed entirely, per [docs/research/09-kakao-naver-feature-audit.md](../docs/research/09-kakao-naver-feature-audit.md)), shareable saved-place lists (Naver's own Dec 2022 favorites-folder upgrade), crowdsourced road hazard reports (Waze's core idea, added 2026-09-10 per [docs/research/10-remaining-feature-gaps.md](../docs/research/10-remaining-feature-gaps.md) — a genuinely undocumented-anywhere-digital gap for Belize's flooding/washouts/checkpoints), a crowd-sourced POI correction queue (added 2026-09-10 per [docs/research/11-kakao-naver-poi-data-sourcing.md](../docs/research/11-kakao-naver-poi-data-sourcing.md) — Tier 2 of how Kakao/Naver actually source their own place data: anyone can suggest a correction, but a human reviews it before anything publishes), and curated ferry-schedule/dive-site/border-crossing reference data (added 2026-09-11 per [docs/research/12-ferry-dive-site-data-sourcing.md](../docs/research/12-ferry-dive-site-data-sourcing.md) — extensive research found no API/feed/database exists anywhere for any of the three, government or otherwise, so this project maintains its own). None is blocked by any Belize-specific data problem the way most of this project's remaining feature gaps are — all of it is pure product engineering on top of infrastructure that already exists.

## Model: a short code, not a user account

No login, no friend graph — a share is just a random 6-character code (`create_share` → `{code, expiresAt}`). Give the code to whoever should see your position; they enter it to watch. This is the same trust model as a shared document link, **not** real authentication — good enough for a hobby-scale v1, called out explicitly here (and in `app/main.py`'s own header comment) so it's never mistaken for more secure than it is.

**Sliding expiry, not fixed**: every position update (`PUT /shares/{code}`) pushes `expires_at` forward by 6 hours again. An actively-shared location effectively never expires while genuinely in use — but a share nobody's updating anymore (app closed, forgot to tap "stop") ages out on its own rather than a leaked code staying valid forever. `GET`/`PUT` both treat an expired row as "not found"; something still has to actually `DELETE` old rows eventually — see `scripts/cleanup_expired_shares.sh`.

**Shared lists have no expiry at all**, deliberately — unlike a live location, a saved list of places isn't inherently ephemeral, and Naver's own version doesn't expire shared lists either. They persist until their owner explicitly deletes them (`DELETE /lists/{code}`).

**Hazard reports use a different secret entirely**: not a short human-readable code (nobody needs to read a hazard report's ID out loud), but a longer `deleteToken` bearer secret returned only to the reporter, kept on-device, needed to retract the report early. Anyone (not just the reporter) can "confirm" a report is still valid — that's the whole point, it's a shared signal. Each hazard type gets its own default lifetime (a checkpoint moves on faster than a real flood does), and every confirmation slides that expiry forward again, capped at 3 days from the original report — same idea as location shares' sliding TTL, just driven by the community instead of the original reporter's own activity.

**POI corrections have no per-submitter secret at all** — unlike everything else in this service, nobody needs to retract or manage their own submission afterward, and there's no per-user identity here to gate on anyway (submissions are anonymous). What's different is the *moderation* model: a correction starts `pending` and stays that way until a human explicitly approves or rejects it via a **local admin script**, never an HTTP endpoint (see the API table below and `scripts/review_poi_corrections.py`'s own header comment for why that's a deliberate choice, not an oversight).

**Ferry routes, dive sites, and border crossings aren't Postgres rows at all** — they're hand-maintained JSON files (`sharing/data/ferry_routes.json`, `sharing/data/dive_sites.json`, `sharing/data/border_crossings.json`), read fresh off disk on every request. Neither dataset is crowd-submitted or mutable through this API (both are GET-only); they change on a months-long cadence by someone directly editing the file and re-checking sources, not through any UI or database write — a relational schema would be pure overhead for content that's essentially a maintained document, not user-generated data. Editing a file and running `docker compose restart sharing` (no rebuild) picks up the change immediately.

## Why a custom service, not an off-the-shelf tool

Every other backend piece in this project is a proven, self-hosted OSS tool (Nominatim, Typesense, Valhalla, Martin) — deliberately, per this project's own established pattern of reaching for a real tool before writing custom code. This one's different on purpose: the actual logic here (four small endpoints over one Postgres table) is genuinely too small to justify standing up unfamiliar new infrastructure just to keep that pattern intact — e.g. Redis + a Redis-to-HTTP bridge (`webdis`) would be two brand-new pieces of infrastructure this project has never touched, in service of a feature this size. A small [FastAPI](https://fastapi.tiangolo.com/) app (MIT-licensed, consistent with Locked Decision 4) reusing the **same** `belize` Postgres database every other service already writes to was the simpler choice in practice, not just in principle.

## Setup

1. All four tables must exist in the shared `belize` database first (one-time, same pattern as every other schema change in this project):
   ```bash
   scripts/create_location_shares_table.sh
   scripts/create_shared_lists_table.sh
   scripts/create_hazard_reports_table.sh
   scripts/create_poi_corrections_table.sh
   ```
2. Start the service (joins the Phase 1 backend's Docker network to reach `postgis` by hostname, same as `search/` and `geocoding/`):
   ```bash
   cd sharing && docker compose up -d --build
   ```
3. API on **http://127.0.0.1:8090**.

## API

| Endpoint | Purpose |
|---|---|
| `POST /shares` — body `{lat, lon, label?}` | Start sharing a location. Returns `{code, expiresAt}`. |
| `PUT /shares/{code}` — body `{lat, lon}` | Push a new position. Also refreshes `expires_at`. 404 if the code doesn't exist or already expired. |
| `GET /shares/{code}` | Read the current position. Returns `{lat, lon, label, updatedAt, expiresAt}`. 404 if not found/expired — the viewer side polls this. |
| `DELETE /shares/{code}` | Stop sharing immediately (the explicit "I'm done" action, not just waiting for expiry). |
| `POST /lists` — body `{label, places}` | Create a shared list. Returns `{code}`. No expiry. |
| `PUT /lists/{code}` — body `{label, places}` | Re-sync the list's contents (the owner's device calls this whenever it changes locally — a viewer polling `GET` then sees the update). 404 if the code doesn't exist. |
| `GET /lists/{code}` | Read a shared list. Returns `{label, places, updatedAt}`. 404 if not found — the viewer side calls this. |
| `DELETE /lists/{code}` | Delete the list entirely. |
| `POST /hazards` — body `{type, lat, lon, note?}` | Report a hazard. Returns `{id, deleteToken, expiresAt}` — TTL depends on `type` (see `HAZARD_TYPE_TTL` in `app/main.py`). |
| `GET /hazards?min_lat=&max_lat=&min_lon=&max_lon=` | List non-expired reports in a bbox. Returns `{hazards: [...]}`. |
| `POST /hazards/{id}/confirm` | "Still here" — bumps `expires_at` forward (capped at 3 days from the original report) and increments `confirm_count`. |
| `DELETE /hazards/{id}?delete_token=` | Retract a report. 404 if the token doesn't match (or the report doesn't exist). |
| `POST /poi-corrections` — body `{poi_id, poi_name, field, current_value?, suggested_value?, note?}` | Submit a correction (`field` is `name`\|`category`\|`closed`\|`other`). Returns `{id}`. Always lands as `pending` — never applied here. |
| `GET /poi-corrections?status=pending` | List corrections by status. Read-only — safe to leave open without auth, since nothing here can be mutated through this endpoint. |
| `GET /ferry-routes` | Returns the curated water-taxi/ferry route list — read straight from `data/ferry_routes.json`, not a database. |
| `GET /dive-sites` | Returns the curated dive-site list — read straight from `data/dive_sites.json`, not a database. |
| `GET /border-crossings` | Returns the curated border-crossing info (hours/fees/documents/scam warnings) — read straight from `data/border_crossings.json`, not a database. |
| `GET /health` | `{ok: true}` |

Approving/rejecting a POI correction is **not** an HTTP endpoint — see `scripts/review_poi_corrections.py`, run locally against this same container:
```bash
docker exec -it belize-sharing python3 /scripts/review_poi_corrections.py list
docker exec -it belize-sharing python3 /scripts/review_poi_corrections.py approve <id>
docker exec -it belize-sharing python3 /scripts/review_poi_corrections.py reject <id> "reason"
```

## Hardening (2026-09-11)

Picked as the next priority after a full engineering audit flagged this as the service most worth hardening before any real users touch it — it's the one thing in this project handling live GPS data and public writes with no auth at all. Four changes, all in `app/main.py` unless noted:

- **Cryptographically random codes/tokens**: `generate_code()` and `generate_delete_token()` used `random.choices()` — Python's Mersenne Twister, a fine PRNG for simulations but not a cryptographic one, and predictable if its internal state is ever recovered. Both now use `secrets.choice()` (the `secrets` module wraps the OS's own CSPRNG) instead — same alphabet, same length, no behavior change, just a real security property where there wasn't one. This matters here specifically because a share code or delete token *is* the entire access model — there's no account behind it to fall back on.
- **Rate limiting** via [slowapi](https://github.com/laurentS/slowapi) (MIT, in-memory counters — no Redis needed at this scale, one process), keyed by client IP, on every endpoint. Not one blanket number: `MUTATE_LIMIT` (10/minute) for creating/deleting a share, list, hazard report, or correction; `POLL_LIMIT` (30/minute) for the reads/updates that happen every few seconds during genuinely active use (an in-progress location share, a viewer watching one); `STATIC_LIMIT` (20/minute) for the curated ferry/dive-site/border-crossing content. `/health` is deliberately exempt — a health check should never be the thing that starts failing under load.
- **Input validation** that was previously minimal: every lat/lon field across every request body and query string now has real `ge`/`le` range constraints (`-90..90`, `-180..180`) instead of accepting any float; `GET /hazards`'s bbox additionally rejects `min > max` and caps the span at 10° per side (Belize's own bounds are roughly 1° × 1.5° — this is generous room to zoom out, not a functional limit, while still refusing an unbounded/planet-scale range scan); every previously-unconstrained free-text field (list place names, correction fields, hazard notes) now has a `max_length`; a POI correction's `field` and a hazards-queue `status` filter are now `Literal` types matching the mobile client's own TypeScript union exactly, rejecting anything else, rather than silently accepting garbage a client should never have sent.
- **Docker ports bound to loopback only**: every `docker-compose.yml` in this project (`backend/`, `sharing/`, `geocoding/`, `search/`, `routing/`) now publishes its ports as `127.0.0.1:<port>:<port>` instead of just `<port>:<port>` (which Docker defaults to all interfaces). The Simulator/host already reach every service over `127.0.0.1` — this was true before and needed no client-side change — so this only removes exposure to the local network, with zero functional difference. Confirmed via `docker ps`: every belize-* container now shows `127.0.0.1:PORT->PORT/tcp`, not `0.0.0.0:PORT->PORT/tcp`.

**Deliberately not changed today**: the `devpass123` dev password's actual value. It's a local-only Postgres instance never exposed to a real network (doubly so now that every port above is loopback-only) — rotating the literal string right now provides no real security benefit and would just require touching several files for nothing. What *did* change: every credential across `backend/`, `sharing/`, `search/`, and `geocoding/`'s `docker-compose.yml` files was a hardcoded literal with no way to override it short of editing the compose file directly — now each reads `${VAR:-dev-default}`, and a `.env.example` in each of those four directories documents exactly what to set. Copy one to `.env` (already `.gitignore`d) and docker compose picks it up automatically; leave it alone and dev keeps working with zero setup. Tested this actually works, not just that the syntax looks right — `docker compose config` with a throwaway `.env` present showed the override taking effect, and reverted correctly once removed. One coupling to know about: `sharing/.env`'s `DB_PASSWORD` must match `backend/.env`'s `POSTGRES_PASSWORD` exactly, since `sharing` connects to that same shared Postgres instance over the Docker network — both `.env.example` files say so.

**Verified**: rebuilt and restarted the service, then tested directly against the running container (not just code review) — a valid `/shares` create still works; an out-of-range lat is rejected with a clear 422; an oversized `/hazards` bbox and a `min > max` bbox are both rejected with clear 400s; an invalid `poi-corrections` status and an invalid correction `field` are both rejected; 12 rapid `POST /shares` calls succeed 9 times then get a 429 for the rest, confirming the 10/minute limit actually engages; a full report → confirm → delete hazard cycle still works end-to-end with the new `secrets`-based 24-character token, and a wrong-length token is rejected before ever reaching the database. Confirmed all 6 backend containers came back on loopback-only ports via `docker ps` and still answer real requests over `127.0.0.1`. Relaunched the mobile app itself afterward and confirmed the map, search, and every backend-dependent feature still work with no regression. Test data created during this pass was cleaned up afterward.

## Verified

All resource types tested directly against the running service (not just code review):
- **Shares**: created a share, confirmed `GET` returns exactly what was set, confirmed `PUT` both updates position and pushes `expires_at` forward, confirmed `GET` on a `DELETE`d code returns 404, confirmed `GET`/`PUT` on a code that was never created returns 404.
- **Lists**: created a list, confirmed `GET` returns exactly what was set, confirmed `PUT` updates both the label and the places, confirmed `GET` after that reflects the change, confirmed `GET` on a `DELETE`d code returns 404.
- **Hazards**: reported a flooding hazard (confirmed 24h TTL) and a checkpoint (confirmed 4h TTL), confirmed bbox filtering both includes and excludes correctly, confirmed `/confirm` bumps `expires_at` forward, confirmed `DELETE` 404s with a wrong token and succeeds with the right one. Then confirmed live end-to-end through the actual mobile app (report → marker appears → info card shows it correctly).
- **POI corrections**: submitted a real name correction against a real POI, approved it via `review_poi_corrections.py`, confirmed via a direct Typesense read that the document actually changed — then reverted it the same way and confirmed the revert. Confirmed a `closed`-type report doesn't touch Typesense at all (just prints the manual delete command), confirmed `reject` and confirmed approving an already-decided correction is refused.
- **Ferry routes / dive sites / border crossings**: confirmed all three endpoints return the real curated JSON content. Ferries and dive sites confirmed live in the mobile app (both panels open with correct data, real operator links, and the dive-site "Directions" button correctly starts routing) — the border-crossing markers/card weren't re-confirmed visually in this same pass (the Simulator's screenshot capture became unreliable partway through), but use the identical `Marker`+Modal-card pattern already visually verified for the other two. Also directly verified the "edit the file, `docker compose restart`, no rebuild needed" maintenance workflow — changed a value, restarted, confirmed the API reflected it, reverted, restarted again, confirmed reverted.

See `mobile/README.md`'s location-sharing, shared-lists, search-along-route, hazard-reporting, POI-correction, ferry-schedule, dive-site, and border-crossing sections for the client-side UI and its own verification notes.

## Tests (2026-09-13)

`app/test_main.py` — a real pytest suite, the first automated tests anywhere in this project (everything above was verified by hand, one curl/session at a time). 22 tests across every resource type: full create→read→update→delete cycles for shares and lists, a full report→confirm→delete cycle for hazards plus bbox edge cases (oversized span, inverted min/max), POI correction submission + listing, every input-validation rule added in the hardening pass above (out-of-range coordinates, an oversized list, an invalid correction `field`/status filter, a too-short delete token), the three static-content endpoints, `/health`, and a direct test that the rate limiter actually engages (10 requests succeed, the 11th gets a real 429).

**Why these run inside the container, not on the host**: they use FastAPI's `TestClient` to call `main.py` in-process (no network hop to the running server), but `main.py` itself still opens a real `psycopg2` connection to `postgis` — and a direct Postgres connection from the host hits the same Colima-networking bug `scripts/db_exec.sh`'s header comment already documents (HTTP is unaffected, only Postgres's own wire protocol). Running the suite inside the `sharing` container sidesteps it the same way that script does.

These are genuine integration tests against the real dev database, not mocks — consistent with how this whole project has been verified throughout, not a new testing philosophy introduced just for this. Every test that creates a row deletes it again before finishing (confirmed after a full run: `location_shares`/`shared_lists`/`hazard_reports` all back to the counts they started at) — the one deliberate exception is a single `pending` POI correction, since that resource has no delete endpoint at all by design (approve/reject only, via the admin script); it's harmless leftover for that script to skip past, not a bug.

Run them:
```bash
docker exec belize-sharing pip install -r requirements-dev.txt   # once per container lifecycle
docker exec belize-sharing pytest -v
```
`test_main.py` and `requirements-dev.txt` are mounted read-only by `docker-compose.yml` (same pattern as `scripts/`'s own mount) — editing a test needs no image rebuild.
