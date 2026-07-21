---
title: Reelhouse
emoji: 🎬
colorFrom: red
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
---

# Reelhouse

Reelhouse is a focused media workspace for discovering, previewing, and saving
videos. This repository packages the Next.js frontend and Django/yt-dlp backend
as one Docker application.

## Free hosted deployment

Create a new **Docker Space** on Hugging Face, choose the free **CPU Basic**
hardware, and push this repository to the Space. Use a **private Space** for
personal use so strangers cannot consume the download service.

The public container port is `7860`. Django remains internal on port `8001`,
and the Next.js server proxies API and downloaded-file requests to it.

Downloaded videos and job state use ephemeral storage. They remain available
while the Space is running, but are removed whenever the free Space restarts.
The Space may sleep after an extended idle period and wakes when you visit it.

### Push the deployment

1. Create an empty Hugging Face Space using the **Docker** SDK and free
   **CPU Basic** hardware.
2. Create a Hugging Face token with write access.
3. Run `./deploy/push-huggingface.sh`. The script asks for the Space ID and
   token, then pushes the deployment.

The script creates a clean deployment snapshot, so the repository's old large
Git history and native client projects are not sent to the Space. The token is
entered with hidden input and is not written to the repository.

### Optional Space secrets

- `DJANGO_SECRET_KEY`: a long random value. The container generates an
  ephemeral key when this is omitted.
- `YTDLP_COOKIE_CONTENT`: Netscape-format cookie-file contents for videos that
  require authentication. Treat this as highly sensitive and only use it in a
  private Space.
- `REELHOUSE_WINDOWS_DOWNLOAD_URL`, `REELHOUSE_LINUX_APPIMAGE_URL`,
  `REELHOUSE_LINUX_DEB_URL`, and `REELHOUSE_ANDROID_DOWNLOAD_URL`: optional
  hosted release URLs shown by the app-download dialog.

## Local development

```bash
cd backend
.venv/bin/python manage.py runapp
```

Then open <http://localhost:3000>.
