#!/usr/bin/env bash
# One-time schema setup for sharing/ (Phase 4.5 live location sharing).
# Safe to re-run — CREATE TABLE/INDEX IF NOT EXISTS.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"$ROOT_DIR/scripts/db_exec.sh" psql -c "
CREATE TABLE IF NOT EXISTS location_shares (
  code TEXT PRIMARY KEY,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS location_shares_expires_at_idx ON location_shares (expires_at);
"

echo "location_shares table ready."
