from pathlib import Path
import json

from django.conf import settings
from django.http import FileResponse, Http404, JsonResponse
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.shortcuts import redirect
from django.views.decorators.csrf import csrf_exempt, ensure_csrf_cookie
from django.views.decorators.http import require_POST
from django.urls import reverse
from urllib.parse import urlencode
from urllib.request import Request as UrlRequest, urlopen
from urllib.error import HTTPError, URLError
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from .forms import DownloadForm
from .models import SearchHistory
from .jobs import get_job, start_download_job
from .services import DownloadError, get_video_info, search_youtube_playlists, search_youtube_videos


INVALID_URL_ERROR = 'Enter a valid video URL.'


def _request_data(request):
    """Read both browser form posts and the JSON requests used by the web app."""
    if request.POST:
        return request.POST

    content_type = request.headers.get('Content-Type', '')
    if 'application/json' in content_type:
        try:
            payload = json.loads(request.body or '{}')
        except (TypeError, ValueError):
            return {}
        return payload if isinstance(payload, dict) else {}

    return {}


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


def _account_payload(request):
    if not request.user.is_authenticated:
        return {'authenticated': False, 'user': None, 'searches': []}
    return {
        'authenticated': True,
        'user': {'id': request.user.id, 'email': request.user.email, 'name': request.user.get_full_name() or request.user.username},
        'searches': list(SearchHistory.objects.filter(user=request.user).values_list('query', flat=True)[:20]),
    }


@csrf_exempt
@require_POST
def account_register(request):
    data = _request_data(request)
    email = str(data.get('email', '')).strip().lower()
    password = str(data.get('password', ''))
    name = str(data.get('name', '')).strip()
    if not email or '@' not in email or not password:
        return JsonResponse({'ok': False, 'error': 'Enter a valid email and password.'}, status=400)
    if User.objects.filter(email__iexact=email).exists():
        return JsonResponse({'ok': False, 'error': 'An account with this email already exists.'}, status=409)
    try:
        validate_password(password)
    except ValidationError as exc:
        return JsonResponse({'ok': False, 'error': ' '.join(exc.messages)}, status=400)
    user = User.objects.create_user(username=email, email=email, password=password, first_name=name[:150])
    login(request, user)
    return JsonResponse({'ok': True, **_account_payload(request)})


@csrf_exempt
@require_POST
def account_login(request):
    data = _request_data(request)
    email = str(data.get('email', '')).strip().lower()
    user = authenticate(request, username=email, password=str(data.get('password', '')))
    if user is None:
        return JsonResponse({'ok': False, 'error': 'Email or password is incorrect.'}, status=401)
    login(request, user)
    return JsonResponse({'ok': True, **_account_payload(request)})


def account_me(request):
    return JsonResponse({'ok': True, **_account_payload(request)})


@csrf_exempt
@require_POST
def account_logout(request):
    logout(request)
    return JsonResponse({'ok': True, 'authenticated': False, 'user': None, 'searches': []})


@csrf_exempt
@require_POST
def account_search(request):
    if not request.user.is_authenticated:
        return JsonResponse({'ok': False, 'error': 'Sign in to save searches.'}, status=401)
    query = str(_request_data(request).get('query', '')).strip()
    if query:
        SearchHistory.objects.update_or_create(user=request.user, query=query, defaults={})
    return JsonResponse({'ok': True})


def google_start(request):
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        return JsonResponse({'ok': False, 'error': 'Google sign-in is not configured on the server.'}, status=503)
    params = {
        'client_id': settings.GOOGLE_CLIENT_ID,
        'redirect_uri': settings.GOOGLE_REDIRECT_URI,
        'response_type': 'code',
        'scope': 'openid email profile',
        'access_type': 'online',
        'prompt': 'select_account',
    }
    return redirect('https://accounts.google.com/o/oauth2/v2/auth?' + urlencode(params))


def google_callback(request):
    error = request.GET.get('error')
    if error:
        return redirect(f"{settings.FRONTEND_BASE_URL}/account?error=google_{error}")
    code = request.GET.get('code', '')
    if not code or not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        return redirect(f'{settings.FRONTEND_BASE_URL}/account?error=google_configuration')
    try:
        body = urlencode({
            'code': code,
            'client_id': settings.GOOGLE_CLIENT_ID,
            'client_secret': settings.GOOGLE_CLIENT_SECRET,
            'redirect_uri': settings.GOOGLE_REDIRECT_URI,
            'grant_type': 'authorization_code',
        }).encode()
        token_request = UrlRequest(
            'https://oauth2.googleapis.com/token',
            data=body,
            headers={'Content-Type': 'application/x-www-form-urlencoded'},
        )
        with urlopen(token_request, timeout=15) as response:
            token_payload = json.loads(response.read().decode())
        claims = id_token.verify_oauth2_token(
            token_payload['id_token'], google_requests.Request(), settings.GOOGLE_CLIENT_ID,
        )
        email = str(claims.get('email', '')).lower().strip()
        if not email or not claims.get('email_verified'):
            raise ValueError('Google did not return a verified email address.')
        user, created = User.objects.get_or_create(
            email__iexact=email,
            defaults={
                'username': email,
                'email': email,
                'first_name': str(claims.get('name', ''))[:150],
            },
        )
        if created:
            user.set_unusable_password()
            user.save(update_fields=['password'])
        login(request, user)
        return redirect(f'{settings.FRONTEND_BASE_URL}/account?google=success')
    except (KeyError, ValueError, HTTPError, URLError, TimeoutError) as exc:
        return redirect(f'{settings.FRONTEND_BASE_URL}/account?error=google_auth_failed')


@csrf_exempt
@require_POST
def fetch_info(request):
    form = DownloadForm(_request_data(request))
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
    query = str(_request_data(request).get('query', '')).strip()
    if not query:
        return JsonResponse({'ok': False, 'error': 'Enter a search term.'}, status=400)

    try:
        videos = search_youtube_videos(query)
        playlists = search_youtube_playlists(query)
    except DownloadError as exc:
        return JsonResponse({'ok': False, 'error': str(exc)}, status=400)

    return JsonResponse({'ok': True, 'videos': videos, 'playlists': playlists})


@csrf_exempt
@require_POST
def youtube_topic(request):
    topic = str(_request_data(request).get('topic', '')).strip()
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
    data = _request_data(request)
    url = str(data.get('url', '')).strip()
    quality = str(data.get('quality', 'best')).strip() or 'best'
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
