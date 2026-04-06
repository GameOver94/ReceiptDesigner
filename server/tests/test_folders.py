"""
test_folders.py — Tests for /api/v1/folders CRUD endpoints.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from server.tests.conftest import login


def test_list_folders_empty(client: TestClient) -> None:
    cookies = login(client)
    resp = client.get("/api/v1/folders", cookies=cookies)
    assert resp.status_code == 200
    assert resp.json() == []


def test_create_folder(client: TestClient) -> None:
    cookies = login(client)
    resp = client.post("/api/v1/folders", json={"name": "Receipts"}, cookies=cookies)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Receipts"
    assert "id" in data
    assert "created_at" in data


def test_create_folder_invalid_name(client: TestClient) -> None:
    cookies = login(client)
    resp = client.post("/api/v1/folders", json={"name": ""}, cookies=cookies)
    assert resp.status_code == 422


def test_rename_folder(client: TestClient) -> None:
    cookies = login(client)
    create_resp = client.post("/api/v1/folders", json={"name": "Old Name"}, cookies=cookies)
    folder_id = create_resp.json()["id"]

    resp = client.put(f"/api/v1/folders/{folder_id}", json={"name": "New Name"}, cookies=cookies)
    assert resp.status_code == 200
    assert resp.json()["name"] == "New Name"


def test_rename_folder_not_found(client: TestClient) -> None:
    cookies = login(client)
    resp = client.put("/api/v1/folders/nonexistent", json={"name": "x"}, cookies=cookies)
    assert resp.status_code == 404


def test_delete_folder(client: TestClient) -> None:
    cookies = login(client)
    create_resp = client.post("/api/v1/folders", json={"name": "ToDelete"}, cookies=cookies)
    folder_id = create_resp.json()["id"]

    resp = client.delete(f"/api/v1/folders/{folder_id}", cookies=cookies)
    assert resp.status_code == 204

    get_resp = client.get("/api/v1/folders", cookies=cookies)
    folder_ids = [f["id"] for f in get_resp.json()]
    assert folder_id not in folder_ids


def test_delete_folder_not_found(client: TestClient) -> None:
    cookies = login(client)
    resp = client.delete("/api/v1/folders/nonexistent", cookies=cookies)
    assert resp.status_code == 404


def test_delete_folder_moves_docs_to_root(client: TestClient) -> None:
    cookies = login(client)
    # Create folder
    folder_resp = client.post("/api/v1/folders", json={"name": "TempFolder"}, cookies=cookies)
    folder_id = folder_resp.json()["id"]

    # Create a document in the folder
    doc_resp = client.post(
        "/api/v1/documents",
        json={"name": "InFolder", "folder_id": folder_id},
        cookies=cookies,
    )
    doc_id = doc_resp.json()["id"]
    assert doc_resp.json()["folder_id"] == folder_id

    # Delete the folder
    client.delete(f"/api/v1/folders/{folder_id}", cookies=cookies)

    # Document should now be at root (folder_id = null)
    doc_resp2 = client.get(f"/api/v1/documents/{doc_id}", cookies=cookies)
    assert doc_resp2.json()["folder_id"] is None


def test_list_folders_sorted_by_name(client: TestClient) -> None:
    cookies = login(client)
    client.post("/api/v1/folders", json={"name": "Zebra"}, cookies=cookies)
    client.post("/api/v1/folders", json={"name": "Apple"}, cookies=cookies)

    resp = client.get("/api/v1/folders", cookies=cookies)
    names = [f["name"] for f in resp.json()]
    assert names == sorted(names)
