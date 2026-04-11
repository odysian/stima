"""Auth foundation model tests."""

from app.core.database import Base
from app.features.auth.models import PasswordResetToken, RefreshToken, User


def test_auth_tables_registered_in_metadata() -> None:
    assert User.__tablename__ == "users"
    assert RefreshToken.__tablename__ == "refresh_tokens"
    assert PasswordResetToken.__tablename__ == "password_reset_tokens"
    assert "users" in Base.metadata.tables
    assert "refresh_tokens" in Base.metadata.tables
    assert "password_reset_tokens" in Base.metadata.tables


def test_onboarding_fields_are_nullable() -> None:
    assert User.__table__.c["first_name"].nullable is True
    assert User.__table__.c["last_name"].nullable is True
    assert User.__table__.c["phone_number"].nullable is True
    assert User.__table__.c["business_name"].nullable is True
    assert User.__table__.c["trade_type"].nullable is True


def test_is_onboarded_requires_all_profile_fields() -> None:
    user = User(
        email="user@example.com",
        password_hash="hashed-password",
        first_name="Sam",
        last_name="Lee",
        business_name="Acme Outdoors",
        trade_type="Landscaping",
    )
    assert user.is_onboarded is True

    user.trade_type = None
    assert user.is_onboarded is False


def test_refresh_tokens_support_soft_revocation() -> None:
    assert RefreshToken.__table__.c["revoked_at"].nullable is True

    foreign_key = next(iter(RefreshToken.__table__.c["user_id"].foreign_keys))
    assert foreign_key.ondelete == "CASCADE"


def test_password_reset_tokens_support_one_time_use() -> None:
    assert PasswordResetToken.__table__.c["used_at"].nullable is True

    foreign_key = next(iter(PasswordResetToken.__table__.c["user_id"].foreign_keys))
    assert foreign_key.ondelete == "CASCADE"
