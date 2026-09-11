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
"""

import json
import os
import secrets
import string
from datetime import datetime, timedelta, timezone
from typing import Literal

import psycopg2
import psycopg2.errors
import psycopg2.extras
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
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
            cur.execute(
                "UPDATE hazard_reports SET "
                "expires_at = LEAST(reported_at + %s, GREATEST(expires_at, %s) + %s), "
                "confirm_count = confirm_count + 1 "
                "WHERE id = %s AND expires_at > %s",
                (MAX_HAZARD_AGE, now, CONFIRM_BUMP, hazard_id, now),
            )
            if cur.rowcount == 0:
                raise HTTPException(404, "Report not found or expired")
            cur.execute("SELECT expires_at FROM hazard_reports WHERE id = %s", (hazard_id,))
            expires_at = cur.fetchone()[0]
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


@app.get("/border-crossings")
@limiter.limit(STATIC_LIMIT)
def get_border_crossings(request: Request):
    return read_json_data("border_crossings.json")


@app.get("/health")
def health():
    # Deliberately not rate-limited — a health check should never be the
    # thing that starts failing under load.
    return {"ok": True}
