from pathlib import Path

from django.conf import settings
from django.http import FileResponse, Http404, JsonResponse
from django.shortcuts import redirect
from django.views.decorators.csrf import csrf_exempt, ensure_csrf_cookie
from django.views.decorators.http import require_POST

from .forms import DownloadForm
from .jobs import get_job, start_download_job
from .services import DownloadError, get_video_info, search_youtube_videos


INVALID_URL_ERROR = 'Enter a valid video URL.'


def frontend_redirect(path=''):
    return redirect(f"{settings.FRONTEND_BASE_URL}/{path.lstrip('/')}")


def home(request):
    return frontend_redirect()


def download_app(request):
    return frontend_redirect('downloader')


def youtube_app(request):
    return frontend_redirect('youtube')


@ensure_csrf_cookie
def csrf_token(request):
    return JsonResponse({'ok': True})


@csrf_exempt
@require_POST
def fetch_info(request):
    form = DownloadForm(request.POST)
    if not form.is_valid():
        return JsonResponse({'ok': False, 'error': INVALID_URL_ERROR}, status=400)

    try:
        info = get_video_info(form.cleaned_data['url'])
    except DownloadError as exc:
        return JsonResponse({'ok': False, 'error': str(exc)}, status=400)

    return JsonResponse({'ok': True, 'video': info})


@csrf_exempt
@require_POST
def youtube_search(request):
    query = request.POST.get('query', '').strip()
    if not query:
        return JsonResponse({'ok': False, 'error': 'Enter a search term.'}, status=400)

    try:
        videos = search_youtube_videos(query)
    except DownloadError as exc:
        return JsonResponse({'ok': False, 'error': str(exc)}, status=400)

    return JsonResponse({'ok': True, 'videos': videos})


@csrf_exempt
@require_POST
def youtube_topic(request):
    topic = request.POST.get('topic', '').strip()
    topic_queries = {
        'All': 'popular videos Pakistan',
        'Music': 'latest music videos',
        'Pakistani dramas': 'Pakistani dramas latest episode',
        'News': 'latest Pakistan news',
        'T-Series': 'T-Series latest songs',
        'Atif Aslam': 'Atif Aslam songs',
        'Gaming': 'gaming videos',
        'Mixes': 'music mixes',
        'Live': 'live streams',
    }

    query = topic_queries.get(topic)
    if not query:
        return JsonResponse({'ok': False, 'error': 'Unknown topic.'}, status=400)

    try:
        videos = search_youtube_videos(query)
    except DownloadError as exc:
        return JsonResponse({'ok': False, 'error': str(exc)}, status=400)

    return JsonResponse({'ok': True, 'topic': topic, 'query': query, 'videos': videos})


@csrf_exempt
@require_POST
def start_download(request):
    url = request.POST.get('url', '').strip()
    quality = request.POST.get('quality', 'best').strip() or 'best'
    form = DownloadForm({'url': url})

    if not form.is_valid():
        return JsonResponse({'ok': False, 'error': INVALID_URL_ERROR}, status=400)

    job_id = start_download_job(form.cleaned_data['url'], quality)
    return JsonResponse({'ok': True, 'job_id': job_id})


def download_progress(request, job_id):
    job = get_job(job_id)
    if not job:
        return JsonResponse({'ok': False, 'error': 'Download job was not found.'}, status=404)

    return JsonResponse({'ok': True, 'job': job})


def downloaded_file(request, file_path):
    media_root = Path(settings.MEDIA_ROOT).resolve()
    requested_file = (media_root / file_path).resolve()

    try:
        requested_file.relative_to(media_root)
    except ValueError as exc:
        raise Http404('Downloaded file was not found.') from exc

    if not requested_file.is_file():
        raise Http404('Downloaded file was not found.')

    return FileResponse(
        requested_file.open('rb'),
        as_attachment=True,
        filename=requested_file.name,
    )
