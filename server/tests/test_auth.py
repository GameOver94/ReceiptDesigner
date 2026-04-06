"""
test_auth.py — Tests for POST /api/v1/auth/login and /logout.
"""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_login_success(client: TestClient) -> None:
    resp = client.post("/api/v1/auth/login", json={"token": "test-token"})
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
    assert "rd_session" in resp.cookies


def test_login_wrong_token(client: TestClient) -> None:
    resp = client.post("/api/v1/auth/login", json={"token": "wrong"})
    assert resp.status_code == 401


def test_login_missing_token_field(client: TestClient) -> None:
    resp = client.post("/api/v1/auth/login", json={})
    assert resp.status_code == 422


def test_logout(client: TestClient) -> None:
    # Login first
    login_resp = client.post("/api/v1/auth/login", json={"token": "test-token"})
    assert login_resp.status_code == 200
    cookie = login_resp.cookies.get("rd_session", "")
    assert cookie

    # Logout
    resp = client.post("/api/v1/auth/logout", cookies={"rd_session": cookie})
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_protected_endpoint_without_cookie(client: TestClient) -> None:
    resp = client.get("/api/v1/documents")
    assert resp.status_code == 401


def test_health_check_no_auth(client: TestClient) -> None:
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
