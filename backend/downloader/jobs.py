from threading import Lock, Thread
from uuid import uuid4

from django.core.cache import cache

from .services import DownloadError, download_video


_lock = Lock()
_job_timeout = 24 * 60 * 60


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

    Thread(target=worker, daemon=True).start()
    return job_id
