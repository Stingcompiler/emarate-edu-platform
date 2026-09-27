"""Settings shared by every environment.

Environment-specific files (dev, test, prod) import everything from here and
override only what differs. See docs/05-system-design.md §4 for the rules that
keep SQLite (development) and PostgreSQL (production) interchangeable.
"""

from datetime import timedelta
from pathlib import Path

from django.utils.csp import CSP

from .env import env, env_list

BASE_DIR = Path(__file__).resolve().parent.parent.parent

APP_VERSION = "0.1.0"

SECRET_KEY = env("DJANGO_SECRET_KEY")
DEBUG = False
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "django_filters",
    "drf_spectacular",
    "core",
    "audit",
    "organization",
    "academic",
    "students",
    "accounts",
    "files",
    "learning",
    "notifications",
    "results",
    "student_affairs",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.csp.ContentSecurityPolicyMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.locale.LocaleMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
                "django.template.context_processors.csp",
            ],
        },
    },
]

# ─── Identity ─────────────────────────────────────────────────────────────
# Defined before the first migration on purpose: swapping the user model later
# is one of the most expensive changes in a Django project.
AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# ─── Language and time (docs/05 §4 rule 5) ────────────────────────────────
LANGUAGE_CODE = "ar"
LANGUAGES = [("ar", "العربية"), ("en", "English")]
USE_I18N = True
USE_TZ = True  # stored in UTC
TIME_ZONE = "Africa/Khartoum"  # displayed in Khartoum time

# ─── Files ────────────────────────────────────────────────────────────────
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

# Two logical buckets, as in production (Bunny private/public zones).
# "default" is private: files are served only through signed URLs (Phase 2).
STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
        "OPTIONS": {"location": MEDIA_ROOT / "private", "base_url": None},
    },
    "public": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
        "OPTIONS": {"location": MEDIA_ROOT / "public", "base_url": f"/{MEDIA_URL}public/"},
    },
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}

# ─── Private files and videos (files app, docs/05 §8.8) ───────────────────
# "local": signed links served by Django (development); "bunny": Bunny
# Storage + token-authenticated CDN links + Bunny Stream (production).
MEDIA_BACKEND = "local"
VIDEO_MAX_MB = 4096
BUNNY_STORAGE_HOST = "https://storage.bunnycdn.com"
BUNNY_STORAGE_ZONE = ""
BUNNY_STORAGE_KEY = ""
BUNNY_PULL_ZONE_URL = ""
BUNNY_TOKEN_KEY = ""
BUNNY_STREAM_LIBRARY_ID = ""
BUNNY_STREAM_API_KEY = ""
BUNNY_STREAM_TOKEN_KEY = ""
BUNNY_WEBHOOK_SECRET = ""

# ─── Web Push (VAPID) ─────────────────────────────────────────────────────
# Development creates a local key pair in backend/.vapid-dev.json on first use.
VAPID_PUBLIC_KEY = ""
VAPID_PRIVATE_KEY = ""
VAPID_SUBJECT = "mailto:it@ecst.edu.sd"

CELERY_BEAT_SCHEDULE = {
    "remind-due-assignments": {
        "task": "notifications.tasks.remind_due_assignments",
        "schedule": 30 * 60,
    },
    "deliver-outbox": {"task": "notifications.tasks.deliver_outbox", "schedule": 5 * 60},
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ─── Cache (LocMem in development; Redis in production) ───────────────────
CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}

# ─── API ──────────────────────────────────────────────────────────────────
REST_FRAMEWORK = {
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_AUTHENTICATION_CLASSES": [
        # HttpOnly JWT cookies for the portal (docs/05 §7); sessions for the admin.
        "accounts.authentication.CookieJWTAuthentication",
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    # Secure by default: every endpoint must opt out explicitly to be public.
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "DEFAULT_PAGINATION_CLASS": "core.pagination.StandardPagination",
    "PAGE_SIZE": 25,
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "30/minute",
        "user": "60/minute",
        "login": "10/minute",  # per IP (docs/05 §7)
        "otp": "5/hour",  # per email target
        "otp_ip": "20/hour",  # per IP, across targets
    },
    "EXCEPTION_HANDLER": "core.exceptions.problem_exception_handler",
    "TEST_REQUEST_DEFAULT_FORMAT": "json",
}

SPECTACULAR_SETTINGS = {
    "TITLE": "ECST Platform API",
    "DESCRIPTION": "API for the Emirates College for Science & Technology platform.",
    "VERSION": APP_VERSION,
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
    "SCHEMA_PATH_PREFIX": r"/api/(v1|public|visitor)",
    "ENUM_NAME_OVERRIDES": {
        "CheckResultEnum": ["ok", "error"],
        "RoleEnum": "accounts.rbac.Role",
        "TeachingKindEnum": "academic.models.DepartmentMembership.Kind",
        "ResourceKindEnum": "learning.models.LectureResource.Kind",
        "NotificationCategoryEnum": "notifications.models.Category",
        "SendCategoryEnum": ["course", "college", "results"],
        "ResultBatchStatusEnum": "results.models.ResultImportBatch.Status",
        "AcademicResultStatusEnum": "results.models.AcademicResult.Status",
        "CorrectionStatusEnum": "results.models.ResultCorrection.Status",
        "RegulationStatusEnum": "student_affairs.models.Regulation.Status",
        "StudentCaseKindEnum": "student_affairs.models.StudentCase.Kind",
        "StudentCaseStatusEnum": "student_affairs.models.StudentCase.Status",
        "CaseEventKindEnum": "student_affairs.models.StudentCaseEvent.Kind",
        "MisconductStatusEnum": "student_affairs.models.MisconductReport.Status",
        "StudentStatusChangeEnum": ["active", "suspended"],
        "StudentRecordStatusEnum": "students.models.StudentRecord.Status",
    },
}

# ─── Authentication (docs/05 §7, §8.2) ────────────────────────────────────
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "USER_ID_FIELD": "id",
}
AUTH_COOKIE_ACCESS = "access"
AUTH_COOKIE_REFRESH = "refresh"
AUTH_COOKIE_SECURE = False  # True in production (HTTPS)
AUTH_COOKIE_SAMESITE = "Lax"
# Lock an identifier for 15 minutes after 10 failed logins (docs/05 §8.2).
LOGIN_MAX_FAILURES = 10
LOGIN_LOCKOUT_SECONDS = 15 * 60
# Links in emails (activation) point at the portal.
PORTAL_BASE_URL = env("PORTAL_BASE_URL", "http://localhost:5173")

# ─── Background tasks ─────────────────────────────────────────────────────
CELERY_BROKER_URL = env("CELERY_BROKER_URL", "memory://")
CELERY_RESULT_BACKEND = None
CELERY_TASK_ALWAYS_EAGER = False
CELERY_TASK_EAGER_PROPAGATES = True
CELERY_TIMEZONE = TIME_ZONE
CELERY_TASK_SERIALIZER = "json"
CELERY_ACCEPT_CONTENT = ["json"]

# ─── Email ────────────────────────────────────────────────────────────────
# Django 6.1 "mailers": each environment defines MAILERS; the old EMAIL_BACKEND
# family of settings is deprecated and must not be mixed with it.
MAILERS = {"default": {"BACKEND": "django.core.mail.backends.console.EmailBackend"}}
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", "ECST <no-reply@ecst.edu.sd>")
SERVER_EMAIL = DEFAULT_FROM_EMAIL

# ─── Security headers ─────────────────────────────────────────────────────
# Django 6 built-in Content Security Policy. The API serves JSON; the only HTML
# it serves is the admin and (in development) the API docs.
SECURE_CSP = {
    "default-src": [CSP.SELF],
    "img-src": [CSP.SELF, "data:"],
    "style-src": [CSP.SELF],
    "script-src": [CSP.SELF],
    "object-src": [CSP.NONE],
    "base-uri": [CSP.NONE],
    "frame-ancestors": [CSP.NONE],
}
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"
CSRF_TRUSTED_ORIGINS = env_list("DJANGO_CSRF_TRUSTED_ORIGINS")

# ─── Logging ──────────────────────────────────────────────────────────────
LOG_LEVEL = env("DJANGO_LOG_LEVEL", "INFO")
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "plain": {"format": "%(asctime)s %(levelname)s %(name)s %(message)s"},
        "json": {"()": "core.logging.JsonFormatter"},
    },
    "handlers": {"console": {"class": "logging.StreamHandler", "formatter": "plain"}},
    "root": {"handlers": ["console"], "level": LOG_LEVEL},
    "loggers": {"django.db.backends": {"level": "WARNING"}},
}

# Whether /api/schema/ and /api/docs/ are exposed (development only by default).
SERVE_API_DOCS = False
