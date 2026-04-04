"""Profile logo upload, read, and delete API behavior tests."""

from __future__ import annotations

import base64
from collections.abc import Iterator
from uuid import uuid4

import pytest
from httpx import AsyncClient

from app.features.auth.service import CSRF_COOKIE_NAME
from app.integrations.storage import StorageNotFoundError
from app.main import app
from app.shared.dependencies import get_storage_service

pytestmark = pytest.mark.asyncio

_PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC"
)
_JPEG_BYTES = base64.b64decode(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/"
    "2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/"
    "8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2Jy"
    "ggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLD"
    "xMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3"
    "AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6"
    "goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q=="
)


class _FakeStorageService:
    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}
        self.should_fail_upload = False

    def upload(
        self,
        *,
        prefix: str,
        filename: str,
        data: bytes,
        content_type: str,
    ) -> str:
        del content_type
        if self.should_fail_upload:
            raise RuntimeError("upload failed")
        object_path = f"{prefix.strip('/')}/{filename.lstrip('/')}"
        self.objects[object_path] = data
        return object_path

    def delete(self, object_path: str) -> None:
        self.objects.pop(object_path, None)

    def fetch_bytes(self, object_path: str) -> bytes:
        if object_path not in self.objects:
            raise StorageNotFoundError(object_path)
        return self.objects[object_path]


@pytest.fixture(autouse=True)
def _override_storage_service_dependency() -> Iterator[_FakeStorageService]:
    storage_service = _FakeStorageService()
    app.dependency_overrides[get_storage_service] = lambda: storage_service
    yield storage_service
    app.dependency_overrides.pop(get_storage_service, None)


async def test_get_logo_returns_404_when_user_has_no_logo(client: AsyncClient) -> None:
    await _register_and_login(client, _credentials())

    response = await client.get("/api/profile/logo")

    assert response.status_code == 404
    assert response.json() == {"detail": "Logo not found"}


async def test_upload_logo_accepts_valid_jpeg_even_with_wrong_extension(
    client: AsyncClient,
    _override_storage_service_dependency: _FakeStorageService,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/profile/logo",
        files={"file": ("logo.txt", _JPEG_BYTES, "text/plain")},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 200
    assert response.json()["has_logo"] is True
    stored_object_paths = list(_override_storage_service_dependency.objects)
    assert len(stored_object_paths) == 1
    assert stored_object_paths[0].endswith("/logo")


async def test_upload_logo_rejects_invalid_magic_bytes(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/profile/logo",
        files={"file": ("logo.jpg", b"not-a-real-image", "image/jpeg")},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 422
    assert response.json() == {"detail": "Logo must be a JPEG or PNG image"}


async def test_upload_logo_rejects_corrupted_png_with_valid_signature(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/profile/logo",
        files={"file": ("logo.png", _PNG_BYTES[:-12], "image/png")},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 422
    assert response.json() == {"detail": "Logo must be a JPEG or PNG image"}


async def test_upload_logo_rejects_corrupted_jpeg_with_valid_signature(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/profile/logo",
        files={"file": ("logo.jpg", _JPEG_BYTES[:-2] + b"\x00\x00", "image/jpeg")},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 422
    assert response.json() == {"detail": "Logo must be a JPEG or PNG image"}


async def test_upload_logo_rejects_files_larger_than_2mb(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())

    response = await client.post(
        "/api/profile/logo",
        files={
            "file": (
                "logo.png",
                _PNG_BYTES + (b"0" * (2 * 1024 * 1024 + 1)),
                "image/png",
            )
        },
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 422
    assert response.json() == {"detail": "Logo must be 2 MB or smaller"}


async def test_get_logo_returns_bytes_content_type_and_no_store_header(
    client: AsyncClient,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    upload_response = await client.post(
        "/api/profile/logo",
        files={"file": ("logo.png", _PNG_BYTES, "image/png")},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert upload_response.status_code == 200

    response = await client.get("/api/profile/logo")

    assert response.status_code == 200
    assert response.content == _PNG_BYTES
    assert response.headers["content-type"] == "image/png"
    assert response.headers["cache-control"] == "no-store"


async def test_get_logo_returns_404_when_logo_path_exists_but_object_is_missing(
    client: AsyncClient,
    _override_storage_service_dependency: _FakeStorageService,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    upload_response = await client.post(
        "/api/profile/logo",
        files={"file": ("logo.png", _PNG_BYTES, "image/png")},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert upload_response.status_code == 200

    _override_storage_service_dependency.objects.clear()

    response = await client.get("/api/profile/logo")

    assert response.status_code == 404
    assert response.json() == {"detail": "Logo not found"}


async def test_upload_logo_returns_500_when_storage_write_fails(
    client: AsyncClient,
    _override_storage_service_dependency: _FakeStorageService,
) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    _override_storage_service_dependency.should_fail_upload = True

    response = await client.post(
        "/api/profile/logo",
        files={"file": ("logo.png", _PNG_BYTES, "image/png")},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 500
    assert response.json() == {"detail": "Unable to upload logo"}


async def test_delete_logo_clears_profile_and_future_reads_return_404(client: AsyncClient) -> None:
    csrf_token = await _register_and_login(client, _credentials())
    upload_response = await client.post(
        "/api/profile/logo",
        files={"file": ("logo.png", _PNG_BYTES, "image/png")},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert upload_response.status_code == 200

    delete_response = await client.delete(
        "/api/profile/logo",
        headers={"X-CSRF-Token": csrf_token},
    )

    assert delete_response.status_code == 204

    profile_response = await client.get("/api/profile")
    assert profile_response.status_code == 200
    assert profile_response.json()["has_logo"] is False

    logo_response = await client.get("/api/profile/logo")
    assert logo_response.status_code == 404
    assert logo_response.json() == {"detail": "Logo not found"}


async def _register_and_login(client: AsyncClient, credentials: dict[str, str]) -> str:
    register_response = await client.post("/api/auth/register", json=credentials)
    assert register_response.status_code == 201
    login_response = await client.post("/api/auth/login", json=credentials)
    assert login_response.status_code == 200
    csrf_token = client.cookies.get(CSRF_COOKIE_NAME)
    assert csrf_token is not None
    return csrf_token


def _credentials() -> dict[str, str]:
    suffix = uuid4().hex[:12]
    return {
        "email": f"logo-user-{suffix}@example.com",
        "password": "StrongPass123!",
    }
