# Django Video Downloader

A small Django app that downloads a single YouTube video with `yt-dlp` and saves it in the local `downloads/` folder.

## Run

```bash
cd /home/ibrahim/laptop/Projects/python
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 127.0.0.1:8001
```

Open:

```text
http://127.0.0.1:8001/
```

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
