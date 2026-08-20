from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.core.cache import cache
from django.test import SimpleTestCase
from django.test import override_settings
from django.urls import reverse

from .forms import DownloadForm
from .jobs import _save_job, get_job
from .services import (
    _base_ydl_options,
    _cache_video_info,
    _cached_video_info,
    _download_format,
    DownloadError,
    download_video,
    extract_shared_url,
    get_video_info,
    normalize_video_url,
    normalize_youtube_url,
    platform_label,
    search_youtube_videos,
    _video_payload,
    youtube_embed_url,
)


class DownloadFormTests(SimpleTestCase):
    def test_form_accepts_youtube_url(self):
        form = DownloadForm({'url': 'https://www.youtube.com/watch?v=abc123'})

        self.assertTrue(form.is_valid())


@override_settings(
    CACHES={
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
            'LOCATION': 'download-job-tests',
        }
    }
)
class DownloadJobTests(SimpleTestCase):
    def setUp(self):
        cache.clear()

    def test_job_updates_keep_existing_state(self):
        _save_job('job-123', status='queued', percent=0)
        _save_job('job-123', status='downloading', percent=42)

        self.assertEqual(
            get_job('job-123'),
            {'status': 'downloading', 'percent': 42},
        )

    def test_unknown_job_returns_empty_state(self):
        self.assertEqual(get_job('missing-job'), {})


@override_settings(FRONTEND_BASE_URL='https://reelhouse.example')
class DownloadPageTests(SimpleTestCase):
    def test_home_page_redirects_to_frontend(self):
        response = self.client.get(reverse('home'))

        self.assertRedirects(
            response,
            'https://reelhouse.example/',
            fetch_redirect_response=False,
        )

    def test_download_app_redirects_to_frontend(self):
        response = self.client.get(reverse('download_app'))

        self.assertRedirects(
            response,
            'https://reelhouse.example/downloader',
            fetch_redirect_response=False,
        )

    def test_youtube_app_redirects_to_frontend(self):
        response = self.client.get(reverse('youtube_app'))

        self.assertRedirects(
            response,
            'https://reelhouse.example/youtube',
            fetch_redirect_response=False,
        )

    @patch('downloader.views.get_video_info')
    def test_fetch_info_returns_video_details(self, mocked_info):
        mocked_info.return_value = {
            'source_url': 'https://www.youtube.com/watch?v=abc123',
            'title': 'Demo video',
            'channel': 'Demo channel',
            'duration': '1:30',
            'thumbnail': 'https://example.com/thumb.jpg',
            'embed_url': 'https://www.youtube.com/embed/abc123',
            'can_embed': True,
            'platform': 'YouTube',
            'qualities': [{'value': '720', 'label': '720p'}],
        }

        response = self.client.post(reverse('fetch_info'), {'url': 'https://www.youtube.com/watch?v=abc123'})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['video']['title'], 'Demo video')

    def test_fetch_info_rejects_invalid_url(self):
        response = self.client.post(reverse('fetch_info'), {'url': 'not-a-url'})

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json(), {'ok': False, 'error': 'Enter a valid video URL.'})

    @patch('downloader.views.get_video_info')
    def test_fetch_info_accepts_social_share_text(self, mocked_info):
        mocked_info.return_value = {'title': 'Shared clip', 'platform': 'TikTok', 'qualities': []}

        response = self.client.post(
            reverse('fetch_info'),
            {'url': 'Watch this https://vm.tiktok.com/ZMexample/ Shared via TikTok'},
        )

        self.assertEqual(response.status_code, 200)
        mocked_info.assert_called_once_with('https://vm.tiktok.com/ZMexample/')

    @patch('downloader.views.start_download_job')
    def test_start_download_returns_job_id(self, mocked_start):
        mocked_start.return_value = 'job-123'

        response = self.client.post(
            reverse('start_download'),
            {'url': 'https://www.youtube.com/watch?v=abc123', 'quality': '720'},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['job_id'], 'job-123')

    def test_start_download_rejects_invalid_url(self):
        response = self.client.post(reverse('start_download'), {'url': 'not-a-url', 'quality': '720'})

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json(), {'ok': False, 'error': 'Enter a valid video URL.'})

    @patch('downloader.views.cancel_download_job')
    def test_cancel_download_returns_success(self, mocked_cancel):
        mocked_cancel.return_value = True

        response = self.client.post(reverse('cancel_download'), {'job_id': 'job-123'})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'ok': True})
        mocked_cancel.assert_called_once_with('job-123')

    @patch('downloader.views.cancel_download_job')
    def test_cancel_download_rejects_unknown_job(self, mocked_cancel):
        mocked_cancel.return_value = False

        response = self.client.post(reverse('cancel_download'), {'job_id': 'missing'})

        self.assertEqual(response.status_code, 404)

    @patch('downloader.views.search_youtube_videos')
    def test_youtube_search_returns_results(self, mocked_search):
        mocked_search.return_value = [
            {
                'id': 'abc123',
                'title': 'Demo video',
                'channel': 'Demo channel',
                'duration': '1:30',
                'thumbnail': 'https://example.com/thumb.jpg',
                'source_url': 'https://www.youtube.com/watch?v=abc123',
            }
        ]

        response = self.client.post(reverse('youtube_search'), {'query': 'demo'})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['videos'][0]['title'], 'Demo video')

    def test_youtube_search_rejects_empty_query(self):
        response = self.client.post(reverse('youtube_search'), {'query': ''})

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json(), {'ok': False, 'error': 'Enter a search term.'})


class YoutubeUrlTests(SimpleTestCase):
    def test_extracts_link_from_social_share_text(self):
        self.assertEqual(
            extract_shared_url('Watch now https://fb.watch/example/. Shared from Facebook'),
            'https://fb.watch/example/',
        )

    @patch('downloader.services.yt_dlp.YoutubeDL')
    def test_video_info_cache_hit_avoids_second_extraction(self, mocked_youtube_dl):
        cache.clear()
        ydl = mocked_youtube_dl.return_value.__enter__.return_value
        info = {
            'id': 'abc123',
            'title': 'Demo video',
            'duration': 90,
            'formats': [{'height': 720, 'vcodec': 'avc1', 'filesize': 1000, 'ext': 'mp4'}],
        }
        ydl.extract_info.return_value = info
        ydl.sanitize_info.return_value = info

        get_video_info('https://youtu.be/abc123?t=4')
        get_video_info('https://www.youtube.com/watch?v=abc123')

        self.assertEqual(ydl.extract_info.call_count, 1)

    def test_normalizes_short_youtube_url(self):
        url = normalize_youtube_url('https://youtu.be/abc123?t=44')

        self.assertEqual(url, 'https://www.youtube.com/watch?v=abc123')

    def test_removes_extra_watch_query_params(self):
        url = normalize_youtube_url('https://www.youtube.com/watch?v=abc123&list=playlist')

        self.assertEqual(url, 'https://www.youtube.com/watch?v=abc123')

    def test_normalizes_shorts_and_embed_urls_to_same_video(self):
        expected = 'https://www.youtube.com/watch?v=abc123'

        self.assertEqual(normalize_youtube_url('https://youtube.com/shorts/abc123?feature=share'), expected)
        self.assertEqual(normalize_youtube_url('https://www.youtube.com/embed/abc123'), expected)

    def test_builds_embed_url(self):
        url = youtube_embed_url('https://youtu.be/abc123?t=44')

        self.assertEqual(url, 'https://www.youtube.com/embed/abc123')

    def test_keeps_non_youtube_url_unchanged(self):
        url = normalize_video_url('https://www.tiktok.com/@demo/video/123')

        self.assertEqual(url, 'https://www.tiktok.com/@demo/video/123')

    def test_non_youtube_does_not_get_youtube_embed(self):
        url = youtube_embed_url('https://www.instagram.com/reel/abc123/')

        self.assertEqual(url, '')

    def test_detects_platform_label(self):
        label = platform_label('https://www.facebook.com/watch/?v=123')

        self.assertEqual(label, 'Facebook')

    @patch('downloader.services.yt_dlp.YoutubeDL')
    def test_video_info_allows_youtube_browser_embed(self, mocked_youtube_dl):
        ydl = mocked_youtube_dl.return_value.__enter__.return_value
        info = {
            'title': 'Demo video',
            'uploader': 'Demo channel',
            'duration': 90,
            'thumbnail': 'https://example.com/thumb.jpg',
            'extractor_key': 'Youtube',
            'webpage_url': 'https://www.youtube.com/watch?v=abc123',
            'formats': [],
        }
        ydl.extract_info.return_value = info
        ydl.sanitize_info.return_value = info

        video = get_video_info('https://www.youtube.com/watch?v=abc123')

        self.assertTrue(video['can_embed'])
        self.assertEqual(
            video['embed_url'],
            'https://www.youtube.com/embed/abc123',
        )
        self.assertTrue(video['qualities'])
        self.assertEqual(video['qualities'][0]['value'], '1080')

    def test_non_youtube_video_does_not_expose_quality_options(self):
        payload = _video_payload(
            {
                'title': 'TikTok clip',
                'extractor_key': 'TikTok',
                'formats': [
                    {'height': 720, 'vcodec': 'h264', 'ext': 'mp4'},
                    {'height': 1080, 'vcodec': 'h264', 'ext': 'mp4'},
                ],
            },
            'https://www.tiktok.com/@creator/video/123',
        )

        self.assertEqual(payload['platform'], 'TikTok')
        self.assertEqual(payload['qualities'], [])


class YtDlpOptionsTests(SimpleTestCase):
    def test_download_format_selects_requested_video_quality(self):
        self.assertIn('height<=720', _download_format('720'))

    def test_download_format_selects_audio_only(self):
        self.assertEqual(_download_format('audio'), 'bestaudio/best')

    def test_enables_node_and_mweb_when_token_provider_is_available(self):
        with TemporaryDirectory() as directory:
            provider_script = Path(directory) / 'build' / 'generate_once.js'
            provider_script.parent.mkdir()
            provider_script.touch()

            with override_settings(
                YTDLP_POT_PROVIDER_DIR=directory,
                YTDLP_PROXY_URL='http://proxy.example:8080',
            ):
                options = _base_ydl_options()

        self.assertIn('node', options['js_runtimes'])
        self.assertEqual(
            options['extractor_args']['youtube']['player_client'],
            ['mweb'],
        )
        self.assertEqual(
            options['extractor_args']['youtubepot-bgutilscript']['server_home'],
            [directory],
        )
        self.assertEqual(options['proxy'], 'http://proxy.example:8080')

    def test_uses_yt_dlp_default_youtube_clients_without_token_provider(self):
        with override_settings(YTDLP_POT_PROVIDER_DIR=''):
            options = _base_ydl_options()

        self.assertNotIn('youtube', options['extractor_args'])

    @override_settings(YTDLP_FORCE_IPV6=True)
    def test_can_force_outbound_ipv6(self):
        options = _base_ydl_options()

        self.assertEqual(options['source_address'], '::')


@override_settings(
    CACHES={
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
            'LOCATION': 'video-info-cache-tests',
        }
    }
)
class CachedVideoDownloadTests(SimpleTestCase):
    def setUp(self):
        cache.clear()

    @patch('downloader.services.yt_dlp.YoutubeDL')
    def test_reuses_preview_info_for_download(self, mocked_youtube_dl):
        source_url = 'https://www.youtube.com/watch?v=abc123'
        cached_info = {'id': 'abc123', 'title': 'Demo video', 'ext': 'mp4'}
        _cache_video_info(source_url, cached_info)

        with TemporaryDirectory() as directory:
            output_file = Path(directory) / 'demo.mp4'
            output_file.write_bytes(b'demo video')
            ydl = mocked_youtube_dl.return_value.__enter__.return_value
            ydl.process_ie_result.return_value = cached_info
            ydl.prepare_filename.return_value = str(output_file)

            with override_settings(MEDIA_ROOT=directory):
                result = download_video(source_url)

        ydl.process_ie_result.assert_called_once_with(cached_info, download=True)
        ydl.extract_info.assert_not_called()
        self.assertEqual(result['filename'], 'demo.mp4')
        self.assertIsNone(_cached_video_info(source_url))

    @patch('downloader.services.yt_dlp.YoutubeDL')
    def test_retries_youtube_download_with_fallback_clients(self, mocked_youtube_dl):
        source_url = 'https://www.youtube.com/watch?v=abc123'
        info = {'id': 'abc123', 'title': 'Demo video', 'ext': 'mp4'}

        with TemporaryDirectory() as directory:
            output_file = Path(directory) / 'demo.mp4'
            output_file.write_bytes(b'demo video')
            ydl = mocked_youtube_dl.return_value.__enter__.return_value
            ydl.process_ie_result.side_effect = DownloadError('ERROR: HTTP Error 403: Forbidden')
            ydl.extract_info.side_effect = [
                DownloadError('ERROR: HTTP Error 403: Forbidden'),
                DownloadError('ERROR: HTTP Error 403: Forbidden'),
                info,
            ]
            ydl.prepare_filename.return_value = str(output_file)

            with override_settings(MEDIA_ROOT=directory):
                result = download_video(source_url)

        self.assertEqual(result['filename'], 'demo.mp4')
        self.assertEqual(mocked_youtube_dl.call_count, 3)
        clients = [
            call.args[0].get('extractor_args', {}).get('youtube', {}).get('player_client')
            for call in mocked_youtube_dl.call_args_list
        ]
        self.assertEqual(clients, [None, ['web_embedded'], ['android_vr']])

    @patch('downloader.services.yt_dlp.YoutubeDL')
    def test_audio_download_returns_generated_mp3(self, mocked_youtube_dl):
        source_url = 'https://www.youtube.com/watch?v=abc123'
        info = {'id': 'abc123', 'title': 'Demo audio', 'ext': 'webm'}

        with TemporaryDirectory() as directory:
            source_file = Path(directory) / 'demo.webm'
            mp3_file = source_file.with_suffix('.mp3')
            mp3_file.write_bytes(b'demo audio')
            ydl = mocked_youtube_dl.return_value.__enter__.return_value
            ydl.extract_info.return_value = info
            ydl.prepare_filename.return_value = str(source_file)

            with override_settings(MEDIA_ROOT=directory):
                result = download_video(source_url, quality='audio')

        self.assertEqual(result['filename'], 'demo.mp3')
        options = mocked_youtube_dl.call_args.args[0]
        self.assertEqual(options['format'], 'bestaudio/best')
        self.assertEqual(
            options['postprocessors'][0]['key'],
            'FFmpegExtractAudio',
        )


class YoutubeSearchTests(SimpleTestCase):
    def setUp(self):
        cache.clear()

    @patch('downloader.services.yt_dlp.YoutubeDL')
    def test_search_youtube_videos_formats_results(self, mocked_youtube_dl):
        ydl = mocked_youtube_dl.return_value.__enter__.return_value
        ydl.extract_info.return_value = {
            'entries': [
                {
                    'id': 'abc123',
                    'title': 'Demo video',
                    'uploader': 'Demo channel',
                    'duration': 90,
                    'thumbnail': 'https://example.com/thumb.jpg',
                    'url': 'abc123',
                }
            ]
        }

        results = search_youtube_videos('demo')

        self.assertEqual(results[0]['duration'], '1:30')
        self.assertEqual(results[0]['source_url'], 'https://www.youtube.com/watch?v=abc123')

    @patch('downloader.services.yt_dlp.YoutubeDL')
    def test_search_youtube_videos_adds_thumbnail_fallback(self, mocked_youtube_dl):
        ydl = mocked_youtube_dl.return_value.__enter__.return_value
        ydl.extract_info.return_value = {
            'entries': [
                {
                    'id': 'abc123',
                    'title': 'Demo video',
                    'url': 'abc123',
                }
            ]
        }

        results = search_youtube_videos('demo')

        self.assertEqual(results[0]['thumbnail'], 'https://i.ytimg.com/vi/abc123/hqdefault.jpg')


class DownloadedFileTests(SimpleTestCase):
    def test_serves_a_completed_download_as_an_attachment(self):
        with TemporaryDirectory() as directory:
            video = Path(directory) / 'demo-video.mp4'
            video.write_bytes(b'demo video content')

            with override_settings(MEDIA_ROOT=directory):
                response = self.client.get(
                    reverse(
                        'downloaded_file',
                        kwargs={'file_path': video.name},
                    )
                )

            self.assertEqual(response.status_code, 200)
            self.assertEqual(
                b''.join(response.streaming_content),
                b'demo video content',
            )
            self.assertIn('attachment;', response['Content-Disposition'])

    def test_missing_download_returns_not_found(self):
        with TemporaryDirectory() as directory:
            with override_settings(MEDIA_ROOT=directory):
                response = self.client.get(
                    reverse(
                        'downloaded_file',
                        kwargs={'file_path': 'missing.mp4'},
                    )
                )

            self.assertEqual(response.status_code, 404)

# Create your tests here.
