from types import SimpleNamespace

from app.features.quotes.api import _resolve_public_business_name, _resolve_public_owner_name


def test_resolve_public_business_name_falls_back_to_owner_name() -> None:
    context = SimpleNamespace(
        business_name="   ",
        first_name="Jamie",
        last_name="Owner",
    )

    assert _resolve_public_business_name(context) == "Jamie Owner"
    assert _resolve_public_owner_name(context) == "Jamie Owner"


def test_resolve_public_business_name_returns_none_when_no_names_present() -> None:
    context = SimpleNamespace(
        business_name=None,
        first_name=" ",
        last_name=None,
    )

    assert _resolve_public_business_name(context) is None
    assert _resolve_public_owner_name(context) is None
