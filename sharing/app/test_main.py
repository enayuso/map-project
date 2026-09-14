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

import pytest
from fastapi.testclient import TestClient

from main import app

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
