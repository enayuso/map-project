#!/usr/bin/env bash
# Schema setup for sharing/'s user-profile feature (see
# docs/research/14-naver-kakao-profile-systems.md for the research this is
# built from). Safe to re-run — CREATE TABLE/INDEX IF NOT EXISTS.
#
# Two auth methods share one `profiles` table, both optional per row:
# - apple_user_id (Sign in with Apple's own stable per-app identifier) —
#   built first, but needs the paid Apple Developer Program to actually
#   enable the capability (a real recurring cost, per Locked Decision 3),
#   so it's not usable yet on a free account.
# - email + password_hash (this app's own account system, added 2026-09-15
#   specifically so profiles work without that paid account) — no third-
#   party login involved, so it doesn't trigger App Store Review Guideline
#   4.8's "must also offer Sign in with Apple" rule the way a Google/
#   Facebook login would; that rule only applies to third-party/social
#   logins, not an app's own first-party email/password system.
# A profile is keyed by its own internal `id` (not by either auth method
# directly) precisely so it can support either method — or, later, both at
# once for the same person — without a schema change. profile_sessions is
# a plain bearer-token table, same "random secret is the whole access
# model" pattern as every other table in this service.
#
# email_verified defaults TRUE — correct for an Apple sign-in (no email to
# verify at all) and explicitly overridden to FALSE by /auth/signup for a
# fresh email/password account, which is the only path that actually needs
# the email_verification_codes table below. One pending code per profile
# (a resend just overwrites it — a fresh code should always invalidate the
# last one, not create a second live one) with its own expiry and an
# attempts counter (caps guesses against a 6-digit code within its
# lifetime, on top of the endpoint's own rate limit).
#
# No avatar-image column on purpose: v1 profile customization is a
# nickname plus a pick from a small fixed set of Belize-themed emoji
# avatars, not an uploaded photo — see mobile/README.md's Profile section
# for the reasoning.
#
# NOTE (re-run from scratch, 2026-09-15): confirmed zero real rows existed
# in any of these tables before adding email_verified/
# email_verification_codes (no Apple sign-in has completed past the paid-
# account wall, and the only email/password rows ever created were this
# session's own live-tested-then-deleted test account) — dropping and
# recreating, not a migration, since there was nothing real to migrate.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"$ROOT_DIR/scripts/db_exec.sh" psql -c "
DROP TABLE IF EXISTS email_verification_codes;
DROP TABLE IF EXISTS profile_sessions;
DROP TABLE IF EXISTS profiles;
CREATE TABLE profiles (
  id TEXT PRIMARY KEY,
  apple_user_id TEXT UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT,
  email_verified BOOLEAN NOT NULL DEFAULT TRUE,
  nickname TEXT NOT NULL,
  avatar_emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT profiles_has_an_auth_method CHECK (apple_user_id IS NOT NULL OR (email IS NOT NULL AND password_hash IS NOT NULL))
);
CREATE TABLE profile_sessions (
  token TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX profile_sessions_profile_id_idx ON profile_sessions (profile_id);
CREATE TABLE email_verification_codes (
  profile_id TEXT PRIMARY KEY REFERENCES profiles (id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);
"

echo "profiles + profile_sessions + email_verification_codes tables ready."
