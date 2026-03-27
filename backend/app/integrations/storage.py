"""Private object storage integration backed by Google Cloud Storage."""

from __future__ import annotations

from functools import cached_property
from typing import Protocol

from google.api_core.exceptions import NotFound
from google.cloud import storage  # type: ignore[import-untyped]


class StorageNotFoundError(Exception):
    """Raised when a requested storage object does not exist."""


class StorageReaderProtocol(Protocol):
    """Structural protocol for read-only storage access."""

    def fetch_bytes(self, object_path: str) -> bytes: ...


class StorageServiceProtocol(StorageReaderProtocol, Protocol):
    """Structural protocol for full storage access."""

    def upload(
        self,
        *,
        prefix: str,
        filename: str,
        data: bytes,
        content_type: str,
    ) -> str: ...

    def delete(self, object_path: str) -> None: ...


class StorageService:
    """Upload, fetch, and delete objects in one configured private bucket."""

    def __init__(self, bucket_name: str) -> None:
        self._bucket_name = bucket_name

    def upload(
        self,
        *,
        prefix: str,
        filename: str,
        data: bytes,
        content_type: str,
    ) -> str:
        """Write bytes to a prefixed object path and return that path."""
        object_path = _build_object_path(prefix=prefix, filename=filename)
        blob = self._bucket.blob(object_path)
        blob.upload_from_string(data, content_type=content_type)
        return object_path

    def delete(self, object_path: str) -> None:
        """Delete an object, treating a missing object as an idempotent no-op."""
        blob = self._bucket.blob(object_path)
        try:
            blob.delete()
        except NotFound:
            return

    def fetch_bytes(self, object_path: str) -> bytes:
        """Read raw bytes for one object path."""
        blob = self._bucket.blob(object_path)
        try:
            return bytes(blob.download_as_bytes())
        except NotFound as exc:
            raise StorageNotFoundError(object_path) from exc

    @cached_property
    def _bucket(self):  # type: ignore[no-untyped-def]
        """Resolve the bucket lazily and reuse it across storage operations."""
        return storage.Client().bucket(self._bucket_name)


def _build_object_path(*, prefix: str, filename: str) -> str:
    normalized_prefix = prefix.strip("/")
    normalized_filename = filename.lstrip("/")
    if not normalized_prefix:
        return normalized_filename
    return f"{normalized_prefix}/{normalized_filename}"
