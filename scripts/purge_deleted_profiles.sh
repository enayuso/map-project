#!/usr/bin/env bash
# Hard-deletes profiles rows that were soft-deleted (DELETE /profile in
# sharing/app/main.py) more than 30 days ago — the second stage of the
# two-stage account-deletion design researched from the reference system's own
# withdraw()/UserPurgeScheduler (see mobile/README.md's Profile section).
#
# By the time a row gets here it's already unreachable and stripped of every
# auth field (apple_user_id/email/password_hash all NULL, every session and
# pending verification code already gone — see delete_profile's own comment)
# — this script exists purely so a deleted account doesn't linger in the
# database forever, not for correctness of anything user-facing.
#
# 30 days is the one place this number is defined — deliberately not
# mirrored as a constant in main.py, so there's a single source of truth
# instead of two files that could drift. It matches the reference system's own figure,
# kept for its own UX/safety-net merits (a short window to recover from an
# accidental or coerced deletion) rather than because Belize's Data
# Protection Act, 2021 (Act No. 45 of 2021) requires it specifically — that
# Act's own erasure right just says "without undue delay," with no numeric
# figure attached, unlike Korea's PIPA (which is where the reference system's 30 days
# actually comes from).
#
# Hardcoded directly in the query below, not an env-var override — an
# earlier version made this configurable via a GRACE_PERIOD_DAYS env var,
# but nothing in this project ever actually set it (grepped: no
# docker-compose entry, no CI step, no doc), and interpolating an
# unvalidated external value straight into a SQL string turned out to be a
# real SQL-injection hole (a value containing a stray `'` breaks out of the
# INTERVAL literal and appends arbitrary SQL, which `psql -c` — unlike every
# psycopg2 call in main.py — has no parameter binding to stop) as well as a
# silent grace-period-defeating footgun (0 or a negative value purges
# everything immediately with no error). A speculative knob nothing used,
# fixed the simple way: delete it, and match cleanup_expired_shares.sh's own
# sibling precedent of just hardcoding the interval literal.
#
# No purged_date/distributed-lock bookkeeping like the reference system's
# UserPurgeScheduler — that exists to stop multiple concurrent app-server
# instances from double-processing the same batch, which doesn't apply to
# this project's single-instance deployment. A plain DELETE is already
# idempotent (a row already gone is just zero rows affected), matching this
# project's existing scripts/cleanup_expired_shares.sh precedent for "a
# script that purges expired rows" — run occasionally (a cron job, or by
# hand), not required for correctness of anything else in the service.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"$ROOT_DIR/scripts/db_exec.sh" psql -c "
DELETE FROM profiles WHERE deleted_at IS NOT NULL AND deleted_at < now() - INTERVAL '30 days';
"
