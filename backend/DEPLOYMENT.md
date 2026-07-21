# Keep The Django App Running

`python manage.py runserver` is only for development. It stops when the terminal/server process stops.

For a real website, use one of these:

- Hosting/VPS: the app runs on an always-on server.
- Local Ubuntu service: the app keeps running after you close the terminal, as long as your laptop/server stays powered on.

## Local Ubuntu Service

From the project folder:

```bash
cd /home/ibrahim/laptop/Projects/python
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
```

Install the systemd service:

```bash
sudo cp deploy/video-downloader.service /etc/systemd/system/video-downloader.service
sudo systemctl daemon-reload
sudo systemctl enable video-downloader
sudo systemctl start video-downloader
```

Check status:

```bash
sudo systemctl status video-downloader
```

Open:

```text
http://127.0.0.1:8001/
```

Stop the app:

```bash
sudo systemctl stop video-downloader
```

Restart after code changes:

```bash
sudo systemctl restart video-downloader
```

## Important

This keeps the app running after the terminal closes. It does not keep the app online if the computer/server is shut down.

To make it available on the internet like a real public website, deploy it to a VPS or hosting provider and put Nginx in front of Gunicorn.
