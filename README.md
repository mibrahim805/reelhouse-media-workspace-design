# Reelhouse

Reelhouse is a focused media workspace for discovering, previewing, and saving
videos. This repository packages the Next.js frontend and Django/yt-dlp backend
as one Docker application.

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
- `REELHOUSE_WINDOWS_DOWNLOAD_URL`, `REELHOUSE_LINUX_APPIMAGE_URL`,
  `REELHOUSE_LINUX_DEB_URL`, and `REELHOUSE_ANDROID_DOWNLOAD_URL`: optional
  hosted release URLs shown by the app-download dialog.

## Local development

```bash
cd backend
.venv/bin/python manage.py runapp
```

Then open <http://localhost:3000>.
