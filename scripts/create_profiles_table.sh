#!/usr/bin/env bash
# One-time schema setup for sharing/'s user-profile feature (see
# docs/research/14-naver-kakao-profile-systems.md for the research this is
# built from). Safe to re-run — CREATE TABLE/INDEX IF NOT EXISTS.
#
# Two tables, deliberately minimal — Sign in with Apple is the only auth
# method (see main.py's own header comment for why), so a profile is keyed
# directly by Apple's own stable per-app user identifier, not a separate
# internal id. profile_sessions is a plain bearer-token table: a session
# token maps to an apple_user_id, same "random secret is the whole access
# model" pattern as every other table in this service (location_shares,
# shared_lists), just for a per-device signed-in session instead of a
# shared code. ON DELETE CASCADE means deleting a profiles row (account
# deletion, required by App Store Guideline 5.1.1(v) since this app offers
# account creation) also signs out every device in one statement.
#
# No avatar-image column on purpose: v1 profile customization is a nickname
# plus a pick from a small fixed set of Belize-themed emoji avatars, not an
# uploaded photo — see mobile/README.md's Profile section for the reasoning
# (matches the research doc's own "start simple" conclusion; a real
# uploaded-photo avatar, with the bytea-vs-Cloudflare-R2 tradeoff the
# research doc already worked through, is a clean future addition to this
# same table, not a redesign).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"$ROOT_DIR/scripts/db_exec.sh" psql -c "
CREATE TABLE IF NOT EXISTS profiles (
  apple_user_id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL,
  avatar_emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS profile_sessions (
  token TEXT PRIMARY KEY,
  apple_user_id TEXT NOT NULL REFERENCES profiles (apple_user_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS profile_sessions_apple_user_id_idx ON profile_sessions (apple_user_id);
"

echo "profiles + profile_sessions tables ready."
