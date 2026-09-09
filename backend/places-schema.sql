-- Phase 3 Track B: the canonical `places` table — see docs/PLAN.md Phase 3.
-- The single source of truth for POI/business data going forward: seeded
-- once from OSM (scripts/seed_places_from_osm.sh), then diverging as our
-- own edits/additions accumulate. Typesense's search index becomes a
-- rebuildable CACHE of this table (scripts/reindex_pois.sh), not of raw
-- OSM directly — so edits/additions survive a reindex instead of being
-- silently overwritten by the next OSM import.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS places (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  osm_id               bigint,                 -- set only for OSM-seeded rows; NULL for app-created ones
  name                 text NOT NULL,
  category             text NOT NULL DEFAULT 'other',
  geom                 geometry(Point, 4326) NOT NULL,
  address_text         text,                   -- structured address, when one exists
  address_description  text,                   -- informal/landmark-based ("across from the Texaco")
  phone                text,
  hours                text,
  website              text,
  verification_status  text NOT NULL DEFAULT 'osm_import'
                         CHECK (verification_status IN ('osm_import', 'field_verified', 'self_registered', 'crowd_suggested')),
  source               text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           text
);

CREATE INDEX IF NOT EXISTS places_geom_idx ON places USING GIST (geom);
-- pg_trgm name-similarity index, ahead of Phase 3 item 7 (dedup pass) — cheap
-- to add now, no reason to wait for a separate migration later.
CREATE INDEX IF NOT EXISTS places_name_trgm_idx ON places USING GIN (name gin_trgm_ops);
-- Unique (not just indexed) so re-running the OSM seed script can safely
-- upsert (PostgREST's on_conflict=osm_id) instead of creating duplicate
-- rows. Not partial: standard SQL never treats NULLs as equal in a unique
-- index, so app-created places (osm_id NULL) stay unrestricted for free —
-- a partial WHERE clause here would also break PostgREST's on_conflict
-- upsert, which can't target a partial index's arbiter.
CREATE UNIQUE INDEX IF NOT EXISTS places_osm_id_unique_idx ON places (osm_id);

-- Keep updated_at accurate without relying on every writer (including
-- PostgREST's raw REST clients) to remember to set it.
CREATE OR REPLACE FUNCTION set_places_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS places_set_updated_at ON places;
CREATE TRIGGER places_set_updated_at
  BEFORE UPDATE ON places
  FOR EACH ROW EXECUTE FUNCTION set_places_updated_at();

-- --- PostgREST exposure ---
-- A dedicated `api` schema, not `public` — PostgREST auto-exposes every
-- table/view its connecting role can see in its configured schema, and
-- `public` already holds planet_osm_*/water_polygons (read-only OSM
-- reference data that has no business being writable-via-REST). Exposing
-- just a view here keeps that separation explicit and cheap.
CREATE SCHEMA IF NOT EXISTS api;
CREATE OR REPLACE VIEW api.places AS SELECT * FROM public.places;

-- A dedicated, least-privilege LOGIN role for PostgREST to connect as —
-- scoped to only what's actually needed (this view, this schema), not the
-- shared `belize` owner role every other service uses. No JWT/auth yet
-- (every request runs as this one role) — matches this project's existing
-- local-only dev security posture (Typesense/Nominatim/Valhalla are
-- equally open on 127.0.0.1 today), but real per-request auth MUST be
-- added before this is ever reachable by the public (Phase 3 items 5+ —
-- self-registration/crowdsourcing), not before.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'places_api') THEN
    CREATE ROLE places_api LOGIN PASSWORD 'placesapi_dev_local_only';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA api TO places_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON api.places TO places_api;
