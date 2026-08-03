import logging
from time import perf_counter
from uuid import uuid4


logger = logging.getLogger('downloader.performance')


class PerformanceTimingMiddleware:
    """Low-overhead endpoint timing with a request correlation ID."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request_id = request.headers.get('X-Request-ID') or f'req-{uuid4().hex[:12]}'
        started = perf_counter()
        logger.info('request=%s phase=received method=%s path=%s', request_id, request.method, request.path)
        try:
            response = self.get_response(request)
        except Exception:
            logger.exception(
                'request=%s phase=error path=%s duration_ms=%.1f',
                request_id, request.path, (perf_counter() - started) * 1000,
            )
            raise
        response['X-Request-ID'] = request_id
        logger.info(
            'request=%s phase=response_sent path=%s status=%s duration_ms=%.1f',
            request_id, request.path, response.status_code, (perf_counter() - started) * 1000,
        )
        return response
