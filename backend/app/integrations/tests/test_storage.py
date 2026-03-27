"""Storage integration behavior tests."""

from __future__ import annotations

from app.integrations.storage import StorageService


def test_storage_service_constructor_does_not_resolve_adc(
    monkeypatch,
) -> None:
    calls: list[str] = []

    class _FakeClient:
        def __init__(self) -> None:
            calls.append("client")

        def bucket(self, bucket_name: str) -> object:
            calls.append(bucket_name)
            return object()

    monkeypatch.setattr("app.integrations.storage.storage.Client", _FakeClient)

    StorageService("stima-test-bucket")

    if calls:
        raise AssertionError(f"StorageService constructor should be lazy, but touched ADC: {calls}")
