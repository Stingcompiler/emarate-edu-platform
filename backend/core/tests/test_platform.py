"""Guards for the Phase 0 foundation decisions (docs/02 D2, docs/05 §4)."""

import importlib

import pytest
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core import mail
from django.core.checks import run_checks
from django.db import connection

from core.tasks import ping


def test_custom_user_model_is_active():
    assert settings.AUTH_USER_MODEL == "accounts.User"


@pytest.mark.django_db
def test_users_get_a_public_id():
    user = get_user_model().objects.create_user(username="u1", password="x")

    assert user.public_id is not None


def test_time_is_stored_in_utc_and_shown_in_khartoum():
    assert settings.USE_TZ is True
    assert settings.TIME_ZONE == "Africa/Khartoum"
    assert settings.LANGUAGE_CODE == "ar"


def test_celery_runs_tasks_inline_without_a_broker():
    assert ping.delay().get(timeout=1) == "pong"


def test_email_is_captured_not_sent():
    mail.send_mail("subject", "body", None, ["someone@example.com"])

    assert len(mail.outbox) == 1


@pytest.mark.django_db
def test_sqlite_enforces_foreign_keys():
    if connection.vendor != "sqlite":
        pytest.skip("SQLite-only guarantee")
    with connection.cursor() as cursor:
        cursor.execute("PRAGMA foreign_keys")
        assert cursor.fetchone()[0] == 1


def test_development_settings_need_no_external_services():
    dev = importlib.import_module("config.settings.dev")

    assert dev.DATABASES["default"]["ENGINE"] == "django.db.backends.sqlite3"
    assert "journal_mode=WAL" in dev.DATABASES["default"]["OPTIONS"]["init_command"]
    assert dev.CELERY_TASK_ALWAYS_EAGER is True
    assert "locmem" in dev.CACHES["default"]["BACKEND"]
    assert dev.MAILERS["default"]["BACKEND"] == "core.mail.DevEmailBackend"


def test_deploy_check_flags_local_private_storage():
    ids = {message.id for message in run_checks(include_deployment_checks=True)}

    assert "core.W001" in ids
