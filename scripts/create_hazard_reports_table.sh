#!/usr/bin/env bash
# One-time schema setup for sharing/'s crowdsourced road hazard reports
# (flooding, washouts, checkpoints, etc — Waze's core idea, and per
# docs/research/10-remaining-feature-gaps.md a genuinely undocumented-
# anywhere-digital gap for Belize's rainy-season roads). Safe to re-run —
# CREATE TABLE IF NOT EXISTS.
#
# No user accounts, same trust model as location_shares/shared_lists: a
# report gets a random delete_token back, known only to its reporter,
# needed to retract it early (e.g. a mis-tap) — nobody else can delete it,
# but nobody needs an account to create one either.
#
# expires_at is a sliding TTL, same idea as location_shares: each "still
# here" confirmation from another user pushes it forward again, so an
# actively-relevant hazard (a flood that's still there) stays visible
# without the original reporter having to do anything, while a stale one
# (checkpoint long gone) ages out on its own. See scripts/
# cleanup_expired_shares.sh's pattern — a cleanup_expired_hazard_reports.sh
# companion still needs to actually DELETE expired rows; this script only
# creates the table.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"$ROOT_DIR/scripts/db_exec.sh" psql -c "
CREATE TABLE IF NOT EXISTS hazard_reports (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  note TEXT,
  delete_token TEXT NOT NULL,
  confirm_count INTEGER NOT NULL DEFAULT 0,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS hazard_reports_bbox_idx ON hazard_reports (lat, lon);
CREATE INDEX IF NOT EXISTS hazard_reports_expires_idx ON hazard_reports (expires_at);
"

echo "hazard_reports table ready."
