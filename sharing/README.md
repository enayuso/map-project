# Location Sharing & Shared Lists (Phase 4.5)

Two features, one small service: live "share my location with someone" (Naver/Kakao both have this — Kakao's own "친구위치" just had its time limit removed entirely, per [docs/research/09-kakao-naver-feature-audit.md](../docs/research/09-kakao-naver-feature-audit.md)), and shareable saved-place lists (Naver's own Dec 2022 favorites-folder upgrade). Neither is blocked by any Belize-specific data problem the way most of this project's remaining feature gaps are — both are pure product engineering on top of infrastructure that already exists.

## Model: a short code, not a user account

No login, no friend graph — a share is just a random 6-character code (`create_share` → `{code, expiresAt}`). Give the code to whoever should see your position; they enter it to watch. This is the same trust model as a shared document link, **not** real authentication — good enough for a hobby-scale v1, called out explicitly here (and in `app/main.py`'s own header comment) so it's never mistaken for more secure than it is.

**Sliding expiry, not fixed**: every position update (`PUT /shares/{code}`) pushes `expires_at` forward by 6 hours again. An actively-shared location effectively never expires while genuinely in use — but a share nobody's updating anymore (app closed, forgot to tap "stop") ages out on its own rather than a leaked code staying valid forever. `GET`/`PUT` both treat an expired row as "not found"; something still has to actually `DELETE` old rows eventually — see `scripts/cleanup_expired_shares.sh`.

**Shared lists have no expiry at all**, deliberately — unlike a live location, a saved list of places isn't inherently ephemeral, and Naver's own version doesn't expire shared lists either. They persist until their owner explicitly deletes them (`DELETE /lists/{code}`).

## Why a custom service, not an off-the-shelf tool

Every other backend piece in this project is a proven, self-hosted OSS tool (Nominatim, Typesense, Valhalla, Martin) — deliberately, per this project's own established pattern of reaching for a real tool before writing custom code. This one's different on purpose: the actual logic here (four small endpoints over one Postgres table) is genuinely too small to justify standing up unfamiliar new infrastructure just to keep that pattern intact — e.g. Redis + a Redis-to-HTTP bridge (`webdis`) would be two brand-new pieces of infrastructure this project has never touched, in service of a feature this size. A small [FastAPI](https://fastapi.tiangolo.com/) app (MIT-licensed, consistent with Locked Decision 4) reusing the **same** `belize` Postgres database every other service already writes to was the simpler choice in practice, not just in principle.

## Setup

1. Both tables must exist in the shared `belize` database first (one-time, same pattern as every other schema change in this project):
   ```bash
   scripts/create_location_shares_table.sh
   scripts/create_shared_lists_table.sh
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
| `GET /health` | `{ok: true}` |

## Verified

Both resource types tested directly against the running service (not just code review):
- **Shares**: created a share, confirmed `GET` returns exactly what was set, confirmed `PUT` both updates position and pushes `expires_at` forward, confirmed `GET` on a `DELETE`d code returns 404, confirmed `GET`/`PUT` on a code that was never created returns 404.
- **Lists**: created a list, confirmed `GET` returns exactly what was set, confirmed `PUT` updates both the label and the places, confirmed `GET` after that reflects the change, confirmed `GET` on a `DELETE`d code returns 404.

See `mobile/README.md`'s location-sharing and shared-lists sections for the client-side UI and its own verification notes.
