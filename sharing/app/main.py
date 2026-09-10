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
import random
import string
from datetime import datetime, timedelta, timezone

import psycopg2
import psycopg2.errors
import psycopg2.extras
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

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


def get_conn():
    return psycopg2.connect(host=DB_HOST, dbname=DB_NAME, user=DB_USER, password=DB_PASSWORD)


def generate_code() -> str:
    return "".join(random.choices(CODE_ALPHABET, k=CODE_LENGTH))


class CreateShareBody(BaseModel):
    lat: float
    lon: float
    label: str | None = Field(default=None, max_length=80)


class UpdateShareBody(BaseModel):
    lat: float
    lon: float


@app.post("/shares")
def create_share(body: CreateShareBody):
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
def update_share(code: str, body: UpdateShareBody):
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
def get_share(code: str):
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
def delete_share(code: str):
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
    id: str
    name: str
    subtitle: str
    lat: float
    lon: float


class CreateListBody(BaseModel):
    label: str = Field(max_length=80)
    places: list[ListPlace]


class UpdateListBody(BaseModel):
    label: str = Field(max_length=80)
    places: list[ListPlace]


@app.post("/lists")
def create_list(body: CreateListBody):
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
def update_list(code: str, body: UpdateListBody):
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
def get_list(code: str):
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
def delete_list(code: str):
    conn = get_conn()
    try:
        with conn, conn.cursor() as cur:
            cur.execute("DELETE FROM shared_lists WHERE code=%s", (code,))
        return {"ok": True}
    finally:
        conn.close()


class ReportHazardBody(BaseModel):
    type: str
    lat: float
    lon: float
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
    return "".join(random.choices(string.ascii_letters + string.digits, k=24))


@app.post("/hazards")
def report_hazard(body: ReportHazardBody):
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


@app.get("/hazards")
def list_hazards(min_lat: float, max_lat: float, min_lon: float, max_lon: float):
    """Bbox query, same shape as the mobile client already computes for
    offline-pack downloads (mapRef.getBounds()) — no PostGIS geography type
    needed at this scale, a plain lat/lon range is exact enough for a bbox
    filter and keeps this service's schema as simple as location_shares'."""
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
def confirm_hazard(hazard_id: int):
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
def delete_hazard(hazard_id: int, delete_token: str):
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


@app.get("/health")
def health():
    return {"ok": True}
