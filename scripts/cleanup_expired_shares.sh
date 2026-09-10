#!/usr/bin/env bash
# Deletes location_shares rows past their expires_at. The API itself already
# treats expired rows as "not found" on every read/write, so this is purely
# housekeeping (keeping the table from growing unbounded) — not required for
# correctness, safe to run occasionally (a cron job, or just by hand).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"$ROOT_DIR/scripts/db_exec.sh" psql -c "
DELETE FROM location_shares WHERE expires_at < now();
"
