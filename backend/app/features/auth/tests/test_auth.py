"""Auth foundation model tests."""

from app.core.database import Base
from app.features.auth.models import RefreshToken, User


def test_auth_tables_registered_in_metadata() -> None:
    assert User.__table__.name == "users"
    assert RefreshToken.__table__.name == "refresh_tokens"
    assert "users" in Base.metadata.tables
    assert "refresh_tokens" in Base.metadata.tables


def test_onboarding_fields_are_nullable() -> None:
    assert User.__table__.c["first_name"].nullable is True
    assert User.__table__.c["last_name"].nullable is True
    assert User.__table__.c["phone_number"].nullable is True


def test_refresh_tokens_support_soft_revocation() -> None:
    assert RefreshToken.__table__.c["revoked_at"].nullable is True

    foreign_key = next(iter(RefreshToken.__table__.c["user_id"].foreign_keys))
    assert foreign_key.ondelete == "CASCADE"
