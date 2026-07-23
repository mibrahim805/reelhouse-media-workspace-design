FROM node:22-bookworm-slim AS frontend-build

WORKDIR /app/frontend
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_BACKEND_BASE_URL=""

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build


FROM node:22-bookworm-slim AS pot-provider-build

ARG BGUTIL_VERSION=1.3.1

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
RUN git clone --depth 1 --branch "${BGUTIL_VERSION}" \
    https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git bgutil

WORKDIR /build/bgutil/server
RUN npm ci \
    && ./node_modules/.bin/tsc --pretty false \
    && rm -rf node_modules \
    && npm ci --omit=dev


FROM node:22-bookworm-slim AS runtime

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        ffmpeg \
        python3 \
        python3-venv \
        tini \
    && rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir --upgrade pip

WORKDIR /app
COPY backend/requirements.txt /tmp/backend-requirements.txt
RUN /opt/venv/bin/pip install --no-cache-dir -r /tmp/backend-requirements.txt

COPY --chown=node:node backend/ /app/backend/
COPY --from=pot-provider-build --chown=node:node /build/bgutil/server/ /opt/bgutil-provider/server/
COPY --from=pot-provider-build --chown=node:node /build/bgutil/LICENSE /opt/bgutil-provider/LICENSE
COPY --from=frontend-build --chown=node:node /app/frontend/.next/standalone/ /app/frontend/
COPY --from=frontend-build --chown=node:node /app/frontend/.next/static/ /app/frontend/.next/static/
COPY --from=frontend-build --chown=node:node /app/frontend/public/ /app/frontend/public/
COPY --chown=node:node deploy/start-container.sh /app/deploy/start-container.sh

RUN mkdir -p /data/downloads /data/job-cache \
    && chown -R node:node /app /data \
    && chmod +x /app/deploy/start-container.sh

ENV PATH="/opt/venv/bin:${PATH}"
ENV PYTHONUNBUFFERED=1
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS="--max-old-space-size=96"
ENV UV_THREADPOOL_SIZE=2
ENV MALLOC_ARENA_MAX=2
ENV HOSTNAME=0.0.0.0
ENV PORT=8080
ENV BACKEND_BASE_URL=http://127.0.0.1:8001
ENV NEXT_PUBLIC_BACKEND_BASE_URL=""
ENV DJANGO_DEBUG=0
ENV DJANGO_ALLOWED_HOSTS=127.0.0.1,localhost
ENV FRONTEND_BASE_URL=http://localhost:8080
ENV REELHOUSE_DOWNLOAD_DIR=/data/downloads
ENV REELHOUSE_JOB_CACHE_DIR=/data/job-cache
ENV REELHOUSE_MAX_CONCURRENT_DOWNLOADS=1
ENV YTDLP_COOKIE_FILE=/data/youtube_cookies.txt
ENV YTDLP_POT_PROVIDER_DIR=/opt/bgutil-provider/server

USER node
WORKDIR /app/frontend
EXPOSE 8080

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/app/deploy/start-container.sh"]
