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
# the email_verification_codes table below. One pending code per profile,
# with a real security model researched from a production reference
# (the reference system's own magic-link/code system, see mobile/README.md's Profile
# section for the full writeup) rather than invented from scratch:
# - attempts: wrong guesses against *this* code — capped, and the code is
#   discarded once exceeded (see main.py's MAX_VERIFY_ATTEMPTS).
# - send_count/last_sent_at: how many times *this* code has been emailed
#   and when — caps resend spam (MAX_CODE_SENDS) and enforces a cooldown
#   between resends (CODE_RESEND_COOLDOWN), independent of `attempts`.
#   A resend of a still-valid code reuses the SAME code and does NOT touch
#   `attempts` — regenerating the code (and resetting attempts) on every
#   resend, which is what an earlier version of this table did, is exactly
#   the loophole a resend-then-retry loop would use to bypass the
#   per-code attempts cap entirely.
# - window_started_at/window_attempts: a *second*, independent budget on
#   wrong guesses — cumulative per email over a rolling time window
#   (main.py's EMAIL_CODE_ATTEMPT_WINDOW/EMAIL_CODE_ATTEMPT_BUDGET), which
#   deliberately does NOT reset when attempts/the code itself does. This
#   is what actually closes the loophole above at the root: even a
#   genuinely fresh code (after real expiry) can't reset how many wrong
#   guesses this email has spent recently — only the wall clock can.
#
# No avatar-image column on purpose: v1 profile customization is a
# nickname plus a pick from a small fixed set of Belize-themed emoji
# avatars, not an uploaded photo — see mobile/README.md's Profile section
# for the reasoning.
#
# Account deletion (added 2026-09-15, researched from a real production system's
# withdraw()/UserPurgeScheduler — see mobile/README.md's Profile section)
# is a two-stage soft delete, not an immediate DELETE:
# - DELETE /profile sets deleted_at and immediately anonymizes every auth
#   field (apple_user_id, email, password_hash all set NULL) plus kills
#   every session for that profile in the same transaction — a deleted
#   account is unreachable right away, not just eventually.
# - Postgres, unlike a naive UNIQUE index, does NOT treat two NULLs as
#   equal for uniqueness purposes — so nulling email/apple_user_id here is
#   enough on its own to free that email or Apple ID for a brand-new
#   signup immediately, with no reference-style tombstone value
#   ("deleted+id@removed...") needed to dodge the UNIQUE constraint. This
#   is a real, deliberate simplification versus the reference system (which keeps a
#   SHA-256 emailHash for admin/fraud-detection tooling this hobby project
#   has none of, and needs the tombstone specifically to satisfy MySQL's
#   own UNIQUE-with-NULLs behavior, which differs from Postgres's) —
#   scaled down for what this project actually has, not a missed detail.
# - nickname/avatar_emoji are deliberately left untouched on deletion,
#   unlike the reference system nulling its equivalent name/phone fields — this app
#   never asks for a real name anywhere (see generate_default_nickname's
#   own comment), so the nickname was never PII to begin with; scrubbing
#   it would just be busywork with no privacy benefit.
# - profiles_has_an_auth_method is a genuine two-way invariant, not a
#   one-directional escape hatch (fixed 2026-09-15, same day, after a
#   code-review pass caught the original version only checking that
#   deleted_at was set, never that the auth fields were actually NULL — a
#   row with deleted_at set AND a still-live email/password_hash would
#   have passed the original CHECK trivially via its other OR-branch,
#   silently permanently blocking that email from reuse and letting
#   purge_deleted_profiles.sh eventually hard-delete a row whose
#   credentials were never actually anonymized). Now a profile is either
#   live-with-an-auth-method (deleted_at IS NULL) or fully-anonymized
#   (deleted_at IS NOT NULL AND every auth field NULL) — nothing in
#   between can ever be inserted or updated into existence, enforced by
#   Postgres itself rather than by trusting delete_profile's application
#   code to always null every field correctly.
# - The 30-day grace period (scripts/purge_deleted_profiles.sh actually
#   hard-deletes) isn't legally mandated for Belize specifically — Belize's
#   own Data Protection Act, 2021 (Act No. 45 of 2021) requires erasure
#   "without undue delay" once data's no longer needed, with no numeric
#   figure attached, unlike Korea's PIPA (which is where the reference system's own
#   30-day figure actually comes from). 30 days here is simply "the same
#   reference-system number, kept for its own UX/safety-net merits" (a brief window
#   to recover from an accidental or coerced deletion before data is
#   actually gone) — not a claim that Belizean law requires it.
# - No purged_date/distributed-lock machinery like the reference system's
#   UserPurgeScheduler: that exists to stop multiple concurrent app-server
#   instances from double-processing the same purge batch, which doesn't
#   apply to this project's single-instance deployment — a plain DELETE
#   past the grace period (scripts/purge_deleted_profiles.sh) is already
#   idempotent (deleting an already-gone row is a no-op) and needs no
#   extra bookkeeping column, matching this project's existing
#   scripts/cleanup_expired_shares.sh precedent for "a script that purges
#   expired rows."
#
# terms_accepted_at/terms_version (added 2026-09-16, see docs/research/
# 15-belize-legal-compliance-audit.md's own action item #1): every new
# profile now records when, and against which version of, the Terms of
# Service + Privacy Policy (sharing/data/terms_of_service.html and
# privacy_policy.html, served by main.py's own GET endpoints) the user
# agreed to at signup — main.py's SignupBody/AppleSignInBody both reject
# a request that doesn't confirm acceptance (see _require_terms_
# accepted), and TERMS_VERSION is the single source of truth for the
# current version string. Both NOT NULL and never touched by
# delete_profile's soft-delete (unlike apple_user_id/email/password_hash)
# — this is a historical consent record, not an auth credential, and
# stays intact for the same evidence-readiness reason the Electronic
# Transactions Act's own logic calls for (proving *which* version of the
# agreement someone actually accepted, not just that a checkbox existed
# at signup). No re-confirmation flow exists yet for existing users if
# this version ever changes — a real, acknowledged gap, not an oversight;
# out of scope until it's actually needed, since this is the version's
# first value.
#
# NOTE (re-run from scratch, 2026-09-16, same as every prior pass):
# confirmed zero real rows existed in any of these tables before this
# change (or the email_verified/deleted_at ones before it) — no Apple
# sign-in has completed past the paid-account wall, and the only
# email/password rows ever created were this session's own
# live-tested-then-deleted test accounts — dropping and recreating, not a
# migration, since there was nothing real to migrate.
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
  deleted_at TIMESTAMPTZ,
  terms_accepted_at TIMESTAMPTZ NOT NULL,
  terms_version TEXT NOT NULL,
  CONSTRAINT profiles_has_an_auth_method CHECK (
    (deleted_at IS NULL AND (apple_user_id IS NOT NULL OR (email IS NOT NULL AND password_hash IS NOT NULL)))
    OR
    (deleted_at IS NOT NULL AND apple_user_id IS NULL AND email IS NULL AND password_hash IS NULL)
  )
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
  attempts INTEGER NOT NULL DEFAULT 0,
  send_count INTEGER NOT NULL DEFAULT 1,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  window_attempts INTEGER NOT NULL DEFAULT 0
);
"

echo "profiles + profile_sessions + email_verification_codes tables ready."
