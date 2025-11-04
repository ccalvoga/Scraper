import scrapy
import os
import unicodedata
from urllib.parse import urljoin, urlparse
from autoconsumo_scraper_scrapy.items import AutoconsumoScraperScrapyItem
from autoconsumo_scraper_scrapy.activity_log import write_activity

def normalize_text(text: str) -> str:
    text_norm = unicodedata.normalize('NFD', text)
    stripped = ''.join(
        c for c in text_norm if unicodedata.category(c) != 'Mn'
    )
    return stripped.lower()

class GenericSpider(scrapy.Spider):
    name = "generic_spider"
    # allowed_domains se configurará dinámicamente en __init__

    def __init__(self, start_urls, keywords_map=None, exclusions_map=None, max_depth=3,
                 crawl_strategy='continue', file_types=None, download_scope='same-domain',
                 path_restriction='base-path', save_page_text=True, save_html=True,
                 status_updater=None, activity_log_path=None,
                 *args, **kwargs):
        super(GenericSpider, self).__init__(*args, **kwargs)
        self.start_urls = start_urls
        self.keywords_map = keywords_map or {}
        self.exclusions_map = exclusions_map or {}
        self.max_depth = int(max_depth)

        # Configuraciones avanzadas
        self.crawl_strategy = crawl_strategy  # 'continue' or 'stop'
        self.file_types = file_types or ['documents']
        self.download_scope = download_scope  # 'same-domain' or 'any-domain'
        self.path_restriction = path_restriction  # 'base-path' or 'same-domain'
        self.save_page_text = save_page_text
        self.save_html = save_html
        self.status_updater = status_updater
        self.activity_log_path = activity_log_path
        self._processed_roots = set()

        # Extraer dominios únicos de las start_urls
        self.allowed_domains = list(set([urlparse(url).netloc for url in start_urls if url]))

        # Construir extensiones de archivo permitidas según file_types
        self.recognized_exts = self._build_file_extensions()

        self.logger.info(f"Allowed domains: {self.allowed_domains}")
        self.logger.info(f"Crawl strategy: {self.crawl_strategy}")
        self.logger.info(f"File types: {self.file_types}")
        self.logger.info(f"Download scope: {self.download_scope}")
        self.logger.info(f"Path restriction: {self.path_restriction}")
        self.logger.info(f"Recognized file extensions: {self.recognized_exts}")

    def _build_file_extensions(self):
        """Construye el set de extensiones permitidas según file_types"""
        extensions = set()

        if 'documents' in self.file_types:
            extensions.update({'.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'})

        if 'images' in self.file_types:
            extensions.update({'.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.bmp'})

        if 'archives' in self.file_types:
            extensions.update({'.zip', '.rar', '.7z', '.tar', '.gz', '.bz2'})

        if 'other' in self.file_types:
            extensions.update({'.txt', '.csv', '.json', '.xml', '.md'})

        return extensions

    def parse(self, response, current_depth=0):
        if current_depth == 0:
            is_new_root = response.url not in self._processed_roots
            if is_new_root:
                self._processed_roots.add(response.url)
                if self.status_updater:
                    try:
                        self.status_updater(len(self._processed_roots), response.url)
                    except Exception as exc:
                        self.logger.debug(f"Status updater error: {exc}")
                write_activity(
                    self.activity_log_path,
                    'Spider',
                    'INFO',
                    f"Analizando URL raíz: {response.url}"
                )

        # Extract text
        raw_text = ' '.join(response.css('body *::text').getall())
        page_text_norm = normalize_text(raw_text)

        # Check for exclusions
        if self.exclusions_map:
            for norm_exc, orig_exc in self.exclusions_map.items():
                if norm_exc in page_text_norm:
                    self.logger.info(f"Exclusion keyword '{orig_exc}' found on {response.url}. Stopping this branch.")
                    write_activity(
                        self.activity_log_path,
                        'Spider',
                        'WARNING',
                        f"Exclusión: {orig_exc} en {response.url}"
                    )
                    return

        # Check for keywords
        keywords_on_page = set()
        has_keywords = False
        if self.keywords_map:
            for norm_kw, orig_kw in self.keywords_map.items():
                if norm_kw in page_text_norm:
                    keywords_on_page.add(orig_kw)
                    has_keywords = True

        # Save page content if keywords found
        if has_keywords:
            self.logger.info(f"✓ Keywords found: {', '.join(keywords_on_page)} | URL: {response.url}")
            write_activity(
                self.activity_log_path,
                'Spider',
                'INFO',
                f"Términos encontrados: {', '.join(sorted(keywords_on_page))} en {response.url}"
            )
            item = AutoconsumoScraperScrapyItem()
            item['url'] = response.url

            # Guardar texto si está habilitado (NO loguear el contenido)
            if self.save_page_text:
                item['text'] = raw_text
            else:
                item['text'] = None

            # Guardar HTML si está habilitado (NO loguear el contenido)
            if self.save_html:
                item['html'] = response.text
            else:
                item['html'] = None

            item['file_urls'] = []
            yield item

        # Determine if we should continue crawling
        should_continue_crawling = True
        if self.crawl_strategy == 'stop' and not has_keywords:
            should_continue_crawling = False
            self.logger.info(f"No keywords found on {response.url}. Stopping this branch (crawl_strategy=stop).")
            write_activity(
                self.activity_log_path,
                'Spider',
                'INFO',
                f"Sin términos en {response.url}; rama detenida (estrategia=stop)"
            )

        # Follow links
        if should_continue_crawling and current_depth < self.max_depth:
            current_url_parsed = urlparse(response.url)
            base_path = os.path.dirname(current_url_parsed.path)

            for link in response.css('a::attr(href)').getall():
                parsed_href = urljoin(response.url, link)
                target_parsed = urlparse(parsed_href)
                target_domain = target_parsed.netloc
                target_path = target_parsed.path

                # Check domain restriction
                if target_domain not in self.allowed_domains:
                    continue

                # Check path restriction
                if self.path_restriction == 'base-path':
                    # Only follow links within the base directory
                    if not target_path.startswith(base_path):
                        continue
                # If 'same-domain', no path restriction needed (already checked domain)

                yield scrapy.Request(
                    parsed_href,
                    callback=self.parse,
                    cb_kwargs={'current_depth': current_depth + 1}
                )

        # Find and download files (only if page has keywords)
        if has_keywords:
            for link in response.css('a::attr(href)').getall():
                parsed_href = urljoin(response.url, link)
                file_ext = os.path.splitext(urlparse(parsed_href).path)[1].lower()

                if file_ext in self.recognized_exts:
                    # Check download scope
                    file_domain = urlparse(parsed_href).netloc
                    current_domain = urlparse(response.url).netloc

                    if self.download_scope == 'same-domain' and file_domain != current_domain:
                        self.logger.debug(f"Skipping file from different domain: {parsed_href}")
                        continue

                    # Download file
                    write_activity(
                        self.activity_log_path,
                        'Spider',
                        'INFO',
                        f"Descarga programada: {parsed_href}"
                    )
                    item = AutoconsumoScraperScrapyItem()
                    item['file_urls'] = [parsed_href]
                    self.logger.info(f"Downloading file: {parsed_href}")
                    yield item
