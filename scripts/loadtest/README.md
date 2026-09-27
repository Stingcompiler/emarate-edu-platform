# Exam load test (k6)

500 students take the same 20-question exam at once (docs/02 Phase 5).
Local, production-like: gunicorn + PostgreSQL, no Docker.

```bash
brew install k6
cd backend
createdb ecst_load
export DJANGO_SETTINGS_MODULE=config.settings.loadtest LOADTEST_PASSWORD='…'
uv run python manage.py migrate
uv run python manage.py seed_loadtest --students 500      # prints exam=<public_id>
uv run --extra prod gunicorn config.wsgi:application --bind 127.0.0.1:8100 \
  --workers 9 --threads 4 --worker-class gthread
# in another shell, from the repo root:
k6 run -e EXAM=<public_id> -e PASSWORD='…' -e STUDENTS=500 scripts/loadtest/exam.js
```

Each virtual student arrives within the first minute, signs in, starts the
attempt, answers 20 questions with 2–6 s of reading time each and submits.

## Result — 2026-09-28, MacBook Air M1 (8 cores), PostgreSQL 16 local

| Metric | Value |
|---|---|
| Students (concurrent attempts) | 500 |
| Requests | 12,000 · failed 1 (0.008%) |
| Save answer p95 / p99 | 16 ms / 24 ms |
| Start attempt p95 | 48 ms |
| Submit (grades immediately) p95 | 57 ms |
| All requests p95 / max | 32 ms / 132 ms |
| Attempts in the database | 500 submitted and graded; 10,000 answers |

Thresholds (`http_req_failed < 1%`, save p95 < 800 ms, start/submit p95 < 1.5 s) all pass.

**Note:** opening 500 sockets in the same millisecond on macOS hits the
kernel's listen backlog (`kern.ipc.somaxconn = 128`) and resets connections
before they reach gunicorn — a limit of the test machine, not the app.
Arrivals are therefore spread over the first minute, as a real class arrives.
Production sits behind a load balancer with its own connection handling.
