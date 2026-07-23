# Reelhouse

Reelhouse is a focused media workspace for discovering, previewing, and saving
videos. This repository packages the Next.js frontend and Django/yt-dlp backend
as one Docker application.

## Deploy on Railway

Railway automatically uses the root `Dockerfile` and `railway.json`. The
frontend and backend run in one service, so do not create separate services or
override the start command.

1. Push this repository to GitHub.
2. In Railway, choose **New Project → Deploy from GitHub repo** and select the
   repository.
3. Wait for the Docker build and health check to complete.
4. Open the service's **Settings → Networking** and choose
   **Generate Domain**.
5. In **Variables**, add a stable production secret:

   ```text
   DJANGO_SECRET_KEY=<a-long-random-secret>
   ```

`PORT` is supplied by Railway automatically. The container already listens on
that port, so it must not be set manually. Cookies for authenticated YouTube
downloads can optionally be stored as the secret variable
`YTDLP_COOKIE_CONTENT`.

To test YouTube through Railway's IPv6 network, enable **Outbound IPv6** under
the service's **Settings → Networking**, add `YTDLP_FORCE_IPV6=true` in
**Variables**, and redeploy. Remove the variable or set it to `false` if the
service reports IPv6 connectivity errors. This is an experimental fallback;
hosting-provider addresses can still be rejected by YouTube.

Railway's Free plan is suitable only for testing this application. It currently
starts with a 30-day, $5 trial and then provides $1 of monthly usage, with
0.5 GB RAM and 1 GB of ephemeral disk. Downloaded videos and SQLite/job-cache
state can disappear on restart or redeploy, and large downloads can fill the
disk. Keep `REELHOUSE_MAX_CONCURRENT_DOWNLOADS=1` on this tier.

## Free hosted deployment (no card)

Deploy the published Docker image with **ClawCloud Run**. Its Free Plan does not
require a credit card and provides a stable public HTTPS address. A GitHub
account older than 180 days receives a recurring $5 monthly credit; newer
accounts receive only the first month's credit.

The public container port is `8080`. Django remains internal on port `8001`,
and the Next.js server proxies API and downloaded-file requests to it.

Downloaded videos and job state use ephemeral storage. They remain available
while the container is running, but can be removed whenever the free container
restarts or is redeployed. The free container has limited memory, so Reelhouse
processes one download at a time and queues additional requests.

### Publish and deploy

1. Push `main` and wait for the **Publish container image** workflow on GitHub
   Actions to finish.
2. Open the new `reelhouse-media-workspace-design` package on GitHub, choose
   **Package settings**, and change its visibility to **Public**. The application
   source is already public; this lets ClawCloud pull the image without a token.
3. Sign in to ClawCloud Run with the same GitHub account and stay on the
   **Free** plan.
4. Open **App Launchpad**, create an app, and use this public image:

   ```text
   ghcr.io/mibrahim805/reelhouse-media-workspace-design:latest
   ```

5. Choose **Fixed** mode with one instance, `0.2` vCPU, and `512 MiB` memory.
6. In **Network**, set the container port to `8080` and enable **Public Access**.
   No startup command or persistent storage is required.
7. Deploy and open the generated **Public Address** after the instance becomes
   healthy.

The selected CPU and memory cost about $1.80 per month before storage and
network usage, leaving room within the recurring $5 credit. ClawCloud's Free
Plan limits network traffic to 10 GB, so this deployment is intended for light
personal sharing rather than high-volume downloads.

GitHub publishes a fresh `latest` image after application changes on `main`.
In ClawCloud, restart or update the app to pull the new image.

### Optional environment variables

- `DJANGO_SECRET_KEY`: a long random value. The container generates an
  ephemeral key when this is omitted.
- `YTDLP_COOKIE_CONTENT`: Netscape-format cookie-file contents for videos that
  require authentication. Treat this as highly sensitive, add it only through
  the host's secret settings, and never commit it to Git.
- `YTDLP_FORCE_IPV6`: set to `true` only when the host has outbound IPv6
  enabled and yt-dlp should bind all outgoing requests to IPv6.
- `REELHOUSE_WINDOWS_DOWNLOAD_URL`, `REELHOUSE_LINUX_APPIMAGE_URL`,
  `REELHOUSE_LINUX_DEB_URL`, and `REELHOUSE_ANDROID_DOWNLOAD_URL`: optional
  hosted release URLs shown by the app-download dialog.

## Local development

```bash
cd backend
.venv/bin/python manage.py runapp
```

Then open <http://localhost:3000>.
