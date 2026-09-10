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


@app.get("/health")
def health():
    return {"ok": True}
