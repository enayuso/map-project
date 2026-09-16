#!/usr/bin/env python3
"""
Human-moderator side of hazard-report content flagging — see
docs/research/15-belize-legal-compliance-audit.md's UGC-moderation action
item and sharing/README.md's own follow-up for the full Tmap/Kakao/Naver
comparison this is scaled down from: hazard reports (unlike poi_corrections)
go live immediately with no pre-moderation, since safety-relevant info needs
to be visible right away — POST /hazards/{id}/report just flags one for a
human to look at afterward, it never auto-hides or auto-deletes anything.

Originally a local-only admin script — same reasoning as
review_poi_corrections.py's own header comment (deleting someone's hazard
report is a real, semi-irreversible mutation, and sharing/'s API is
wide-open-CORS/no-auth by design). As of 2026-09-16 there's also a
token-gated web equivalent (GET /admin on the sharing/ service, see
main.py's require_admin/admin_dismiss_hazard_report/
admin_remove_hazard_report) — this script still works unmodified, useful
over SSH or for scripting. Run via the sharing/ container, which already
has psycopg2 and network access to postgis (see sharing/docker-
compose.yml's scripts/ volume mount):

    docker exec -it belize-sharing python3 /scripts/review_hazard_reports.py list
    docker exec -it belize-sharing python3 /scripts/review_hazard_reports.py show 3
    docker exec -it belize-sharing python3 /scripts/review_hazard_reports.py dismiss 3
    docker exec -it belize-sharing python3 /scripts/review_hazard_reports.py remove 3

`list` shows every non-expired report with report_count > 0, worst-first —
that's the whole queue, there's no separate pending/approved/rejected status
column the way poi_corrections has, since "flagged or not" is the only state
that matters here. `dismiss` clears report_count/last_report_reason on a
report you looked at and decided was fine (e.g. a legitimate hazard someone
tried to grief off the map) — it stays live, untouched otherwise. `remove`
hard-deletes it outright — no delete_token needed, this is the admin
equivalent of the reporter's own retract action.
"""

import os
import sys

import psycopg2
import psycopg2.extras

DB_HOST = os.environ.get("DB_HOST", "postgis")
DB_NAME = os.environ.get("DB_NAME", "belize")
DB_USER = os.environ.get("DB_USER", "belize")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "devpass123")


def get_conn():
    return psycopg2.connect(host=DB_HOST, dbname=DB_NAME, user=DB_USER, password=DB_PASSWORD)


def fetch_one(cur, hazard_id: int):
    cur.execute("SELECT * FROM hazard_reports WHERE id = %s", (hazard_id,))
    return cur.fetchone()


def cmd_list(args):
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT id, type, note, report_count, last_report_reason, reported_at, expires_at "
                "FROM hazard_reports WHERE report_count > 0 AND expires_at > now() "
                "ORDER BY report_count DESC, reported_at ASC"
            )
            rows = cur.fetchall()
    finally:
        conn.close()

    if not rows:
        print("No flagged (and still-live) hazard reports.")
        return
    for r in rows:
        print(
            f"#{r['id']:<4} [{r['type']:<10}] reports={r['report_count']:<3} "
            f"last_reason={r['last_report_reason']!r:<16} reported {r['reported_at']}"
        )
        if r["note"]:
            print(f"       note: {r['note']}")


def cmd_show(args):
    if not args:
        print("Usage: show <id>")
        return
    hazard_id = int(args[0])
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            row = fetch_one(cur, hazard_id)
    finally:
        conn.close()
    if not row:
        print(f"No hazard report #{hazard_id}.")
        return
    for key, value in row.items():
        print(f"{key:>20}: {value}")


def cmd_dismiss(args):
    if not args:
        print("Usage: dismiss <id>")
        return
    hazard_id = int(args[0])
    conn = get_conn()
    try:
        with conn, conn.cursor() as cur:
            cur.execute(
                "UPDATE hazard_reports SET report_count = 0, last_report_reason = NULL WHERE id = %s",
                (hazard_id,),
            )
            if cur.rowcount == 0:
                print(f"No hazard report #{hazard_id}.")
                return
        print(f"Dismissed the flag(s) on #{hazard_id} — report stays live, untouched otherwise.")
    finally:
        conn.close()


def cmd_remove(args):
    if not args:
        print("Usage: remove <id>")
        return
    hazard_id = int(args[0])
    conn = get_conn()
    try:
        with conn, conn.cursor() as cur:
            cur.execute("DELETE FROM hazard_reports WHERE id = %s", (hazard_id,))
            if cur.rowcount == 0:
                print(f"No hazard report #{hazard_id}.")
                return
        print(f"Removed #{hazard_id}.")
    finally:
        conn.close()


COMMANDS = {"list": cmd_list, "show": cmd_show, "dismiss": cmd_dismiss, "remove": cmd_remove}


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        print(__doc__)
        sys.exit(1)
    COMMANDS[sys.argv[1]](sys.argv[2:])


if __name__ == "__main__":
    main()
