from django.urls import path

from . import views


urlpatterns = [
    path('', views.home, name='home'),
    path('download/', views.download_app, name='download_app'),
    path('youtube/', views.youtube_app, name='youtube_app'),
    path('csrf/', views.csrf_token, name='csrf_token'),
    path('fetch-info/', views.fetch_info, name='fetch_info'),
    path('youtube-search/', views.youtube_search, name='youtube_search'),
    path('youtube-topic/', views.youtube_topic, name='youtube_topic'),
    path('start-download/', views.start_download, name='start_download'),
    path('progress/<str:job_id>/', views.download_progress, name='download_progress'),
]
