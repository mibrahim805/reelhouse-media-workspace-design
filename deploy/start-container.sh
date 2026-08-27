#!/usr/bin/env bash
set -Eeuo pipefail

BACKEND_PORT="${BACKEND_PORT:-8001}"
PUBLIC_PORT="${PORT:-8080}"
APP_ROOT="${APP_ROOT:-/app}"
GUNICORN_THREADS="${GUNICORN_THREADS:-2}"

# Both processes run in this container. Always send server-side API requests
# over loopback instead of routing them through the public Kubeletto domain.
REELHOUSE_INTERNAL_BACKEND_URL="http://127.0.0.1:${BACKEND_PORT}"
export REELHOUSE_INTERNAL_BACKEND_URL

if [[ -z "${DJANGO_SECRET_KEY:-}" ]]; then
  DJANGO_SECRET_KEY="$(python -c 'import secrets; print(secrets.token_urlsafe(48))')"
  export DJANGO_SECRET_KEY
fi

if [[ -n "${YTDLP_COOKIE_CONTENT:-}" ]]; then
  printf '%s' "${YTDLP_COOKIE_CONTENT}" > "${YTDLP_COOKIE_FILE}"
  chmod 600 "${YTDLP_COOKIE_FILE}"
fi

cd "${APP_ROOT}/backend"
python manage.py migrate --noinput

gunicorn video_downloader.wsgi:application \
  --bind "127.0.0.1:${BACKEND_PORT}" \
  --workers 1 \
  --threads "${GUNICORN_THREADS}" \
  --preload \
  --timeout 600 \
  --graceful-timeout 30 \
  --access-logfile - \
  --error-logfile - &
backend_pid=$!

cd "${APP_ROOT}/frontend"
HOSTNAME=0.0.0.0 PORT="${PUBLIC_PORT}" node server.js &
frontend_pid=$!

cleanup() {
  trap - EXIT INT TERM
  kill -TERM "${frontend_pid}" "${backend_pid}" 2>/dev/null || true
  wait "${frontend_pid}" "${backend_pid}" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

echo "Reelhouse frontend listening on 0.0.0.0:${PUBLIC_PORT}"
echo "Reelhouse backend listening internally on 127.0.0.1:${BACKEND_PORT}"

wait -n "${frontend_pid}" "${backend_pid}"
