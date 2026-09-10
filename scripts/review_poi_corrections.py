#!/usr/bin/env python3
"""
Human-moderator side of the Tier 2 crowd-sourced POI correction flow — see
docs/research/11-kakao-naver-poi-data-sourcing.md for why this is a
moderation queue, not a live write, mirroring Kakao/Naver's own model:
anyone can submit a correction (mobile/src/poi-corrections/), but nothing
touches the real `pois` Typesense index until a human approves it here.

Deliberately a local admin script, not an HTTP endpoint on sharing/'s
otherwise-public API: approving a correction MUTATES public POI data, and
that service is wide-open-CORS/no-auth by design (same as everything else
in it, see its own header comment) — fine for a mobile client only ever
submitting/reading, not fine for an unauthenticated "apply this edit"
action. Run via the sharing/ container, which already has psycopg2 and
network access to both postgis and typesense (see sharing/docker-
compose.yml's scripts/ volume mount):

    docker exec -it belize-sharing python3 /scripts/review_poi_corrections.py list
    docker exec -it belize-sharing python3 /scripts/review_poi_corrections.py show 3
    docker exec -it belize-sharing python3 /scripts/review_poi_corrections.py approve 3
    docker exec -it belize-sharing python3 /scripts/review_poi_corrections.py reject 3 "duplicate of #2"

Only `name` and `category` corrections are auto-applied to Typesense on
approve (both are simple, safe field patches). `closed` and `other` are
marked reviewed but never auto-delete or auto-edit anything — removing a
POI outright is a bigger, less reversible action than this tool takes
lightly; approving one just prints the exact command to run if the
operator agrees after reading it themselves.
"""

import json
import os
import sys
import urllib.error
import urllib.request

import psycopg2
import psycopg2.extras

DB_HOST = os.environ.get("DB_HOST", "postgis")
DB_NAME = os.environ.get("DB_NAME", "belize")
DB_USER = os.environ.get("DB_USER", "belize")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "devpass123")

TYPESENSE_URL = os.environ.get("TYPESENSE_URL", "http://typesense:8108")
TYPESENSE_API_KEY = "typesense_dev_local_only"

AUTO_APPLIED_FIELDS = {"name", "category"}


def get_conn():
    return psycopg2.connect(host=DB_HOST, dbname=DB_NAME, user=DB_USER, password=DB_PASSWORD)


def typesense_patch(poi_id: str, patch: dict):
    data = json.dumps(patch).encode()
    req = urllib.request.Request(
        f"{TYPESENSE_URL}/collections/pois/documents/{poi_id}",
        data=data,
        method="PATCH",
        headers={"X-TYPESENSE-API-KEY": TYPESENSE_API_KEY, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as res:
        return json.loads(res.read())


def fetch_one(cur, correction_id: int):
    cur.execute("SELECT * FROM poi_corrections WHERE id = %s", (correction_id,))
    return cur.fetchone()


def cmd_list(args):
    status = args[0] if args else "pending"
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT id, poi_id, poi_name, field, current_value, suggested_value, note, submitted_at "
                "FROM poi_corrections WHERE status = %s ORDER BY submitted_at ASC",
                (status,),
            )
            rows = cur.fetchall()
    finally:
        conn.close()

    if not rows:
        print(f"No {status} corrections.")
        return
    for r in rows:
        print(f"#{r['id']:<4} [{r['field']:<8}] {r['poi_name']!r}  ({r['poi_id']})  submitted {r['submitted_at']}")
        if r["current_value"] or r["suggested_value"]:
            print(f"       {r['current_value']!r} -> {r['suggested_value']!r}")
        if r["note"]:
            print(f"       note: {r['note']}")


def cmd_show(args):
    if not args:
        print("Usage: show <id>")
        return
    correction_id = int(args[0])
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            row = fetch_one(cur, correction_id)
    finally:
        conn.close()
    if not row:
        print(f"No correction #{correction_id}.")
        return
    for key, value in row.items():
        print(f"{key:>16}: {value}")


def cmd_approve(args):
    if not args:
        print("Usage: approve <id>")
        return
    correction_id = int(args[0])
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            row = fetch_one(cur, correction_id)
            if not row:
                print(f"No correction #{correction_id}.")
                return
            if row["status"] != "pending":
                print(f"Correction #{correction_id} is already {row['status']!r}.")
                return

            if row["field"] in AUTO_APPLIED_FIELDS:
                try:
                    typesense_patch(row["poi_id"], {row["field"]: row["suggested_value"]})
                    print(f"Applied: {row['field']} -> {row['suggested_value']!r} on POI {row['poi_id']}")
                except urllib.error.HTTPError as e:
                    print(f"Typesense patch failed ({e.code}): {e.read().decode()} — NOT marking approved.")
                    return
            else:
                print(
                    f"Marked reviewed. '{row['field']}' reports don't auto-apply — read the note yourself, "
                    f"and if you agree the POI should go, delete it directly:\n"
                    f"  curl -X DELETE {TYPESENSE_URL}/collections/pois/documents/{row['poi_id']} "
                    f"-H 'X-TYPESENSE-API-KEY: {TYPESENSE_API_KEY}'"
                )

            with conn, conn.cursor() as cur2:
                cur2.execute(
                    "UPDATE poi_corrections SET status='approved', reviewed_at=now() WHERE id=%s",
                    (correction_id,),
                )
    finally:
        conn.close()


def cmd_reject(args):
    if not args:
        print("Usage: reject <id> [note]")
        return
    correction_id = int(args[0])
    conn = get_conn()
    try:
        with conn, conn.cursor() as cur:
            cur.execute(
                "UPDATE poi_corrections SET status='rejected', reviewed_at=now() WHERE id=%s AND status='pending'",
                (correction_id,),
            )
            if cur.rowcount == 0:
                print(f"No pending correction #{correction_id}.")
                return
        print(f"Rejected #{correction_id}.")
    finally:
        conn.close()


COMMANDS = {"list": cmd_list, "show": cmd_show, "approve": cmd_approve, "reject": cmd_reject}


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        print(__doc__)
        sys.exit(1)
    COMMANDS[sys.argv[1]](sys.argv[2:])


if __name__ == "__main__":
    main()
