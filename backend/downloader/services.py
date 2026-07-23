from hashlib import sha256
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import yt_dlp
from django.conf import settings
from django.core.cache import cache


class DownloadError(Exception):
    pass


_info_cache_timeout = 10 * 60


def _info_cache_key(url):
    digest = sha256(url.encode('utf-8')).hexdigest()
    return f'video-info:{digest}'


def _cache_video_info(url, info):
    cache.set(_info_cache_key(url), info, timeout=_info_cache_timeout)


def _cached_video_info(url):
    return cache.get(_info_cache_key(url))


def _cookie_options():
    options = {}
    cookie_file = Path(getattr(settings, 'YTDLP_COOKIE_FILE', ''))
    cookies_from_browser = getattr(settings, 'YTDLP_COOKIES_FROM_BROWSER', '')

    if cookie_file.is_file():
        options['cookiefile'] = str(cookie_file)
    elif cookies_from_browser:
        options['cookiesfrombrowser'] = (cookies_from_browser,)

    return options


def _base_ydl_options():
    extractor_args = {
        'generic': {
            'impersonate': ['chrome'],
        },
        'youtube': {
            'player_client': ['web_embedded', 'mweb'],
        },
    }
    pot_provider_dir = Path(getattr(settings, 'YTDLP_POT_PROVIDER_DIR', ''))
    if (pot_provider_dir / 'build' / 'generate_once.js').is_file():
        extractor_args['youtubepot-bgutilscript'] = {
            'server_home': [str(pot_provider_dir)],
        }

    options = {
        'quiet': True,
        'no_warnings': True,
        'retries': 5,
        'fragment_retries': 5,
        'socket_timeout': 30,
        'js_runtimes': {
            'node': {},
        },
        'extractor_args': extractor_args,
        'http_headers': {
            'Accept-Language': 'en-US,en;q=0.9',
        },
        **_cookie_options(),
    }
    proxy_url = getattr(settings, 'YTDLP_PROXY_URL', '')
    if proxy_url:
        options['proxy'] = proxy_url
    return options


def _download_error_message(error):
    message = str(error)
    lowered = message.lower()

    if any(term in lowered for term in ('sign in', 'age', 'confirm your age', 'private video', 'cookies')):
        return (
            'YouTube did not allow this server to access the video. It may be private, restricted, '
            'or blocked for this hosting address. Try another public video, or configure the '
            'YTDLP_COOKIE_CONTENT or YTDLP_PROXY_URL secret.'
        )

    if any(term in lowered for term in ('not available', 'unavailable', 'region', 'copyright')):
        return 'This video is not available to this server because of region, copyright, or account restrictions.'

    return message


def normalize_youtube_url(url):
    parsed = urlparse(url.strip())

    if parsed.netloc in {'youtu.be', 'www.youtu.be'}:
        video_id = parsed.path.strip('/').split('/')[0]
        if video_id:
            return f'https://www.youtube.com/watch?v={video_id}'

    if parsed.netloc in {'youtube.com', 'www.youtube.com', 'm.youtube.com'}:
        query = parse_qs(parsed.query)
        video_id = query.get('v', [''])[0]
        if video_id:
            return f'https://www.youtube.com/watch?v={video_id}'

    return url.strip()


def is_youtube_url(url):
    parsed = urlparse(url.strip())
    host = parsed.netloc.lower()
    return host in {'youtu.be', 'www.youtu.be', 'youtube.com', 'www.youtube.com', 'm.youtube.com'}


def normalize_video_url(url):
    if is_youtube_url(url):
        return normalize_youtube_url(url)
    return url.strip()


def platform_label(url, extractor_key=''):
    parsed = urlparse(url.strip())
    host = parsed.netloc.lower().replace('www.', '')

    if 'youtube.com' in host or 'youtu.be' in host:
        return 'YouTube'
    if 'tiktok.com' in host:
        return 'TikTok'
    if 'instagram.com' in host:
        return 'Instagram'
    if 'facebook.com' in host or 'fb.watch' in host:
        return 'Facebook'
    if extractor_key:
        return extractor_key
    return host or 'Video'


def youtube_embed_url(url):
    if not is_youtube_url(url):
        return ''

    parsed = urlparse(normalize_youtube_url(url))
    query = parse_qs(parsed.query)
    video_id = query.get('v', [''])[0]
    if not video_id:
        return ''

    return f'https://www.youtube.com/embed/{video_id}'


def _format_filesize(size):
    if not size:
        return 'Unknown size'

    return f'{round(size / (1024 * 1024), 1)} MB'


def _duration_label(duration):
    if not duration:
        return 'Unknown duration'

    minutes, seconds = divmod(int(duration), 60)
    hours, minutes = divmod(minutes, 60)
    if hours:
        return f'{hours}:{minutes:02d}:{seconds:02d}'
    return f'{minutes}:{seconds:02d}'


def _quality_options(info):
    options_by_height = {}

    for item in info.get('formats', []):
        height = item.get('height')
        if not height or item.get('vcodec') == 'none':
            continue

        filesize = item.get('filesize') or item.get('filesize_approx')
        existing = options_by_height.get(height)
        if existing and (existing.get('filesize') or 0) >= (filesize or 0):
            continue

        options_by_height[height] = {
            'value': str(height),
            'label': f'{height}p',
            'extension': item.get('ext') or 'mp4',
            'filesize': filesize,
            'filesize_label': _format_filesize(filesize),
        }

    qualities = sorted(options_by_height.values(), key=lambda item: int(item['value']), reverse=True)
    return qualities[:8]


def get_video_info(url):
    cleaned_url = normalize_video_url(url)
    options = {
        **_base_ydl_options(),
        'noplaylist': True,
        'skip_download': True,
    }

    try:
        with yt_dlp.YoutubeDL(options) as ydl:
            info = ydl.extract_info(cleaned_url, download=False)
            _cache_video_info(cleaned_url, ydl.sanitize_info(info))
    except Exception as exc:
        raise DownloadError(_download_error_message(exc)) from exc

    qualities = _quality_options(info)
    if not qualities:
        qualities = [{'value': 'best', 'label': 'Best available', 'extension': 'mp4', 'filesize_label': 'Unknown size'}]

    can_embed = is_youtube_url(cleaned_url)

    return {
        'source_url': cleaned_url,
        'title': info.get('title') or 'Untitled video',
        'channel': info.get('uploader') or info.get('channel') or 'Unknown channel',
        'duration': _duration_label(info.get('duration')),
        'thumbnail': info.get('thumbnail'),
        'embed_url': youtube_embed_url(cleaned_url) if can_embed else '',
        'can_embed': can_embed,
        'platform': platform_label(cleaned_url, info.get('extractor_key') or ''),
        'webpage_url': info.get('webpage_url') or cleaned_url,
        'qualities': qualities,
    }


def search_youtube_videos(query, limit=12):
    clean_query = query.strip()
    if not clean_query:
        raise DownloadError('Enter a search term.')

    search_limit = max(1, min(int(limit), 20))
    options = {
        **_base_ydl_options(),
        'extract_flat': True,
        'skip_download': True,
    }

    try:
        with yt_dlp.YoutubeDL(options) as ydl:
            info = ydl.extract_info(f'ytsearch{search_limit}:{clean_query}', download=False)
    except Exception as exc:
        raise DownloadError(_download_error_message(exc)) from exc

    results = []
    for item in info.get('entries') or []:
        video_id = item.get('id') or ''
        url = item.get('url') or item.get('webpage_url') or ''
        if video_id and not url.startswith('http'):
            url = f'https://www.youtube.com/watch?v={video_id}'

        if not url:
            continue

        thumbnail = item.get('thumbnail') or ''
        if not thumbnail and video_id:
            thumbnail = f'https://i.ytimg.com/vi/{video_id}/hqdefault.jpg'

        results.append({
            'id': video_id,
            'title': item.get('title') or 'Untitled video',
            'channel': item.get('uploader') or item.get('channel') or 'Unknown channel',
            'duration': _duration_label(item.get('duration')),
            'thumbnail': thumbnail,
            'source_url': normalize_youtube_url(url),
        })

    return results


def _download_format(quality):
    if not quality or quality == 'best':
        return 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best'

    return (
        f'bestvideo[height<={quality}][ext=mp4]+bestaudio[ext=m4a]/'
        f'best[height<={quality}][ext=mp4]/best[height<={quality}]/best'
    )


def download_video(url, quality='best', progress_hook=None):
    media_root = Path(settings.MEDIA_ROOT)
    media_root.mkdir(parents=True, exist_ok=True)

    cleaned_url = normalize_video_url(url)
    options = {
        **_base_ydl_options(),
        'format': _download_format(quality),
        'merge_output_format': 'mp4',
        'outtmpl': str(media_root / '%(title).180B [%(id)s].%(ext)s'),
        'noplaylist': True,
        'restrictfilenames': True,
    }
    if progress_hook:
        options['progress_hooks'] = [progress_hook]

    try:
        with yt_dlp.YoutubeDL(options) as ydl:
            cached_info = _cached_video_info(cleaned_url)
            if cached_info:
                info = ydl.process_ie_result(cached_info, download=True)
            else:
                info = ydl.extract_info(cleaned_url, download=True)
            filepath = Path(ydl.prepare_filename(info))
    except Exception as exc:
        raise DownloadError(_download_error_message(exc)) from exc
    else:
        cache.delete(_info_cache_key(cleaned_url))

    mp4_path = filepath.with_suffix('.mp4')
    if mp4_path.exists():
        filepath = mp4_path

    if not filepath.exists():
        raise DownloadError('The download finished, but the output file was not found.')

    relative_path = filepath.relative_to(media_root)
    return {
        'title': info.get('title') or filepath.stem,
        'filename': filepath.name,
        'file_url': f'{settings.MEDIA_URL}{relative_path.as_posix()}',
        'filesize_mb': round(filepath.stat().st_size / (1024 * 1024), 2),
        'source_url': cleaned_url,
    }
