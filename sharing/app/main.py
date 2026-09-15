"""
Phase 4.5: live location sharing, and shareable saved-place lists —
Naver/Kakao both have location sharing (Kakao's own "친구위치" just had its
time limit removed entirely in Nov 2025, per docs/research/
09-kakao-naver-feature-audit.md), and Naver has named/shareable favorites
folders (Dec 2022). Both are pure product engineering, not dependent on
Belize-specific data the way most of this project's remaining gaps are.

Deliberately no user accounts for either: a short random code is the whole
access model — create a share/list, get a code back, give the code to
whoever should see it. Same trust model as e.g. a shared Google Doc link,
not a real authentication system; fine for a hobby-scale v1, called out
here so it's never mistaken for more secure than it is.

A location share's expiry is sliding, not fixed: every position update
pushes expires_at forward by TTL again, so an actively-shared location
stays valid indefinitely in practice (matching the *spirit* of Kakao's
newest version), while one nobody's updating anymore (app closed, forgot
to stop sharing) cleans itself up on its own rather than a leaked code
staying valid forever — a real privacy consideration a fixed-forever code
would have. See scripts/cleanup_expired_shares.sh for the actual
row-deletion side of this (queries here just filter expired rows out;
something still has to eventually DELETE them).

Shared lists (place folders) have no expiry at all, deliberately — unlike
a live location, a saved list of places isn't inherently ephemeral, and
Naver's own version doesn't expire them either. They persist until their
owner explicitly deletes them.

Profiles (added 2026-09-15, see docs/research/14-naver-kakao-profile-
systems.md) are the one exception to "no accounts" above — the first
feature in this app needing real identity rather than a device-local
preference or a shareable code. Deliberately NOT a Naver/Kakao-style
account system. Two sign-in methods, both optional per profile row:

- Sign in with Apple, built first, keyed by Apple's own stable per-app
  user identifier (the identity token's `sub` claim) — this service
  never sees or stores the user's real Apple ID email. Needs the paid
  Apple Developer Program membership to actually enable the capability,
  which turned out to be a real blocker (a genuine recurring cost, see
  Locked Decision 3 in docs/PLAN.md) before a single real sign-in ever
  completed — the code stays fully in place for whenever that membership
  exists, it just isn't the only option anymore.
- Email + password (added the same day, once the above blocker showed
  up) — this app's own first-party account system, not a third-party
  login, so it doesn't trigger App Store Review Guideline 4.8's "must
  also offer Sign in with Apple" rule at all (that rule only applies to
  third-party/social logins — Google, Facebook, etc. — not an app's own
  email/password system). No email-verification or password-reset flow
  yet — both would need an email-sending service this project doesn't
  have; a deliberate, dev-stage-appropriate gap, not an oversight.

Either method ends the same way: mint an opaque session token (same
"random bearer secret" trust pattern as every other table here —
location_shares' code, a hazard report's delete_token) and use that for
every request after, rather than re-verifying a password/JWT on every
single API call. A profile is keyed by its own internal `id`, not by
either auth method directly, specifically so both can coexist in the
schema without a rework.
"""

import json
import os
import secrets
import string
import time
from datetime import datetime, timedelta, timezone
from typing import Literal

import bcrypt
import jwt
import psycopg2
import psycopg2.errors
import psycopg2.extras
import requests
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field, field_validator
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

DB_HOST = os.environ.get("DB_HOST", "postgis")
DB_NAME = os.environ.get("DB_NAME", "belize")
DB_USER = os.environ.get("DB_USER", "belize")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "devpass123")

TTL = timedelta(hours=6)
CODE_LENGTH = 6
# Uppercase + digits only, no lowercase — codes need to be readable and
# nameable out loud/by hand ("share code Bravo-Two-Four...") without
# ambiguity, the same reasoning most short-code systems (confirmation
# codes, gift cards) use.
CODE_ALPHABET = string.ascii_uppercase + string.digits

app = FastAPI(title="Belize Map — Location Sharing")
# Dev-only wide-open CORS, consistent with this project's existing
# dev-only credentials elsewhere (e.g. backend/docker-compose.yml's
# "devpass123") — tighten before any real deployment.
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Rate limiting, keyed by client IP — this service has no accounts, so a
# share code or delete token is the only thing gating a write, and with no
# limiter at all any of these endpoints could be spammed freely (fill the
# hazards table, brute-force a delete_token, etc.). In-memory storage
# (slowapi's default) is fine at this scale: one process, no need for a
# shared Redis-backed counter across replicas. Per-route limits below are
# grouped by how the endpoint is actually used, not a single blanket
# number — a location share's PUT/GET are polled every few seconds during
# active use and need real headroom, while a hazard report or POI
# correction is a deliberate, occasional user action and doesn't.
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

MUTATE_LIMIT = "10/minute"  # creating/deleting a share, list, hazard report, correction
POLL_LIMIT = "30/minute"  # reading/updating an active location share or list
STATIC_LIMIT = "20/minute"  # ferry/dive-site/border-crossing content, fetched ~once per session
AUTH_LIMIT = "5/minute"  # sign-up/log-in/Apple sign-in attempts — tighter than a plain mutation specifically to slow down password-guessing against /auth/login
VERIFY_LIMIT = "5/minute"  # code-verify/resend attempts — same reasoning as AUTH_LIMIT, applied to guessing a 6-digit code instead of a password


def get_conn():
    return psycopg2.connect(host=DB_HOST, dbname=DB_NAME, user=DB_USER, password=DB_PASSWORD)


def generate_code() -> str:
    # secrets.choice, not random.choice — this code is the entire access
    # model for a share/list (no accounts), so it needs to be
    # unguessable, not just well-distributed. random's Mersenne Twister
    # is a fine PRNG for simulations; it's not a cryptographic one, and
    # its output is predictable if an attacker ever recovers its internal
    # state. secrets wraps the OS's own CSPRNG instead.
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))


class CreateShareBody(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    label: str | None = Field(default=None, max_length=80)


class UpdateShareBody(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)


@app.post("/shares")
@limiter.limit(MUTATE_LIMIT)
def create_share(request: Request, body: CreateShareBody):
    now = datetime.now(timezone.utc)
    expires_at = now + TTL
    code = generate_code()
    conn = get_conn()
    try:
        with conn, conn.cursor() as cur:
            cur.execute(
                "INSERT INTO location_shares (code, lat, lon, label, updated_at, expires_at) "
                "VALUES (%s, %s, %s, %s, %s, %s)",
                (code, body.lat, body.lon, body.label, now, expires_at),
            )
        return {"code": code, "expiresAt": expires_at.isoformat()}
    except psycopg2.errors.UniqueViolation:
        # CODE_LENGTH=6 over a 36-character alphabet is ~2.2 billion
        # combinations — a genuine collision at hobby scale is remote
        # enough to just surface as a clear, retriable error rather than
        # adding retry-loop complexity for it.
        raise HTTPException(500, "Code collision, please try again") from None
    finally:
        conn.close()


@app.put("/shares/{code}")
@limiter.limit(POLL_LIMIT)
def update_share(request: Request, code: str, body: UpdateShareBody):
    now = datetime.now(timezone.utc)
    expires_at = now + TTL
    conn = get_conn()
    try:
        with conn, conn.cursor() as cur:
            cur.execute(
                "UPDATE location_shares SET lat=%s, lon=%s, updated_at=%s, expires_at=%s "
                "WHERE code=%s AND expires_at > %s",
                (body.lat, body.lon, now, expires_at, code, now),
            )
            if cur.rowcount == 0:
                raise HTTPException(404, "Share not found or expired")
        return {"expiresAt": expires_at.isoformat()}
    finally:
        conn.close()


@app.get("/shares/{code}")
@limiter.limit(POLL_LIMIT)
def get_share(request: Request, code: str):
    now = datetime.now(timezone.utc)
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT lat, lon, label, updated_at, expires_at FROM location_shares "
                "WHERE code=%s AND expires_at > %s",
                (code, now),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(404, "Share not found or expired")
        return {
            "lat": row["lat"],
            "lon": row["lon"],
            "label": row["label"],
            "updatedAt": row["updated_at"].isoformat(),
            "expiresAt": row["expires_at"].isoformat(),
        }
    finally:
        conn.close()


@app.delete("/shares/{code}")
@limiter.limit(MUTATE_LIMIT)
def delete_share(request: Request, code: str):
    """The explicit "stop sharing" action — deletes immediately rather
    than waiting for expiry, since the whole point is the sharer's own
    control over when it ends."""
    conn = get_conn()
    try:
        with conn, conn.cursor() as cur:
            cur.execute("DELETE FROM location_shares WHERE code=%s", (code,))
        return {"ok": True}
    finally:
        conn.close()


class ListPlace(BaseModel):
    id: str = Field(max_length=200)
    name: str = Field(max_length=200)
    subtitle: str = Field(max_length=200)
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)


# Caps how many places one shared list can hold — a Kakao/Naver-style saved
# list is a human-curated handful of favorites, not a bulk data channel;
# without a cap, one request could otherwise insert an arbitrarily large
# places_json blob.
MAX_LIST_PLACES = 200


class CreateListBody(BaseModel):
    label: str = Field(max_length=80)
    places: list[ListPlace] = Field(max_length=MAX_LIST_PLACES)


class UpdateListBody(BaseModel):
    label: str = Field(max_length=80)
    places: list[ListPlace] = Field(max_length=MAX_LIST_PLACES)


@app.post("/lists")
@limiter.limit(MUTATE_LIMIT)
def create_list(request: Request, body: CreateListBody):
    code = generate_code()
    now = datetime.now(timezone.utc)
    places_json = json.dumps([p.model_dump() for p in body.places])
    conn = get_conn()
    try:
        with conn, conn.cursor() as cur:
            cur.execute(
                "INSERT INTO shared_lists (code, label, places_json, updated_at) VALUES (%s, %s, %s, %s)",
                (code, body.label, places_json, now),
            )
        return {"code": code}
    except psycopg2.errors.UniqueViolation:
        raise HTTPException(500, "Code collision, please try again") from None
    finally:
        conn.close()


@app.put("/lists/{code}")
@limiter.limit(POLL_LIMIT)
def update_list(request: Request, code: str, body: UpdateListBody):
    """The owner's device calls this whenever the list's contents change
    locally — a viewer polling GET /lists/{code} then sees the update,
    matching Naver's own "shared lists stay live" behavior (Dec 2022)."""
    now = datetime.now(timezone.utc)
    places_json = json.dumps([p.model_dump() for p in body.places])
    conn = get_conn()
    try:
        with conn, conn.cursor() as cur:
            cur.execute(
                "UPDATE shared_lists SET label=%s, places_json=%s, updated_at=%s WHERE code=%s",
                (body.label, places_json, now, code),
            )
            if cur.rowcount == 0:
                raise HTTPException(404, "List not found")
        return {"ok": True}
    finally:
        conn.close()


@app.get("/lists/{code}")
@limiter.limit(POLL_LIMIT)
def get_list(request: Request, code: str):
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT label, places_json, updated_at FROM shared_lists WHERE code=%s", (code,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(404, "List not found")
        return {
            "label": row["label"],
            "places": json.loads(row["places_json"]),
            "updatedAt": row["updated_at"].isoformat(),
        }
    finally:
        conn.close()


@app.delete("/lists/{code}")
@limiter.limit(MUTATE_LIMIT)
def delete_list(request: Request, code: str):
    conn = get_conn()
    try:
        with conn, conn.cursor() as cur:
            cur.execute("DELETE FROM shared_lists WHERE code=%s", (code,))
        return {"ok": True}
    finally:
        conn.close()


class ReportHazardBody(BaseModel):
    # Not constrained to a fixed enum on purpose — HAZARD_TYPE_TTL below
    # already falls back to a plain default for any type it doesn't
    # recognize, a deliberate extensibility choice; max_length just caps
    # abuse (a garbage 10KB string), not the set of valid values.
    type: str = Field(max_length=30)
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    note: str | None = Field(default=None, max_length=140)


# Per-type default lifetime — a checkpoint or crash is usually gone within a
# few hours, while a real flood/washout tends to stay impassable much
# longer (per docs/research/10-remaining-feature-gaps.md's own note on this).
# Anything not in this map falls back to a plain 6h default (HAZARD_TTL).
HAZARD_TTL = timedelta(hours=6)
HAZARD_TYPE_TTL: dict[str, timedelta] = {
    "flooding": timedelta(hours=24),
    "washout": timedelta(hours=48),
    "checkpoint": timedelta(hours=4),
    "crash": timedelta(hours=3),
    "hazard": timedelta(hours=6),
}
# Every "still here" confirmation pushes expiry forward by this much (capped
# at MAX_HAZARD_AGE from the original report) — same sliding-TTL idea as
# location_shares, applied to community reinforcement instead of a single
# owner's own activity.
CONFIRM_BUMP = timedelta(hours=3)
MAX_HAZARD_AGE = timedelta(days=3)


def generate_delete_token() -> str:
    # Longer and full-alphabet unlike the 6-char share/list codes — this is
    # a bearer secret meant to be copied by the app, never read aloud by a
    # person, so there's no benefit to a short/unambiguous alphabet here.
    # secrets.choice, not random.choice — see generate_code's own comment;
    # this one matters even more, since it's the only thing gating who can
    # delete someone else's hazard report.
    return "".join(secrets.choice(string.ascii_letters + string.digits) for _ in range(24))


@app.post("/hazards")
@limiter.limit(MUTATE_LIMIT)
def report_hazard(request: Request, body: ReportHazardBody):
    now = datetime.now(timezone.utc)
    ttl = HAZARD_TYPE_TTL.get(body.type, HAZARD_TTL)
    expires_at = now + ttl
    delete_token = generate_delete_token()
    conn = get_conn()
    try:
        with conn, conn.cursor() as cur:
            cur.execute(
                "INSERT INTO hazard_reports (type, lat, lon, note, delete_token, reported_at, expires_at) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id",
                (body.type, body.lat, body.lon, body.note, delete_token, now, expires_at),
            )
            new_id = cur.fetchone()[0]
        return {"id": new_id, "deleteToken": delete_token, "expiresAt": expires_at.isoformat()}
    finally:
        conn.close()


# Belize's own bounding box is roughly 1deg lat x 1.5deg lon (see
# backend/martin-config.yaml's table bounds) — 10deg a side is already
# ~10x that in each direction, generously covering "zoomed all the way out
# to look at the whole country" with room to spare, while still rejecting
# a query for an unbounded/planet-scale box (each degree of bbox width is
# real work for the DB: a wider box means a full-table range scan instead
# of one that only touches nearby rows).
MAX_BBOX_SPAN_DEG = 10.0


@app.get("/hazards")
@limiter.limit(POLL_LIMIT)
def list_hazards(
    request: Request,
    min_lat: float = Query(ge=-90, le=90),
    max_lat: float = Query(ge=-90, le=90),
    min_lon: float = Query(ge=-180, le=180),
    max_lon: float = Query(ge=-180, le=180),
):
    """Bbox query, same shape as the mobile client already computes for
    offline-pack downloads (mapRef.getBounds()) — no PostGIS geography type
    needed at this scale, a plain lat/lon range is exact enough for a bbox
    filter and keeps this service's schema as simple as location_shares'."""
    if min_lat > max_lat or min_lon > max_lon:
        raise HTTPException(400, "min must not exceed max")
    if (max_lat - min_lat) > MAX_BBOX_SPAN_DEG or (max_lon - min_lon) > MAX_BBOX_SPAN_DEG:
        raise HTTPException(400, f"bbox span must not exceed {MAX_BBOX_SPAN_DEG} degrees per side")
    now = datetime.now(timezone.utc)
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT id, type, lat, lon, note, confirm_count, reported_at, expires_at "
                "FROM hazard_reports "
                "WHERE expires_at > %s AND lat BETWEEN %s AND %s AND lon BETWEEN %s AND %s "
                "ORDER BY reported_at DESC",
                (now, min_lat, max_lat, min_lon, max_lon),
            )
            rows = cur.fetchall()
        return {
            "hazards": [
                {
                    "id": r["id"],
                    "type": r["type"],
                    "lat": r["lat"],
                    "lon": r["lon"],
                    "note": r["note"],
                    "confirmCount": r["confirm_count"],
                    "reportedAt": r["reported_at"].isoformat(),
                    "expiresAt": r["expires_at"].isoformat(),
                }
                for r in rows
            ]
        }
    finally:
        conn.close()


@app.post("/hazards/{hazard_id}/confirm")
@limiter.limit(MUTATE_LIMIT)
def confirm_hazard(request: Request, hazard_id: int):
    """"Still here" — any other user can confirm a report is still valid,
    which both bumps its expiry forward (capped at MAX_HAZARD_AGE from the
    original report, so a confirmed-forever report can't outlive that cap)
    and increments confirm_count for future ranking/trust use."""
    now = datetime.now(timezone.utc)
    conn = get_conn()
    try:
        with conn, conn.cursor() as cur:
            # RETURNING avoids a second round-trip to read back the very
            # value the UPDATE just computed.
            cur.execute(
                "UPDATE hazard_reports SET "
                "expires_at = LEAST(reported_at + %s, GREATEST(expires_at, %s) + %s), "
                "confirm_count = confirm_count + 1 "
                "WHERE id = %s AND expires_at > %s "
                "RETURNING expires_at",
                (MAX_HAZARD_AGE, now, CONFIRM_BUMP, hazard_id, now),
            )
            row = cur.fetchone()
            if row is None:
                raise HTTPException(404, "Report not found or expired")
            expires_at = row[0]
        return {"expiresAt": expires_at.isoformat()}
    finally:
        conn.close()


@app.delete("/hazards/{hazard_id}")
@limiter.limit(MUTATE_LIMIT)
def delete_hazard(request: Request, hazard_id: int, delete_token: str = Query(min_length=24, max_length=24)):
    """The reporter's own retract action — requires the delete_token only
    they received back from report_hazard, same bearer-secret trust model
    as everything else in this service."""
    conn = get_conn()
    try:
        with conn, conn.cursor() as cur:
            cur.execute(
                "DELETE FROM hazard_reports WHERE id = %s AND delete_token = %s",
                (hazard_id, delete_token),
            )
            if cur.rowcount == 0:
                raise HTTPException(404, "Report not found or wrong token")
        return {"ok": True}
    finally:
        conn.close()


class SubmitCorrectionBody(BaseModel):
    poi_id: str = Field(max_length=200)
    poi_name: str = Field(max_length=200)
    # Literal, not a plain str — unlike a hazard report's `type` (which
    # deliberately tolerates unknown values via a fallback default), the
    # mobile client's own CorrectionField union (src/poi-corrections/api.ts)
    # is exactly these four values with no extensibility fallback, so
    # rejecting anything else here is the correct behavior, not just
    # incidental hardening.
    field: Literal["name", "category", "closed", "other"]
    current_value: str | None = Field(default=None, max_length=200)
    suggested_value: str | None = Field(default=None, max_length=200)
    note: str | None = Field(default=None, max_length=200)


@app.post("/poi-corrections")
@limiter.limit(MUTATE_LIMIT)
def submit_correction(request: Request, body: SubmitCorrectionBody):
    now = datetime.now(timezone.utc)
    conn = get_conn()
    try:
        with conn, conn.cursor() as cur:
            cur.execute(
                "INSERT INTO poi_corrections (poi_id, poi_name, field, current_value, suggested_value, note, submitted_at) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id",
                (body.poi_id, body.poi_name, body.field, body.current_value, body.suggested_value, body.note, now),
            )
            new_id = cur.fetchone()[0]
        return {"id": new_id}
    finally:
        conn.close()


@app.get("/poi-corrections")
@limiter.limit(POLL_LIMIT)
def list_corrections(request: Request, status: Literal["pending", "approved", "rejected"] = "pending"):
    """Read-only queue listing — low-risk to expose without auth (nothing
    here can be mutated through this endpoint). Approving/rejecting is
    deliberately NOT an HTTP endpoint at all — see scripts/
    review_poi_corrections.py's own header comment for why that's a local
    admin script instead of another route on this wide-open-CORS,
    no-auth service."""
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT id, poi_id, poi_name, field, current_value, suggested_value, note, status, submitted_at "
                "FROM poi_corrections WHERE status = %s ORDER BY submitted_at ASC",
                (status,),
            )
            rows = cur.fetchall()
        return {
            "corrections": [
                {
                    "id": r["id"],
                    "poiId": r["poi_id"],
                    "poiName": r["poi_name"],
                    "field": r["field"],
                    "currentValue": r["current_value"],
                    "suggestedValue": r["suggested_value"],
                    "note": r["note"],
                    "status": r["status"],
                    "submittedAt": r["submitted_at"].isoformat(),
                }
                for r in rows
            ]
        }
    finally:
        conn.close()


APPLE_ISSUER = "https://appleid.apple.com"
APPLE_KEYS_URL = "https://appleid.apple.com/auth/keys"
# The app's real bundle id (confirmed via `xcrun simctl listapps` against
# the running Simulator) — Sign in with Apple's identity token sets `aud`
# to this, and rejecting anything else is what stops a token minted for a
# *different* app from being replayed against this service.
APPLE_BUNDLE_ID = os.environ.get("APPLE_BUNDLE_ID", "org.reactjs.native.example.BelizeMap")
# Apple rotates its signing keys infrequently — refetching on every sign-in
# would be one avoidable outbound request per login for keys that are, in
# practice, stable for days at a time. A process-local cache with a plain
# TTL (no need for anything fancier — this service is one process, same
# reasoning as the in-memory rate limiter above) keeps that cost near zero
# while still picking up a real rotation within a day.
APPLE_KEYS_CACHE_TTL = timedelta(hours=24)
_apple_keys_cache: dict | None = None
_apple_keys_fetched_at: datetime | None = None


def get_apple_public_keys() -> dict:
    global _apple_keys_cache, _apple_keys_fetched_at
    now = datetime.now(timezone.utc)
    if _apple_keys_cache is None or _apple_keys_fetched_at is None or now - _apple_keys_fetched_at > APPLE_KEYS_CACHE_TTL:
        resp = requests.get(APPLE_KEYS_URL, timeout=10)
        resp.raise_for_status()
        _apple_keys_cache = {key["kid"]: key for key in resp.json()["keys"]}
        _apple_keys_fetched_at = now
    return _apple_keys_cache


def verify_apple_identity_token(identity_token: str) -> str:
    """Verifies a Sign in with Apple identity token against Apple's own
    published public keys and returns the stable per-app user id (the
    `sub` claim) — the only thing this service uses to identify a user,
    never the token's (optional, and possibly-relayed) email claim.
    Raises HTTPException(401) for anything that doesn't check out: wrong
    signature, wrong audience/issuer, or expired — deliberately not more
    specific than that in the response, so a malformed/forged token can't
    be used to probe which specific check it failed."""
    try:
        unverified_header = jwt.get_unverified_header(identity_token)
        kid = unverified_header.get("kid")
        keys = get_apple_public_keys()
        jwk = keys.get(kid)
        if jwk is None:
            # A real rotation could plausibly land here — refresh once
            # before giving up, rather than forcing every currently-signed-
            # in user to wait out the full cache TTL after a key rotation.
            global _apple_keys_cache
            _apple_keys_cache = None
            keys = get_apple_public_keys()
            jwk = keys.get(kid)
        if jwk is None:
            raise HTTPException(401, "Invalid identity token")
        public_key = jwt.algorithms.RSAAlgorithm.from_jwk(json.dumps(jwk))
        claims = jwt.decode(
            identity_token,
            key=public_key,
            algorithms=["RS256"],
            audience=APPLE_BUNDLE_ID,
            issuer=APPLE_ISSUER,
        )
        return claims["sub"]
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(401, "Invalid identity token") from None


def generate_session_token() -> str:
    # Same reasoning as generate_delete_token above — a bearer secret the
    # app stores and replays, never something a person reads/types, so
    # secrets.token_urlsafe's full alphabet (not the 6-char share/list
    # code's constrained one) is the right tool.
    return secrets.token_urlsafe(32)


def generate_profile_id() -> str:
    # A profile's own internal id, independent of whichever auth method(s)
    # it ends up with — see create_profiles_table.sh's own header comment
    # for why this isn't apple_user_id or email directly.
    return secrets.token_urlsafe(16)


# bcrypt only ever looks at the first 72 bytes of its input — anything
# beyond that is silently ignored, which would let two different long
# passwords that happen to share a 72-byte prefix hash identically. Reject
# upfront rather than accept a false sense of security.
PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 72


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def get_current_profile_id(authorization: str | None = Header(default=None)) -> str:
    """FastAPI dependency: resolves a request's `Authorization: Bearer
    <sessionToken>` header to the profile id it belongs to, or raises 401.
    Every profile-mutating endpoint below depends on this rather than
    trusting an id the client could otherwise just pass in the body —
    the session token is the only thing that proves who's asking."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing or malformed Authorization header")
    token = authorization.removeprefix("Bearer ")
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT profile_id FROM profile_sessions WHERE token = %s", (token,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(401, "Invalid or signed-out session")
            return row[0]
    finally:
        conn.close()


# A small, fixed set of Belize-themed emoji avatars rather than an uploaded
# photo — see docs/research/14-naver-kakao-profile-systems.md's own
# conclusion (start at lightweight identity, not Naver/Kakao's years-deep
# reviewer economy) and mobile/README.md's Profile section for the full
# reasoning. Enforced server-side (not just in the mobile UI's picker) so
# PUT /profile can't be used to stash an arbitrary string in this field.
AVATAR_EMOJI_CHOICES = ["🧭", "🐢", "🦜", "🦞", "🐬", "🌴", "🏝️", "⛵", "🦋", "🐆"]
DEFAULT_AVATAR_EMOJI = AVATAR_EMOJI_CHOICES[0]


def generate_default_nickname() -> str:
    # A friendly, anonymous-by-default starting nickname — matches this
    # app not asking for a real name anywhere else either (Sign in with
    # Apple's own `name` claim is deliberately never requested, see the
    # AppleSignInBody/sign-in flow below). Purely cosmetic collisions
    # between two users both landing on "Explorer 4821" are fine — this is
    # a display nickname, not an identifier.
    return f"Explorer {secrets.randbelow(9000) + 1000}"


# Email verification (added 2026-09-15, same day as email/password itself)
# — a 6-digit code, not a clickable link: this app has no hosted web page
# to land a link on and no deep-linking set up, so a code the user reads
# from their inbox and types back into the app is the simpler fit, not
# just the more common one.
EMAIL_VERIFICATION_TTL = timedelta(minutes=15)
# Caps guesses against a 6-digit code (1,000,000 possibilities) within its
# own lifetime — VERIFY_LIMIT's 5/minute already slows this a lot, but a
# per-code attempt cap is a second, independent backstop that survives
# even if someone found a way around the per-IP rate limit (a botnet, a
# rotating proxy) — the code becomes unusable after this many wrong
# guesses regardless of where the requests came from.
MAX_VERIFY_ATTEMPTS = 5

# A second, independent budget on top of MAX_VERIFY_ATTEMPTS — researched
# from a production reference (the reference system's own magic-link/code system, see
# mobile/README.md's Profile section) rather than invented from scratch.
# MAX_VERIFY_ATTEMPTS alone has a real hole: request a fresh code (which
# resets the per-code counter) and the previous wrong guesses are forgotten
# — repeat indefinitely and the per-code cap never actually stops anything.
# This tracks wrong guesses *cumulatively per email*, in a rolling window
# that only the wall clock resets, independent of how many codes were
# issued or resent within it — closing that hole at the root rather than
# tightening the per-code number further (which wouldn't help; the hole is
# that resetting is possible at all, not that 5 is too generous).
EMAIL_CODE_ATTEMPT_WINDOW = timedelta(minutes=15)
EMAIL_CODE_ATTEMPT_BUDGET = 10

# Caps how many times *one* code can be resent (emailed again unchanged)
# and enforces a cooldown between resends — independent of, and checked
# before, MAX_VERIFY_ATTEMPTS/EMAIL_CODE_ATTEMPT_BUDGET above. See
# issue_verification_code's own comment for why a resend reuses the
# existing code rather than minting a new one.
MAX_CODE_SENDS = 5
CODE_RESEND_COOLDOWN = timedelta(seconds=30)

# Resend (https://resend.com) — chosen after checking current free-tier
# options: 3,000 emails/month, permanently free (not a trial), a plain
# HTTP API needing no new Python dependency (requests, already added for
# Apple's JWKS fetch, is enough). Real caveat, confirmed before assuming
# it: without verifying your own domain with Resend, its shared
# onboarding@resend.dev sender can only deliver to the email address the
# Resend account itself signed up with — not to arbitrary real users. Fine
# for dev/testing (this project's current stated scope for the whole
# profile feature); real delivery to real users needs that domain
# verification step later, done in your own Resend account, not something
# committable to this repo.
RESEND_API_KEY = os.environ.get("RESEND_API_KEY")
RESEND_FROM_EMAIL = os.environ.get("RESEND_FROM_EMAIL", "onboarding@resend.dev")


def generate_verification_code() -> str:
    # secrets.randbelow, not random — this code is a real (if short-lived)
    # access credential, same reasoning as every other secrets.choice/
    # token_urlsafe use in this file. Zero-padded to 6 digits — a code
    # like "004821" is exactly as valid as "984821", both equally likely.
    return f"{secrets.randbelow(1_000_000):06d}"


def send_verification_email(to_email: str, code: str) -> None:
    """Best-effort — a failed send here doesn't fail signup/resend, since
    the user can always request another code once whatever's wrong (a
    missing API key during dev, a transient Resend error) is sorted out."""
    if not RESEND_API_KEY:
        # Dev fallback: no RESEND_API_KEY configured at all yet — print the
        # code server-side (visible via `docker logs belize-sharing`,
        # already how this service is monitored elsewhere) instead of
        # emailing it, so the whole verification flow is fully testable
        # with zero external accounts. See this function's own module-level
        # comment above for what real delivery still needs.
        print(f"[dev-fallback] email verification code for {to_email}: {code}")
        return
    try:
        resp = requests.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
            json={
                "from": RESEND_FROM_EMAIL,
                "to": [to_email],
                "subject": "Your Belize Map verification code",
                "text": f"Your verification code is {code}. It expires in 15 minutes.",
            },
            timeout=10,
        )
        if not resp.ok:
            print(f"[verification email] Resend returned {resp.status_code} for {to_email}: {resp.text}")
    except requests.RequestException as e:
        print(f"[verification email] failed to reach Resend for {to_email}: {e}")


def issue_verification_code(cur, profile_id: str, email: str) -> None:
    """Generates a genuinely fresh code — new value, attempts and
    send_count both reset — replacing any previous pending code for this
    profile. Used for a signup's very first code, and for a resend when
    the previous code had already expired (or never existed). Takes an
    open cursor rather than its own connection so callers can do this as
    part of their own transaction.

    Deliberately NOT used for resending a code that's still valid — see
    resend_verification, which reuses the existing code instead of calling
    this. Rotating the code on every resend (an earlier version of this
    function did exactly that) quietly resets `attempts` too, letting a
    resend-then-retry loop bypass MAX_VERIFY_ATTEMPTS as many times as
    resends are allowed.

    window_started_at/window_attempts are deliberately left untouched here
    (not listed in the ON CONFLICT SET) — seeing EMAIL_CODE_ATTEMPT_BUDGET's
    own comment for why that cumulative counter is scoped to wall-clock
    time, not to any one code's lifecycle: resetting it on every fresh
    code would reopen the exact hole that counter exists to close."""
    code = generate_verification_code()
    now = datetime.now(timezone.utc)
    expires_at = now + EMAIL_VERIFICATION_TTL
    cur.execute(
        "INSERT INTO email_verification_codes (profile_id, code, expires_at, attempts, send_count, last_sent_at) "
        "VALUES (%s, %s, %s, 0, 1, %s) "
        "ON CONFLICT (profile_id) DO UPDATE SET "
        "code = EXCLUDED.code, expires_at = EXCLUDED.expires_at, attempts = 0, "
        "send_count = 1, last_sent_at = EXCLUDED.last_sent_at",
        (profile_id, code, expires_at, now),
    )
    send_verification_email(email, code)


class AppleSignInBody(BaseModel):
    identity_token: str = Field(alias="identityToken", max_length=4096)

    class Config:
        populate_by_name = True


class SignupBody(BaseModel):
    email: EmailStr
    password: str = Field(min_length=PASSWORD_MIN_LENGTH, max_length=PASSWORD_MAX_LENGTH)


class LoginBody(BaseModel):
    email: EmailStr
    # Deliberately not re-enforcing PASSWORD_MIN_LENGTH here — a stored
    # hash was always created under that rule, so a too-short guess just
    # fails the hash comparison below like any other wrong password would.
    # Re-validating length here would only leak, via a 422 vs. 401
    # difference, that the *format* was wrong before even checking the
    # database — a smaller signal than a real login oracle, but free to
    # avoid by just not adding the check.
    password: str = Field(min_length=1, max_length=PASSWORD_MAX_LENGTH)


def _row_to_profile_response(row) -> dict:
    return {
        "nickname": row["nickname"],
        "avatarEmoji": row["avatar_emoji"],
        "memberSince": row["created_at"].isoformat(),
        "emailVerified": row["email_verified"],
    }


@app.post("/auth/signup")
@limiter.limit(AUTH_LIMIT)
def sign_up(request: Request, body: SignupBody):
    """Creates a new email/password profile — this app's own first-party
    account system, added 2026-09-15 specifically so profiles work without
    the Apple Developer Program's paid membership Sign in with Apple
    turned out to require (see mobile/README.md's Profile section). Not a
    replacement for Sign in with Apple below, which stays fully working
    for whenever that membership exists — just no longer the only way in."""
    email = body.email.lower()
    now = datetime.now(timezone.utc)
    profile_id = generate_profile_id()
    conn = get_conn()
    try:
        with conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "INSERT INTO profiles (id, email, password_hash, email_verified, nickname, avatar_emoji, created_at, updated_at) "
                "VALUES (%s, %s, %s, FALSE, %s, %s, %s, %s) RETURNING nickname, avatar_emoji, created_at, email_verified",
                (profile_id, email, hash_password(body.password), generate_default_nickname(), DEFAULT_AVATAR_EMOJI, now, now),
            )
            row = cur.fetchone()
            token = generate_session_token()
            cur.execute(
                "INSERT INTO profile_sessions (token, profile_id, created_at) VALUES (%s, %s, %s)",
                (token, profile_id, now),
            )
            issue_verification_code(cur, profile_id, email)
        return {"sessionToken": token, "profile": _row_to_profile_response(row)}
    except psycopg2.errors.UniqueViolation:
        raise HTTPException(409, "An account with that email already exists") from None
    finally:
        conn.close()


@app.post("/auth/login")
@limiter.limit(AUTH_LIMIT)
def log_in(request: Request, body: LoginBody):
    email = body.email.lower()
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT id, password_hash, nickname, avatar_emoji, created_at, email_verified FROM profiles WHERE email = %s",
                (email,),
            )
            row = cur.fetchone()
        # The exact same failure for "no such email" and "right email,
        # wrong password" — confirming which one it was would let an
        # attacker enumerate registered emails one guess at a time. A
        # profile that signed up via Apple only (password_hash is null)
        # correctly falls into this same generic rejection, not a crash.
        if not row or not row["password_hash"] or not verify_password(body.password, row["password_hash"]):
            raise HTTPException(401, "Incorrect email or password")
        now = datetime.now(timezone.utc)
        token = generate_session_token()
        with conn, conn.cursor() as cur:
            cur.execute(
                "INSERT INTO profile_sessions (token, profile_id, created_at) VALUES (%s, %s, %s)",
                (token, row["id"], now),
            )
        return {"sessionToken": token, "profile": _row_to_profile_response(row)}
    finally:
        conn.close()


@app.post("/auth/apple")
@limiter.limit(AUTH_LIMIT)
def sign_in_with_apple(request: Request, body: AppleSignInBody):
    """Verifies the identity token Apple's own native Sign in with Apple
    flow returned to the client, then either finds the matching profile
    or creates one on the spot — there's no separate "create account"
    step; the first successful sign-in *is* account creation, same as the
    real Sign in with Apple UX everywhere else it's used."""
    apple_user_id = verify_apple_identity_token(body.identity_token)
    now = datetime.now(timezone.utc)
    conn = get_conn()
    try:
        with conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT id, nickname, avatar_emoji, created_at, email_verified FROM profiles WHERE apple_user_id = %s",
                (apple_user_id,),
            )
            row = cur.fetchone()
            if row is None:
                profile_id = generate_profile_id()
                cur.execute(
                    "INSERT INTO profiles (id, apple_user_id, nickname, avatar_emoji, created_at, updated_at) "
                    "VALUES (%s, %s, %s, %s, %s, %s) RETURNING id, nickname, avatar_emoji, created_at, email_verified",
                    (profile_id, apple_user_id, generate_default_nickname(), DEFAULT_AVATAR_EMOJI, now, now),
                )
                row = cur.fetchone()
            token = generate_session_token()
            cur.execute(
                "INSERT INTO profile_sessions (token, profile_id, created_at) VALUES (%s, %s, %s)",
                (token, row["id"], now),
            )
        return {"sessionToken": token, "profile": _row_to_profile_response(row)}
    finally:
        conn.close()


@app.delete("/auth/session")
@limiter.limit(MUTATE_LIMIT)
def sign_out(request: Request, authorization: str | None = Header(default=None)):
    """Signs out *this device only* — deletes just the session token this
    request authenticated with, leaving any other signed-in device's
    session (and the profile itself) untouched. Deliberately tolerant of
    a missing/already-invalid token (signing out twice, or after the
    token already expired some other way, should never itself be an
    error) rather than depending on get_current_profile_id, which would
    401 on exactly the "already signed out" case this needs to handle
    gracefully."""
    if not authorization or not authorization.startswith("Bearer "):
        return {"ok": True}
    token = authorization.removeprefix("Bearer ")
    conn = get_conn()
    try:
        with conn, conn.cursor() as cur:
            cur.execute("DELETE FROM profile_sessions WHERE token = %s", (token,))
        return {"ok": True}
    finally:
        conn.close()


@app.get("/profile")
@limiter.limit(POLL_LIMIT)
def get_profile(request: Request, profile_id: str = Depends(get_current_profile_id)):
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT nickname, avatar_emoji, created_at, email_verified FROM profiles WHERE id = %s", (profile_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(404, "Profile not found")
        return _row_to_profile_response(row)
    finally:
        conn.close()


class UpdateProfileBody(BaseModel):
    nickname: str | None = Field(default=None, min_length=1, max_length=24)
    avatar_emoji: str | None = Field(default=None, alias="avatarEmoji")

    class Config:
        populate_by_name = True

    @field_validator("nickname")
    @classmethod
    def nickname_must_have_visible_content(cls, v: str | None) -> str | None:
        # min_length=1 alone still lets a nickname of pure whitespace
        # through (a single space passes it) — trim first, then re-check,
        # so this can't produce a nickname that displays as blank.
        if v is None:
            return v
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("Nickname can't be blank")
        return trimmed


@app.put("/profile")
@limiter.limit(MUTATE_LIMIT)
def update_profile(request: Request, body: UpdateProfileBody, profile_id: str = Depends(get_current_profile_id)):
    if body.avatar_emoji is not None and body.avatar_emoji not in AVATAR_EMOJI_CHOICES:
        raise HTTPException(400, "Not a valid avatar choice")
    if body.nickname is None and body.avatar_emoji is None:
        raise HTTPException(400, "Nothing to update")
    now = datetime.now(timezone.utc)
    conn = get_conn()
    try:
        with conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "UPDATE profiles SET "
                "nickname = COALESCE(%s, nickname), "
                "avatar_emoji = COALESCE(%s, avatar_emoji), "
                "updated_at = %s "
                "WHERE id = %s "
                "RETURNING nickname, avatar_emoji, created_at, email_verified",
                (body.nickname, body.avatar_emoji, now, profile_id),
            )
            row = cur.fetchone()
        return _row_to_profile_response(row)
    finally:
        conn.close()


@app.post("/auth/resend-verification")
@limiter.limit(VERIFY_LIMIT)
def resend_verification(request: Request, profile_id: str = Depends(get_current_profile_id)):
    conn = get_conn()
    try:
        with conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT email, email_verified FROM profiles WHERE id = %s", (profile_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(404, "Profile not found")
            if not row["email"]:
                # An Apple-only profile has no email at all — nothing to
                # verify, so nothing to resend either.
                raise HTTPException(400, "This profile has no email to verify")
            if row["email_verified"]:
                # Not an error — the mobile UI only shows a resend button
                # while unverified, but a stale button tap (verified in the
                # meantime, e.g. from another device) shouldn't surface as
                # a failure.
                return {"ok": True}

            cur.execute(
                "SELECT code, expires_at, send_count, last_sent_at FROM email_verification_codes WHERE profile_id = %s",
                (profile_id,),
            )
            pending = cur.fetchone()
            now = datetime.now(timezone.utc)

            if pending and now <= pending["expires_at"]:
                # A still-valid code exists — resend that exact code
                # rather than minting a new one (see
                # issue_verification_code's own comment for why: rotating
                # it here would reset `attempts` too, letting a resend-
                # then-retry loop bypass MAX_VERIFY_ATTEMPTS indefinitely).
                # This resend gets its own, separate limits instead.
                if now - pending["last_sent_at"] < CODE_RESEND_COOLDOWN:
                    raise HTTPException(429, "Please wait a moment before requesting another code")
                if pending["send_count"] >= MAX_CODE_SENDS:
                    raise HTTPException(400, "Too many resend requests for this code — wait for it to expire, then request a new one")
                cur.execute(
                    "UPDATE email_verification_codes SET send_count = send_count + 1, last_sent_at = %s WHERE profile_id = %s",
                    (now, profile_id),
                )
                send_verification_email(row["email"], pending["code"])
            else:
                # No pending code, or the previous one genuinely expired —
                # a real fresh start (new code, reset per-code attempts and
                # send_count; the cumulative per-email window below is
                # untouched, on purpose, by issue_verification_code).
                issue_verification_code(cur, profile_id, row["email"])
        return {"ok": True}
    finally:
        conn.close()


class VerifyEmailBody(BaseModel):
    code: str = Field(pattern=r"^\d{6}$")


@app.post("/auth/verify-email")
@limiter.limit(VERIFY_LIMIT)
def verify_email(request: Request, body: VerifyEmailBody, profile_id: str = Depends(get_current_profile_id)):
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT code, expires_at, attempts, window_started_at, window_attempts "
                "FROM email_verification_codes WHERE profile_id = %s",
                (profile_id,),
            )
            pending = cur.fetchone()
        if not pending:
            raise HTTPException(400, "No pending verification code — request a new one")

        now = datetime.now(timezone.utc)
        window_attempts = pending["window_attempts"]

        # The cumulative per-email budget is scoped to wall-clock time, not
        # to this one code — reset it (its own commit, before any of the
        # checks below that might raise) once the window has genuinely
        # elapsed, same "don't let a later raise roll this back" reasoning
        # as the wrong-code branch further down.
        if now - pending["window_started_at"] > EMAIL_CODE_ATTEMPT_WINDOW:
            window_attempts = 0
            with conn, conn.cursor() as cur:
                cur.execute(
                    "UPDATE email_verification_codes SET window_started_at = %s, window_attempts = 0 WHERE profile_id = %s",
                    (now, profile_id),
                )

        # Checked before the per-code cap below: this is the *outer*,
        # more restrictive budget (see EMAIL_CODE_ATTEMPT_BUDGET's own
        # comment) — once it's spent, a fresh code doesn't help, so the
        # message says so explicitly rather than the per-code message's
        # "request a new code," which would be true but useless advice here.
        if window_attempts >= EMAIL_CODE_ATTEMPT_BUDGET:
            raise HTTPException(400, "Too many incorrect attempts recently — wait a while before trying again")
        if pending["attempts"] >= MAX_VERIFY_ATTEMPTS:
            raise HTTPException(400, "Too many attempts — request a new code")
        if now > pending["expires_at"]:
            raise HTTPException(400, "That code expired — request a new one")
        if body.code != pending["code"]:
            # Committed in its own block, separate from the HTTPException
            # raised right after — raising *inside* a `with conn:` block
            # rolls the whole thing back, which would silently discard
            # these increments along with it. The success path below has
            # no such problem (nothing raises after its writes), but this
            # one does, so it gets the extra care.
            with conn, conn.cursor() as cur:
                cur.execute(
                    "UPDATE email_verification_codes SET attempts = attempts + 1, window_attempts = window_attempts + 1 "
                    "WHERE profile_id = %s",
                    (profile_id,),
                )
            raise HTTPException(400, "Incorrect code")
        with conn, conn.cursor() as cur:
            cur.execute("UPDATE profiles SET email_verified = TRUE WHERE id = %s", (profile_id,))
            cur.execute("DELETE FROM email_verification_codes WHERE profile_id = %s", (profile_id,))
        return {"ok": True}
    finally:
        conn.close()


@app.delete("/profile")
@limiter.limit(MUTATE_LIMIT)
def delete_profile(request: Request, profile_id: str = Depends(get_current_profile_id)):
    """Full account deletion — required by App Store Review Guideline
    5.1.1(v) since this app offers account creation, so it must also let
    a user delete that account from within the app, not just stop using
    it.

    A soft delete, not an immediate DELETE FROM profiles — researched from
    a production reference (the reference system's own withdraw()/UserPurgeScheduler, see
    mobile/README.md's Profile section) rather than invented from scratch,
    and kept even though Belize's own Data Protection Act, 2021 (Act No. 45
    of 2021) doesn't mandate any particular grace period — it only requires
    erasure "without undue delay" once data's no longer needed, with no
    numeric figure attached the way Korea's PIPA gives the reference system's own 30 days.
    Doing the same thing anyway, on its own merits: a short recovery window
    for an accidental or coerced deletion, before the data is actually gone
    for good (see scripts/purge_deleted_profiles.sh, the single place that
    grace-period length is defined — this endpoint doesn't need to know
    that number at all, only that deleted_at marks when the clock started).
    Everything below happens immediately and synchronously, in one
    transaction, so a "deleted" account is unreachable right away, not
    just eventually:
    - apple_user_id/email/password_hash all set NULL — see
      create_profiles_table.sh's own comment for why this alone (no
      reference-style tombstone email) is enough to free the email/Apple ID
      for a brand-new signup immediately, on Postgres.
    - deleted_at recorded, marking the row as soft-deleted (and starting
      its grace-period clock).
    - Every session for this profile deleted outright, not left for
      ON DELETE CASCADE to eventually clean up — the profile row itself
      isn't being deleted here, so cascade wouldn't fire at all; this signs
      the user out of every device in the same statement a hard delete used
      to get for free.
    - Any pending email_verification_codes row deleted too — an unverified
      account that gets deleted shouldn't leave a guessable code lying
      around against a profile_id that no longer has a real owner.

    The UPDATE's `WHERE ... AND deleted_at IS NULL` makes this idempotent —
    without it, two devices racing a near-simultaneous DELETE /profile for
    the same account (both still holding valid sessions the instant either
    request starts) could each run the UPDATE, with the second one
    silently overwriting deleted_at with a later timestamp and resetting
    scripts/purge_deleted_profiles.sh's grace-period clock. With the guard,
    a second call is a genuine no-op on the profiles row (still returns
    {"ok": True} — deleting an already-deleted account is never itself an
    error, same "no accidental error" reasoning as sign_out below), and
    updated_at is bumped alongside deleted_at, matching every other write
    to this table (see update_profile) instead of freezing at whatever it
    was before deletion."""
    now = datetime.now(timezone.utc)
    conn = get_conn()
    try:
        with conn, conn.cursor() as cur:
            cur.execute(
                "UPDATE profiles SET apple_user_id = NULL, email = NULL, password_hash = NULL, "
                "deleted_at = %s, updated_at = %s "
                "WHERE id = %s AND deleted_at IS NULL",
                (now, now, profile_id),
            )
            cur.execute("DELETE FROM profile_sessions WHERE profile_id = %s", (profile_id,))
            cur.execute("DELETE FROM email_verification_codes WHERE profile_id = %s", (profile_id,))
        return {"ok": True}
    finally:
        conn.close()


DATA_DIR = os.environ.get("DATA_DIR", "/app/data")


def read_json_data(filename: str):
    """Reads a curated, hand-maintained JSON file fresh on every request —
    see docs/research/12-ferry-dive-site-data-sourcing.md for why this is
    plain curated content, not a database: no API/feed exists anywhere for
    either dataset, so this project maintains its own, edited directly in
    sharing/data/*.json and re-read live (no rebuild needed, just restart
    the container) rather than modeled as mutable rows in Postgres."""
    path = os.path.join(DATA_DIR, filename)
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


@app.get("/ferry-routes")
@limiter.limit(STATIC_LIMIT)
def get_ferry_routes(request: Request):
    return read_json_data("ferry_routes.json")


@app.get("/dive-sites")
@limiter.limit(STATIC_LIMIT)
def get_dive_sites(request: Request):
    return read_json_data("dive_sites.json")


@app.get("/seasonal-highlights")
@limiter.limit(STATIC_LIMIT)
def get_seasonal_highlights(request: Request):
    return read_json_data("seasonal_highlights.json")


@app.get("/border-crossings")
@limiter.limit(STATIC_LIMIT)
def get_border_crossings(request: Request):
    return read_json_data("border_crossings.json")


@app.get("/health")
def health():
    # Deliberately not rate-limited — a health check should never be the
    # thing that starts failing under load.
    return {"ok": True}
