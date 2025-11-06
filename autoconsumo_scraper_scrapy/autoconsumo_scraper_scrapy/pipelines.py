import os
import hashlib
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from urllib.parse import urlparse

from scrapy.pipelines.files import FilesPipeline

from autoconsumo_scraper_scrapy.activity_log import write_activity

SAFE_CHARS = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_")

def sanitize_component(value: str) -> str:
    """Normaliza el componente del nombre de archivo para sistemas de ficheros Windows/Linux."""
    sanitized = ''.join(ch if ch in SAFE_CHARS else '_' for ch in value)
    sanitized = sanitized.strip('_')
    return sanitized or "index"

class TextFilePipeline:
    def __init__(self):
        self.file_counter = {}

    def process_item(self, item, spider):
        storage_path = spider.settings.get('TEXT_FILES_STORE')
        if not storage_path:
            spider.logger.warning("TEXT_FILES_STORE setting is not set.")
            return item
        activity_log_path = getattr(spider, 'activity_log_path', None) or spider.settings.get('ACTIVITY_LOG_FILE')

        # Create directory if it doesn't exist
        os.makedirs(storage_path, exist_ok=True)

        # Generate unique filename from URL using hash
        url = item['url']
        url_hash = hashlib.md5(url.encode('utf-8')).hexdigest()[:8]
        url_path = urlparse(url).path
        base_filename = os.path.basename(url_path) or "index"

        # Remove extension if present
        base_filename_no_ext = os.path.splitext(base_filename)[0]
        base_filename_no_ext = sanitize_component(base_filename_no_ext)

        # Create unique filename with hash to avoid collisions
        unique_base = f"{base_filename_no_ext}_{url_hash}"

        # Save text file if available
        if item.get('text'):
            text_filename = f"{unique_base}.txt"
            text_filepath = os.path.join(storage_path, text_filename)

            # Write text to file (NO logging the content, just the action)
            with open(text_filepath, 'w', encoding='utf-8') as f:
                # Write URL as first line for reference
                f.write(f"URL: {url}\n")
                f.write("=" * 80 + "\n\n")
                f.write(item['text'])

            # Log only the filename, NOT the content
            spider.logger.info(f"✓ Text saved: {text_filename}")
            write_activity(
                activity_log_path,
                'Download',
                'INFO',
                f"Texto guardado: {text_filename}",
                url_index=item.get('source_index')
            )

        # Save HTML file if available
        if item.get('html'):
            html_filename = f"{unique_base}.html"
            html_filepath = os.path.join(storage_path, html_filename)

            # Write HTML to file (NO logging the content)
            with open(html_filepath, 'w', encoding='utf-8') as f:
                f.write(item['html'])

            # Log only the filename, NOT the content
            spider.logger.info(f"✓ HTML saved: {html_filename}")
            write_activity(
                activity_log_path,
                'Download',
                'INFO',
                f"HTML guardado: {html_filename}",
                url_index=item.get('source_index')
            )

        return item


class FilteredFilesPipeline(FilesPipeline):
    def __init__(self, store_uri=None, download_func=None, settings=None):
        super().__init__(store_uri, download_func=download_func, settings=settings)
        self.filter_start = self._parse_iso_datetime(settings.get('FILTER_START_DATE') if settings else None, is_end=False)
        self.filter_end = self._parse_iso_datetime(settings.get('FILTER_END_DATE') if settings else None, is_end=True)

    @classmethod
    def from_crawler(cls, crawler):
        pipeline = super().from_crawler(crawler)
        pipeline.filter_start = pipeline._parse_iso_datetime(crawler.settings.get('FILTER_START_DATE'), is_end=False)
        pipeline.filter_end = pipeline._parse_iso_datetime(crawler.settings.get('FILTER_END_DATE'), is_end=True)
        return pipeline

    def _parse_iso_datetime(self, value, is_end=False):
        if not value:
            return None
        try:
            dt = datetime.fromisoformat(value)
        except ValueError:
            return None
        if is_end and dt.tzinfo is None:
            dt = dt.replace(hour=23, minute=59, second=59, microsecond=999999)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        else:
            dt = dt.astimezone(timezone.utc)
        return dt

    def _normalize_http_datetime(self, value):
        if not value:
            return None
        try:
            dt = parsedate_to_datetime(value.decode('latin1') if isinstance(value, bytes) else value)
        except (TypeError, ValueError):
            return None
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)

    def _describe_datetime(self, dt):
        if not dt:
            return 'sin fecha'
        return dt.astimezone(timezone.utc).isoformat()

    def _is_within_range(self, dt):
        if dt is None:
            return True
        if self.filter_start and dt < self.filter_start:
            return False
        if self.filter_end and dt > self.filter_end:
            return False
        return True

    def get_media_requests(self, item, info):
        requests = list(super().get_media_requests(item, info))
        log_index = item.get('source_index')
        for req in requests:
            if log_index is not None:
                req.meta['log_index'] = log_index
        return requests

    def media_downloaded(self, response, request, info, *, item=None):
        if not self.filter_start and not self.filter_end:
            return super().media_downloaded(response, request, info, item=item)

        dt = self._normalize_http_datetime(response.headers.get('Last-Modified'))
        if dt and not self._is_within_range(dt):
            message = f"Descarga omitida por fecha (Last-Modified {self._describe_datetime(dt)}): {request.url}"
            spider = info.spider
            if spider:
                spider.logger.info(message)
                activity_log_path = getattr(spider, 'activity_log_path', None)
                if activity_log_path:
                    write_activity(
                        activity_log_path,
                        'Download',
                        'INFO',
                        message,
                        url_index=request.meta.get('log_index')
                    )
            self.inc_stats(info.spider, 'filtered_out_of_range')
            return {
                "url": request.url,
                "path": None,
                "checksum": None,
                "status": "filtered-out"
            }

        return super().media_downloaded(response, request, info, item=item)

    def item_completed(self, results, item, info):
        filtered_results = [
            (ok, result)
            for ok, result in results
            if not (ok and isinstance(result, dict) and result.get('status') == 'filtered-out')
        ]
        return super().item_completed(filtered_results, item, info)
