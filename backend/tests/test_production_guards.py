from app.core.config import Settings


def _base(**over):
    defaults = dict(
        ENVIRONMENT="production",
        SECRET_KEY="x" * 40,
        COOKIE_SECURE=True,
        CORS_ORIGINS="https://crm.example.com",
        SEED_DEMO=False,
    )
    defaults.update(over)
    return Settings(**defaults)


def test_valid_production_config_has_no_errors():
    assert _base().production_config_errors() == []


def test_dev_config_is_never_blocked():
    s = Settings(ENVIRONMENT="development", SECRET_KEY="change-me-in-env",
                 COOKIE_SECURE=False, CORS_ORIGINS="http://localhost:5173", SEED_DEMO=True)
    assert s.production_config_errors() == []


def test_weak_secret_key_blocks():
    assert any("SECRET_KEY" in e for e in _base(SECRET_KEY="change-me-in-env").production_config_errors())


def test_insecure_cookie_blocks():
    assert any("COOKIE_SECURE" in e for e in _base(COOKIE_SECURE=False).production_config_errors())


def test_wildcard_cors_blocks():
    assert any("*" in e for e in _base(CORS_ORIGINS="*").production_config_errors())


def test_localhost_cors_blocks():
    errs = _base(CORS_ORIGINS="https://crm.example.com,http://localhost:5173").production_config_errors()
    assert any("localhost" in e for e in errs)


def test_seed_demo_blocks():
    assert any("SEED_DEMO" in e for e in _base(SEED_DEMO=True).production_config_errors())
