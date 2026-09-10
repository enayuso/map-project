#!/usr/bin/env bash
# One-time schema setup for sharing/'s shared saved-place lists (Naver-style
# named/shareable favorites folders). Safe to re-run — CREATE TABLE IF NOT
# EXISTS. No expiry column, unlike location_shares — shared lists persist
# until their owner explicitly deletes them.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"$ROOT_DIR/scripts/db_exec.sh" psql -c "
CREATE TABLE IF NOT EXISTS shared_lists (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  places_json TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
"

echo "shared_lists table ready."
