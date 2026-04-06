"""
test_documents.py — Tests for /api/v1/documents CRUD endpoints.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from server.tests.conftest import login


def test_list_documents_empty(client: TestClient) -> None:
    cookies = login(client)
    resp = client.get("/api/v1/documents", cookies=cookies)
    assert resp.status_code == 200
    assert resp.json() == []


def test_create_document(client: TestClient) -> None:
    cookies = login(client)
    payload = {
        "name": "Test Receipt",
        "content": "encoder.initialize().line('Hello').newline();",
    }
    resp = client.post("/api/v1/documents", json=payload, cookies=cookies)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Test Receipt"
    assert data["content"] == payload["content"]
    assert "id" in data
    assert "created_at" in data
    assert "updated_at" in data
    assert data["is_template"] is False


def test_create_document_with_placeholder(client: TestClient) -> None:
    cookies = login(client)
    payload = {"name": "Template", "content": "encoder.line('{{name}}');"}
    resp = client.post("/api/v1/documents", json=payload, cookies=cookies)
    assert resp.status_code == 201
    assert resp.json()["is_template"] is True


def test_get_document(client: TestClient) -> None:
    cookies = login(client)
    create_resp = client.post("/api/v1/documents", json={"name": "Doc A"}, cookies=cookies)
    doc_id = create_resp.json()["id"]

    resp = client.get(f"/api/v1/documents/{doc_id}", cookies=cookies)
    assert resp.status_code == 200
    assert resp.json()["id"] == doc_id


def test_get_document_not_found(client: TestClient) -> None:
    cookies = login(client)
    resp = client.get("/api/v1/documents/nonexistent-id", cookies=cookies)
    assert resp.status_code == 404


def test_update_document(client: TestClient) -> None:
    cookies = login(client)
    create_resp = client.post("/api/v1/documents", json={"name": "Original"}, cookies=cookies)
    doc_id = create_resp.json()["id"]
    original_created_at = create_resp.json()["created_at"]

    resp = client.put(
        f"/api/v1/documents/{doc_id}",
        json={"name": "Renamed", "content": "encoder.line('updated');"},
        cookies=cookies,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Renamed"
    assert data["content"] == "encoder.line('updated');"
    # created_at must not change
    assert data["created_at"] == original_created_at


def test_update_document_not_found(client: TestClient) -> None:
    cookies = login(client)
    resp = client.put(
        "/api/v1/documents/nonexistent",
        json={"name": "x"},
        cookies=cookies,
    )
    assert resp.status_code == 404


def test_delete_document(client: TestClient) -> None:
    cookies = login(client)
    create_resp = client.post("/api/v1/documents", json={"name": "ToDelete"}, cookies=cookies)
    doc_id = create_resp.json()["id"]

    resp = client.delete(f"/api/v1/documents/{doc_id}", cookies=cookies)
    assert resp.status_code == 204

    # Confirm it is gone
    get_resp = client.get(f"/api/v1/documents/{doc_id}", cookies=cookies)
    assert get_resp.status_code == 404


def test_delete_document_not_found(client: TestClient) -> None:
    cookies = login(client)
    resp = client.delete("/api/v1/documents/nonexistent", cookies=cookies)
    assert resp.status_code == 404


def test_list_documents_sorted_by_updated_at(client: TestClient) -> None:
    cookies = login(client)
    client.post("/api/v1/documents", json={"name": "First"}, cookies=cookies)
    client.post("/api/v1/documents", json={"name": "Second"}, cookies=cookies)

    resp = client.get("/api/v1/documents", cookies=cookies)
    names = [d["name"] for d in resp.json()]
    # Most recently created should be first (updated_at desc)
    assert names[0] == "Second"


def test_create_document_invalid_name(client: TestClient) -> None:
    cookies = login(client)
    resp = client.post("/api/v1/documents", json={"name": ""}, cookies=cookies)
    assert resp.status_code == 422


def test_document_with_folder_id(client: TestClient) -> None:
    cookies = login(client)
    # Create a folder first
    folder_resp = client.post("/api/v1/folders", json={"name": "My Folder"}, cookies=cookies)
    folder_id = folder_resp.json()["id"]

    # Create a document in that folder
    doc_resp = client.post(
        "/api/v1/documents",
        json={"name": "Foldered Doc", "folder_id": folder_id},
        cookies=cookies,
    )
    assert doc_resp.status_code == 201
    assert doc_resp.json()["folder_id"] == folder_id
