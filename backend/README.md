# Django Video Downloader

A small Django app that downloads a single YouTube video with `yt-dlp` and saves it in the local `downloads/` folder.

## Run the complete app

```bash
cd /home/ibrahim/video_downloader/backend
.venv/bin/python manage.py runapp
```

This starts the Next.js frontend on port `3000` and the Django API on port
`8001`. Both processes stop together when you press `Ctrl+C`.

Open the application at:

```text
http://localhost:3000/
```

Running `downloader/jobs.py` directly from PyCharm also delegates to `runapp`.
That file remains the background download worker when Django imports it.

## Test

```bash
python manage.py check
python manage.py test downloader
```

## Keep Running

Use [DEPLOYMENT.md](/home/ibrahim/laptop/Projects/python/DEPLOYMENT.md) to run this app as an Ubuntu service with Gunicorn.

## Files

- `downloader/services.py` contains the `yt-dlp` download logic.
- `downloader/templates/downloader/home.html` contains the page markup.
- `static/downloader/styles.css` contains the UI styling.
- `downloads/` is where completed videos are saved.
