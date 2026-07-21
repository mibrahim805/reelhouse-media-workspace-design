import os
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Lock
from uuid import uuid4


# PyCharm commonly runs whichever file is currently open. This module is
# normally imported by Django, but when it is executed directly, hand off to
# the development launcher so "Run jobs.py" starts the actual application.
if __name__ == '__main__' and not __package__:
    backend_dir = Path(__file__).resolve().parents[1]
    os.chdir(backend_dir)
    os.execv(
        sys.executable,
        [sys.executable, str(backend_dir / 'manage.py'), 'runapp'],
    )

from django.core.cache import cache

from .services import DownloadError, download_video


_lock = Lock()
_job_timeout = 24 * 60 * 60

try:
    _max_concurrent_downloads = max(
        1,
        int(os.environ.get('REELHOUSE_MAX_CONCURRENT_DOWNLOADS', '1')),
    )
except ValueError:
    _max_concurrent_downloads = 1

_download_executor = ThreadPoolExecutor(
    max_workers=_max_concurrent_downloads,
    thread_name_prefix='reelhouse-download',
)


def _job_key(job_id):
    return f'download-job:{job_id}'


def _save_job(job_id, **values):
    with _lock:
        key = _job_key(job_id)
        current = cache.get(key, {})
        current.update(values)
        cache.set(key, current, timeout=_job_timeout)


def get_job(job_id):
    job = cache.get(_job_key(job_id), {})
    return job.copy()


def _progress_hook(job_id):
    def hook(status):
        total = status.get('total_bytes') or status.get('total_bytes_estimate') or 0
        downloaded = status.get('downloaded_bytes') or 0
        percent = int((downloaded / total) * 100) if total else 0

        if status.get('status') == 'downloading':
            _save_job(
                job_id,
                status='downloading',
                percent=max(0, min(percent, 99)),
                speed=status.get('speed'),
                eta=status.get('eta'),
            )
        elif status.get('status') == 'finished':
            _save_job(job_id, status='processing', percent=99)

    return hook


def start_download_job(url, quality):
    job_id = uuid4().hex
    _save_job(job_id, status='queued', percent=0, result=None, error=None)

    def worker():
        try:
            _save_job(job_id, status='downloading', percent=1)
            result = download_video(url, quality=quality, progress_hook=_progress_hook(job_id))
        except DownloadError as exc:
            _save_job(job_id, status='error', percent=0, error=str(exc))
        else:
            _save_job(job_id, status='complete', percent=100, result=result)

    # Free containers have tight memory limits. A bounded executor prevents
    # several ffmpeg/yt-dlp processes from running at the same time while still
    # allowing additional requests to remain queued.
    _download_executor.submit(worker)
    return job_id
