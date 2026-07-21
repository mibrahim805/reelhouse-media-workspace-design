# Reelhouse

Reelhouse is a focused media workspace for discovering, previewing, and saving
videos. This repository packages the Next.js frontend and Django/yt-dlp backend
as one Docker application.

## Free hosted deployment (no card)

Deploy the root `Dockerfile` with **Back4app Containers**. Its free container
does not require a credit card and provides a public `b4a.run` URL.

The public container port is `8080`. Django remains internal on port `8001`,
and the Next.js server proxies API and downloaded-file requests to it.

Downloaded videos and job state use ephemeral storage. They remain available
while the container is running, but can be removed whenever the free container
restarts or is redeployed. The free container has limited memory, so Reelhouse
processes one download at a time and queues additional requests.

### Deploy from GitHub

1. Sign in to Back4app with GitHub and choose **Build new app**.
2. Select `reelhouse-media-workspace-design` and the `main` branch.
3. Leave the root directory empty because `Dockerfile` is at the repository
   root.
4. Select the **Free** container, set the public port to `8080`, and create the
   app.

Back4app rebuilds the container automatically after commits to `main`.

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
