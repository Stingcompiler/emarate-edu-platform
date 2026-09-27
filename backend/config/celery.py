import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")

app = Celery("ecst")
# All Celery options live in Django settings under the CELERY_ prefix.
# In development CELERY_TASK_ALWAYS_EAGER runs tasks inline, so no broker is needed.
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()
