"""
Integration tests for main.py — run inside the sharing container against
the real dev Postgres, not mocks. Same reasoning as scripts/db_exec.sh's
own header comment: a direct Postgres connection from the *host* hits a
real Colima-networking bug on this dev machine, but the app (and now this
suite, importing and calling it in-process via FastAPI's TestClient)
connects from *inside* the Docker network the normal way and works fine.
This also matches how every other part of this project has been verified
all along — against the real running thing, not a mocked stand-in.

Run (mounted read-only into the container by docker-compose, no rebuild
needed after an edit — same pattern as scripts/review_poi_corrections.py):
    docker exec belize-sharing pip install -r requirements-dev.txt   # once
    docker exec belize-sharing pytest -v

Every test that creates a row deletes it again (or hits a code path that
never creates one) — this suite runs against the same shared dev database
main.py itself uses, not a scratch/test-only one, so it must not leave
junk behind for a person to find later.
"""

import uuid

import psycopg2
import pytest
from fastapi.testclient import TestClient

from main import app, get_conn

client = TestClient(app)

BELIZE_CITY = {"lat": 17.4995, "lon": -88.19}


@pytest.fixture(autouse=True)
def reset_rate_limits():
    # This suite fires many requests in a few seconds — reset the
    # limiter's own in-memory counters before every test so main.py's
    # real (deliberately tight) rate limits don't turn into test-suite
    # flakiness for anything other than the one test that means to
    # exercise them.
    app.state.limiter.reset()
    yield


class TestShares:
    def test_create_get_update_delete_cycle(self):
        resp = client.post("/shares", json={**BELIZE_CITY, "label": "pytest"})
        assert resp.status_code == 200
        body = resp.json()
        code = body["code"]
        assert len(code) == 6
        assert "expiresAt" in body

        got = client.get(f"/shares/{code}")
        assert got.status_code == 200
        assert got.json()["lat"] == BELIZE_CITY["lat"]
        assert got.json()["label"] == "pytest"

        moved = {"lat": 17.5, "lon": -88.2}
        assert client.put(f"/shares/{code}", json=moved).status_code == 200
        assert client.get(f"/shares/{code}").json()["lat"] == moved["lat"]

        assert client.delete(f"/shares/{code}").status_code == 200
        assert client.get(f"/shares/{code}").status_code == 404

    def test_get_unknown_code_404(self):
        assert client.get("/shares/ZZZZZZ").status_code == 404

    def test_update_unknown_code_404(self):
        resp = client.put("/shares/ZZZZZZ", json=BELIZE_CITY)
        assert resp.status_code == 404

    @pytest.mark.parametrize(
        "bad_body",
        [
            {"lat": 999, "lon": -88.2},  # lat out of range
            {"lat": 17.5, "lon": -999},  # lon out of range
            {"lat": "not-a-number", "lon": -88.2},
        ],
    )
    def test_rejects_invalid_coordinates(self, bad_body):
        assert client.post("/shares", json=bad_body).status_code == 422


class TestLists:
    def test_create_get_update_delete_cycle(self):
        places = [{"id": "p1", "name": "Test Place", "subtitle": "test", **BELIZE_CITY}]
        resp = client.post("/lists", json={"label": "My List", "places": places})
        assert resp.status_code == 200
        code = resp.json()["code"]

        got = client.get(f"/lists/{code}")
        assert got.status_code == 200
        assert got.json()["label"] == "My List"
        assert len(got.json()["places"]) == 1

        updated_places = places + [{"id": "p2", "name": "Second", "subtitle": "t2", **BELIZE_CITY}]
        upd = client.put(f"/lists/{code}", json={"label": "Renamed", "places": updated_places})
        assert upd.status_code == 200
        got2 = client.get(f"/lists/{code}")
        assert got2.json()["label"] == "Renamed"
        assert len(got2.json()["places"]) == 2

        assert client.delete(f"/lists/{code}").status_code == 200
        assert client.get(f"/lists/{code}").status_code == 404

    def test_update_unknown_code_404(self):
        resp = client.put("/lists/ZZZZZZ", json={"label": "x", "places": []})
        assert resp.status_code == 404

    def test_rejects_too_many_places(self):
        # MAX_LIST_PLACES is 200
        places = [{"id": f"p{i}", "name": "x", "subtitle": "y", **BELIZE_CITY} for i in range(201)]
        resp = client.post("/lists", json={"label": "big", "places": places})
        assert resp.status_code == 422


class TestHazards:
    def test_report_confirm_delete_cycle(self):
        resp = client.post("/hazards", json={"type": "flooding", **BELIZE_CITY, "note": "pytest"})
        assert resp.status_code == 200
        body = resp.json()
        hazard_id = body["id"]
        token = body["deleteToken"]
        assert len(token) == 24

        listing = client.get(
            "/hazards",
            params={"min_lat": 17, "max_lat": 18, "min_lon": -89, "max_lon": -88},
        )
        assert listing.status_code == 200
        assert any(h["id"] == hazard_id for h in listing.json()["hazards"])

        assert client.post(f"/hazards/{hazard_id}/confirm").status_code == 200

        wrong = client.delete(f"/hazards/{hazard_id}", params={"delete_token": "x" * 24})
        assert wrong.status_code == 404

        assert client.delete(f"/hazards/{hazard_id}", params={"delete_token": token}).status_code == 200

    def test_confirm_unknown_id_404(self):
        assert client.post("/hazards/999999999/confirm").status_code == 404

    def test_rejects_oversized_bbox(self):
        resp = client.get(
            "/hazards",
            params={"min_lat": -80, "max_lat": 80, "min_lon": -170, "max_lon": 170},
        )
        assert resp.status_code == 400

    def test_rejects_inverted_bbox(self):
        resp = client.get(
            "/hazards",
            params={"min_lat": 18, "max_lat": 17, "min_lon": -89, "max_lon": -88},
        )
        assert resp.status_code == 400

    def test_rejects_short_delete_token(self):
        resp = client.delete("/hazards/1", params={"delete_token": "short"})
        assert resp.status_code == 422


class TestPoiCorrections:
    def test_submit_and_list(self):
        resp = client.post(
            "/poi-corrections",
            json={"poi_id": "pytest-poi", "poi_name": "Pytest Place", "field": "closed", "note": "pytest"},
        )
        assert resp.status_code == 200
        correction_id = resp.json()["id"]

        listing = client.get("/poi-corrections", params={"status": "pending"})
        assert listing.status_code == 200
        assert any(c["id"] == correction_id for c in listing.json()["corrections"])
        # No DELETE endpoint exists for corrections (deliberately — approve/
        # reject only happens via scripts/review_poi_corrections.py, never
        # HTTP, see main.py's own comment on list_corrections). A `pending`
        # test row left behind is harmless noise for that script to skip
        # past, not a correctness problem, so there's nothing to clean up.

    def test_rejects_invalid_field(self):
        resp = client.post("/poi-corrections", json={"poi_id": "x", "poi_name": "y", "field": "bogus"})
        assert resp.status_code == 422

    def test_rejects_invalid_status_filter(self):
        assert client.get("/poi-corrections", params={"status": "bogus"}).status_code == 422


class TestStaticContent:
    @pytest.mark.parametrize("path", ["/ferry-routes", "/dive-sites", "/border-crossings", "/seasonal-highlights"])
    def test_returns_200(self, path):
        assert client.get(path).status_code == 200


class TestHealth:
    def test_health(self):
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}


def _auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _unique_email() -> str:
    # A fresh, collision-free address per test — profiles.email is
    # UNIQUE, and this suite runs against the same shared dev database
    # main.py itself uses (see this file's own module docstring).
    return f"pytest-{uuid.uuid4().hex[:12]}@example.com"


# Added after a 9-angle code-review pass on the profile/auth feature found
# it had zero automated coverage at all — every prior verification of
# signup/login/profile/deletion was manual curl sessions against the live
# container. These three classes are that first pass, not exhaustive
# coverage of every endpoint (Sign in with Apple isn't covered — it needs
# a real Apple-signed identity token, which nothing in this test
# environment can produce).
class TestAuth:
    def test_signup_returns_session_and_profile(self):
        email = _unique_email()
        resp = client.post("/auth/signup", json={"email": email, "password": "testpass123"})
        assert resp.status_code == 200
        body = resp.json()
        profile = body["profile"]
        assert profile["nickname"].startswith("Explorer ")
        assert profile["avatarEmoji"]
        assert profile["emailVerified"] is False
        assert "memberSince" in profile

        client.delete("/profile", headers=_auth_header(body["sessionToken"]))

    def test_signup_duplicate_email_409(self):
        email = _unique_email()
        first = client.post("/auth/signup", json={"email": email, "password": "testpass123"})
        assert first.status_code == 200

        dupe = client.post("/auth/signup", json={"email": email, "password": "otherpass456"})
        assert dupe.status_code == 409

        client.delete("/profile", headers=_auth_header(first.json()["sessionToken"]))

    def test_signup_too_short_password_422(self):
        assert client.post("/auth/signup", json={"email": _unique_email(), "password": "short"}).status_code == 422

    def test_signup_invalid_email_422(self):
        resp = client.post("/auth/signup", json={"email": "not-an-email", "password": "testpass123"})
        assert resp.status_code == 422

    def test_login_success(self):
        email = _unique_email()
        signup = client.post("/auth/signup", json={"email": email, "password": "testpass123"})

        login = client.post("/auth/login", json={"email": email, "password": "testpass123"})
        assert login.status_code == 200
        assert login.json()["profile"]["emailVerified"] is False

        client.delete("/profile", headers=_auth_header(signup.json()["sessionToken"]))

    def test_login_wrong_password_and_nonexistent_email_get_identical_401(self):
        email = _unique_email()
        signup = client.post("/auth/signup", json={"email": email, "password": "testpass123"})

        wrong_password = client.post("/auth/login", json={"email": email, "password": "wrongpass789"})
        nonexistent = client.post("/auth/login", json={"email": _unique_email(), "password": "whatever123"})
        assert wrong_password.status_code == 401
        assert nonexistent.status_code == 401
        # Same wording for both — a login attempt must not be usable to
        # enumerate registered emails one guess at a time (see log_in's
        # own comment in main.py).
        assert wrong_password.json()["detail"] == nonexistent.json()["detail"]

        client.delete("/profile", headers=_auth_header(signup.json()["sessionToken"]))


class TestProfile:
    def test_get_profile_requires_auth(self):
        assert client.get("/profile").status_code == 401
        assert client.get("/profile", headers=_auth_header("garbage-token")).status_code == 401

    def test_update_profile_nickname_and_avatar(self):
        signup = client.post("/auth/signup", json={"email": _unique_email(), "password": "testpass123"})
        token = signup.json()["sessionToken"]

        upd = client.put("/profile", json={"nickname": "  Sea Turtle  ", "avatarEmoji": "🐢"}, headers=_auth_header(token))
        assert upd.status_code == 200
        assert upd.json()["nickname"] == "Sea Turtle"  # whitespace trimmed
        assert upd.json()["avatarEmoji"] == "🐢"
        assert client.get("/profile", headers=_auth_header(token)).json()["nickname"] == "Sea Turtle"

        client.delete("/profile", headers=_auth_header(token))

    def test_update_profile_rejects_blank_nickname(self):
        signup = client.post("/auth/signup", json={"email": _unique_email(), "password": "testpass123"})
        token = signup.json()["sessionToken"]

        assert client.put("/profile", json={"nickname": "   "}, headers=_auth_header(token)).status_code == 422

        client.delete("/profile", headers=_auth_header(token))

    def test_update_profile_rejects_invalid_avatar(self):
        signup = client.post("/auth/signup", json={"email": _unique_email(), "password": "testpass123"})
        token = signup.json()["sessionToken"]

        assert client.put("/profile", json={"avatarEmoji": "🍕"}, headers=_auth_header(token)).status_code == 400

        client.delete("/profile", headers=_auth_header(token))

    def test_update_profile_requires_at_least_one_field(self):
        signup = client.post("/auth/signup", json={"email": _unique_email(), "password": "testpass123"})
        token = signup.json()["sessionToken"]

        assert client.put("/profile", json={}, headers=_auth_header(token)).status_code == 400

        client.delete("/profile", headers=_auth_header(token))

    def test_sign_out_is_idempotent_and_tolerant_of_missing_header(self):
        email = _unique_email()
        signup = client.post("/auth/signup", json={"email": email, "password": "testpass123"})
        token = signup.json()["sessionToken"]

        assert client.delete("/auth/session", headers=_auth_header(token)).json() == {"ok": True}
        # Same (now-dead) token again — signing out twice is never itself
        # an error.
        assert client.delete("/auth/session", headers=_auth_header(token)).json() == {"ok": True}
        # No header at all — also never an error.
        assert client.delete("/auth/session").json() == {"ok": True}

        # The session is dead but the profile row itself is still live —
        # clean it up via a fresh login rather than the now-unusable
        # original token.
        login = client.post("/auth/login", json={"email": email, "password": "testpass123"})
        client.delete("/profile", headers=_auth_header(login.json()["sessionToken"]))


class TestAccountDeletion:
    """DELETE /profile is a soft delete (see main.py's own delete_profile
    docstring and sharing/README.md's Account deletion follow-ups), so
    every test below that runs it leaves an anonymized, unreachable row
    behind rather than removing it outright — that's the intended
    end-state of the feature itself, not junk left over from a sloppy
    test (the freed email is immediately reusable, confirmed below, so
    it doesn't collide with anything either). scripts/purge_deleted_
    profiles.sh is what eventually clears these rows out for real, same
    as it would for a real user's deleted account."""

    def _profile_id_for_email(self, email: str) -> str:
        # No API response ever returns a profile's internal id (see
        # generate_profile_id's own comment in main.py — it's
        # deliberately never exposed to a client). Reaching into the DB
        # directly here is the only way to get at it, needed only by the
        # one test below that verifies something structurally impossible
        # to trigger through the public HTTP API alone.
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT id FROM profiles WHERE email = %s", (email,))
                return cur.fetchone()[0]
        finally:
            conn.close()

    def test_delete_kills_session_immediately(self):
        signup = client.post("/auth/signup", json={"email": _unique_email(), "password": "testpass123"})
        token = signup.json()["sessionToken"]

        assert client.delete("/profile", headers=_auth_header(token)).status_code == 200
        assert client.get("/profile", headers=_auth_header(token)).status_code == 401

    def test_delete_frees_email_for_immediate_reuse(self):
        email = _unique_email()
        first = client.post("/auth/signup", json={"email": email, "password": "testpass123"})
        client.delete("/profile", headers=_auth_header(first.json()["sessionToken"]))

        # Same email, brand-new signup, right away — no UniqueViolation,
        # no need to wait out the 30-day grace period (Postgres doesn't
        # treat two NULLs as equal, so the soft-deleted row's now-NULL
        # email doesn't block this — see create_profiles_table.sh).
        second = client.post("/auth/signup", json={"email": email, "password": "anotherpass456"})
        assert second.status_code == 200

        client.delete("/profile", headers=_auth_header(second.json()["sessionToken"]))

    def test_delete_twice_returns_401_not_error(self):
        signup = client.post("/auth/signup", json={"email": _unique_email(), "password": "testpass123"})
        token = signup.json()["sessionToken"]

        assert client.delete("/profile", headers=_auth_header(token)).status_code == 200
        # The same token again: its session is already gone, so this
        # fails safely at the auth layer (401) — a retried/double-tapped
        # delete request must never crash or corrupt anything.
        assert client.delete("/profile", headers=_auth_header(token)).status_code == 401

    def test_updated_at_bumps_alongside_deleted_at(self):
        email = _unique_email()
        signup = client.post("/auth/signup", json={"email": email, "password": "testpass123"})
        token = signup.json()["sessionToken"]
        profile_id = self._profile_id_for_email(email)

        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT created_at, updated_at FROM profiles WHERE id = %s", (profile_id,))
                created_at, updated_at_before = cur.fetchone()
                assert created_at == updated_at_before  # never edited yet

            assert client.delete("/profile", headers=_auth_header(token)).status_code == 200

            with conn.cursor() as cur:
                cur.execute("SELECT created_at, updated_at, deleted_at FROM profiles WHERE id = %s", (profile_id,))
                created_at2, updated_at_after, deleted_at = cur.fetchone()
                assert created_at2 == created_at  # untouched by the delete
                assert updated_at_after == deleted_at  # bumped together
                assert updated_at_after > updated_at_before
        finally:
            conn.close()

    def test_delete_is_idempotent_at_the_database_layer(self):
        # A second DELETE /profile call can never reach delete_profile's
        # body through the real HTTP API once the first has run (see
        # test_delete_twice_returns_401_not_error above) — sessions die
        # in the very same transaction as the soft-delete. The actual
        # race delete_profile's WHERE deleted_at IS NULL guard protects
        # against — two DEVICES racing a near-simultaneous delete before
        # either's session-cleanup commits — can't be reproduced
        # deterministically through a live HTTP race either. So this
        # verifies the guard directly at the SQL layer: re-run the exact
        # statement delete_profile uses, against an already-soft-deleted
        # row, and confirm it's refused (0 rows) rather than silently
        # resetting the grace-period clock.
        email = _unique_email()
        signup = client.post("/auth/signup", json={"email": email, "password": "testpass123"})
        token = signup.json()["sessionToken"]
        profile_id = self._profile_id_for_email(email)

        assert client.delete("/profile", headers=_auth_header(token)).status_code == 200

        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT deleted_at FROM profiles WHERE id = %s", (profile_id,))
                first_deleted_at = cur.fetchone()[0]

            with conn, conn.cursor() as cur:
                cur.execute(
                    "UPDATE profiles SET apple_user_id = NULL, email = NULL, password_hash = NULL, "
                    "deleted_at = now() + INTERVAL '1 hour', updated_at = now() + INTERVAL '1 hour' "
                    "WHERE id = %s AND deleted_at IS NULL",
                    (profile_id,),
                )
                assert cur.rowcount == 0

            with conn.cursor() as cur:
                cur.execute("SELECT deleted_at FROM profiles WHERE id = %s", (profile_id,))
                assert cur.fetchone()[0] == first_deleted_at
        finally:
            conn.close()

    def test_check_constraint_rejects_deleted_row_with_live_credentials(self):
        # profiles_has_an_auth_method must be a genuine two-way
        # invariant (see create_profiles_table.sh's own comment): a row
        # can never have deleted_at set while still holding a live
        # email/password_hash/apple_user_id. Verified directly against
        # the schema, not just delete_profile's own (trusted)
        # application code — this is exactly the gap a code-review pass
        # found in the original one-directional version of this
        # constraint.
        test_id = f"pytest-check-{uuid.uuid4().hex[:8]}"
        conn = get_conn()
        try:
            with conn, conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO profiles (id, email, password_hash, nickname, avatar_emoji) "
                    "VALUES (%s, %s, %s, %s, %s)",
                    (test_id, _unique_email(), "hash", "x", "🧭"),
                )

            with pytest.raises(psycopg2.errors.CheckViolation):
                with conn, conn.cursor() as cur:
                    cur.execute("UPDATE profiles SET deleted_at = now() WHERE id = %s", (test_id,))

            with conn, conn.cursor() as cur:
                cur.execute("DELETE FROM profiles WHERE id = %s", (test_id,))
        finally:
            conn.close()


class TestRateLimiting:
    def test_mutate_limit_engages(self):
        # MUTATE_LIMIT is 10/minute — confirms the limiter is actually
        # wired up end to end, not just present in the source.
        codes = []
        for _ in range(10):
            resp = client.post("/shares", json={"lat": 16.0, "lon": -89.0})
            assert resp.status_code == 200
            codes.append(resp.json()["code"])

        blocked = client.post("/shares", json={"lat": 16.0, "lon": -89.0})
        assert blocked.status_code == 429

        for code in codes:
            client.delete(f"/shares/{code}")
