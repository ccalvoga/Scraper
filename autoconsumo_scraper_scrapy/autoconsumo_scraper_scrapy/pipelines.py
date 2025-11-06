import os
import hashlib
from urllib.parse import urlparse

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
