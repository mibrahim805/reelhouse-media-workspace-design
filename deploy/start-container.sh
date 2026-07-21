#!/usr/bin/env bash
set -Eeuo pipefail

BACKEND_PORT="${BACKEND_PORT:-8001}"
PUBLIC_PORT="${PORT:-7860}"
APP_ROOT="${APP_ROOT:-/app}"

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
  --threads 8 \
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
