from django.urls import path

from . import views


urlpatterns = [
    path('', views.home, name='home'),
    path('download/', views.download_app, name='download_app'),
    path('youtube/', views.youtube_app, name='youtube_app'),
    path('csrf/', views.csrf_token, name='csrf_token'),
    path('account/register/', views.account_register, name='account_register'),
    path('account/login/', views.account_login, name='account_login'),
    path('account/me/', views.account_me, name='account_me'),
    path('account/logout/', views.account_logout, name='account_logout'),
    path('account/search/', views.account_search, name='account_search'),
    path('account/google/start/', views.google_start, name='google_start'),
    path('account/google/callback/', views.google_callback, name='google_callback'),
    path('fetch-info/', views.fetch_info, name='fetch_info'),
    path('youtube-search/', views.youtube_search, name='youtube_search'),
    path('youtube-topic/', views.youtube_topic, name='youtube_topic'),
    path('start-download/', views.start_download, name='start_download'),
    path('progress/<str:job_id>/', views.download_progress, name='download_progress'),
    path('media/<path:file_path>', views.downloaded_file, name='downloaded_file'),
]
