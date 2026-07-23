# YouTube restricted downloads

Some YouTube videos cannot be downloaded anonymously. If a video needs sign-in,
age confirmation, region access, or your account session, give yt-dlp cookies.

Option 1: export cookies to a file

1. Export YouTube cookies from your browser as Netscape format.
2. Save the file as `youtube_cookies.txt` in this project folder.
3. Restart the Django server.

Option 2: read cookies from a browser

Start the server with one of these environment variables:

```bash
YTDLP_COOKIES_FROM_BROWSER=chrome python3 manage.py runserver 127.0.0.1:8010
YTDLP_COOKIES_FROM_BROWSER=firefox python3 manage.py runserver 127.0.0.1:8010
```

If you use a custom cookie file path:

```bash
YTDLP_COOKIE_FILE=/path/to/cookies.txt python3 manage.py runserver 127.0.0.1:8010
```

Do not share or commit cookies. They can contain account session data.

## Hosted container (Railway)

The deployed container cannot read cookies from the browser on your own
computer. Export Netscape-format cookies and add their complete contents as a
secret environment variable named:

```text
YTDLP_COOKIE_CONTENT
```

The container writes this secret to its configured cookie file when it starts.
Never commit this value or show it in logs or screenshots. YouTube may reject
cookies used from a different IP address, and using account cookies with a
downloader can put that account at risk.
