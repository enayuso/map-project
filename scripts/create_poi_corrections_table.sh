#!/usr/bin/env bash
# One-time schema setup for sharing/'s POI correction queue — the Tier 2
# half of docs/research/11-kakao-naver-poi-data-sourcing.md's two-tier
# model (anyone can suggest a correction; nothing publishes automatically,
# a human reviews it first — see scripts/review_poi_corrections.py for the
# reviewer side). Safe to re-run — CREATE TABLE IF NOT EXISTS.
#
# Deliberately scoped to CORRECTIONS on existing POIs only, not suggesting
# brand-new places — this project has a standing decision to not build
# in-app place-adding (waiting on BNSDI), and corrections aren't that.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"$ROOT_DIR/scripts/db_exec.sh" psql -c "
CREATE TABLE IF NOT EXISTS poi_corrections (
  id SERIAL PRIMARY KEY,
  poi_id TEXT NOT NULL,
  poi_name TEXT NOT NULL,
  field TEXT NOT NULL,
  current_value TEXT,
  suggested_value TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS poi_corrections_status_idx ON poi_corrections (status);
"

echo "poi_corrections table ready."
