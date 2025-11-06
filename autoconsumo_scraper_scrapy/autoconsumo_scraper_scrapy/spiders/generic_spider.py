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
    handle_httpstatus_list = [301, 302, 400, 401, 403, 404, 500]

    def __init__(self, start_urls, keywords_map=None, exclusions_map=None, max_depth=3,
                 crawl_strategy='continue', file_types=None, download_scope='same-domain',
                 path_restriction='base-path', save_page_text=True, save_html=True,
                 status_updater=None, activity_log_path=None, source_lookup=None,
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
        self.source_lookup = source_lookup or {}

        # Extraer dominios únicos de las start_urls
        self.allowed_domains = list(set([urlparse(url).netloc for url in start_urls if url]))

        # Construir extensiones de archivo permitidas según file_types
        self.recognized_exts = self._build_file_extensions()
        self.content_type_map = {
            'application/pdf': '.pdf',
            'application/msword': '.doc',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
            'application/vnd.ms-excel': '.xls',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
            'application/vnd.ms-powerpoint': '.ppt',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
            'text/plain': '.txt',
            'text/csv': '.csv',
            'application/json': '.json',
            'application/xml': '.xml',
            'text/markdown': '.md'
        }

        self.logger.info(f"Allowed domains: {self.allowed_domains}")
        self.logger.info(f"Crawl strategy: {self.crawl_strategy}")
        self.logger.info(f"File types: {self.file_types}")
        self.logger.info(f"Download scope: {self.download_scope}")
        self.logger.info(f"Path restriction: {self.path_restriction}")
        self.logger.info(f"Recognized file extensions: {self.recognized_exts}")

    def start_requests(self):
        for url in self.start_urls:
            info = self.source_lookup.get(url, {})
            index = info.get('index')
            meta = {
                'source_index': index,
                'log_index': index + 1,
                'root_url': url
            }
            yield scrapy.Request(
                url,
                callback=self.parse,
                cb_kwargs={'current_depth': 0},
                meta=meta
            )

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

    def _resolve_extension_from_content_type(self, response):
        content_type_raw = response.headers.get('Content-Type')
        if not content_type_raw:
            return None
        try:
            content_type = content_type_raw.decode('latin1')
        except Exception:
            content_type = content_type_raw.decode('utf-8', errors='ignore')
        content_type = content_type.split(';')[0].strip().lower()
        return self.content_type_map.get(content_type)

    def _is_direct_file_response(self, response):
        parsed_path = urlparse(response.url).path or ''
        file_ext = os.path.splitext(parsed_path)[1].lower()
        if file_ext and file_ext in self.recognized_exts:
            return True
        resolved_ext = self._resolve_extension_from_content_type(response)
        if resolved_ext and resolved_ext in self.recognized_exts:
            return True
        return False

    def _handle_direct_file(self, response, log_index=None):
        status = getattr(response, 'status', 200)
        write_activity(
            self.activity_log_path,
            'Scrapy',
            'INFO',
            f"Procesando fichero directo (HTTP {status}): {response.url}",
            url_index=log_index
        )
        if status >= 400:
            write_activity(
                self.activity_log_path,
                'Download',
                'ERROR',
                f"Descarga fallida (HTTP {status}): {response.url}",
                url_index=log_index
            )
            self.logger.warning(f"Direct file request failed with status {status}: {response.url}")
        else:
            write_activity(
                self.activity_log_path,
                'Download',
                'INFO',
                f"Descarga programada: {response.url}",
                url_index=log_index
            )
            item = AutoconsumoScraperScrapyItem()
            item['url'] = response.url
            item['source_index'] = log_index
            item['file_urls'] = [response.url]
            self.logger.info(f"Queued direct file for download: {response.url}")
            yield item

    def parse(self, response, current_depth=0):
        source_index = response.meta.get('source_index')
        log_index = response.meta.get('log_index')
        if log_index is None and isinstance(source_index, int):
            log_index = source_index + 1
            response.meta['log_index'] = log_index
        if current_depth == 0:
            is_new_root = response.url not in self._processed_roots
            if is_new_root:
                self._processed_roots.add(response.url)
                if self.status_updater:
                    try:
                        self.status_updater(len(self._processed_roots), response.url, current_depth + 1)
                    except Exception as exc:
                        self.logger.debug(f"Status updater error: {exc}")
                write_activity(
                    self.activity_log_path,
                    'Spider',
                    'INFO',
                    f"Analizando URL raíz: {response.url}",
                    url_index=log_index
                )

        if self._is_direct_file_response(response):
            yield from self._handle_direct_file(response, log_index=log_index)
            return

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
                        f"Exclusión: {orig_exc}",
                        url_index=log_index
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
                f"Términos encontrados: {', '.join(sorted(keywords_on_page))}",
                url_index=log_index
            )
            item = AutoconsumoScraperScrapyItem()
            item['url'] = response.url
            item['source_index'] = log_index

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
                f"Sin términos en {response.url}; rama detenida (estrategia=stop)",
                url_index=log_index
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

                new_meta = response.meta.copy()
                yield scrapy.Request(
                    parsed_href,
                    callback=self.parse,
                    cb_kwargs={'current_depth': current_depth + 1},
                    meta=new_meta
                )

        # Find and download files (only if page has keywords)
        if has_keywords:
            for link in response.css('a::attr(href)').getall():
                parsed_href = urljoin(response.url, link)
                parsed_path = urlparse(parsed_href).path
                file_ext = os.path.splitext(parsed_path)[1].lower()

                if file_ext in self.recognized_exts:
                    file_name = os.path.basename(parsed_path)
                    file_display = file_name or parsed_path or parsed_href

                    if self.exclusions_map:
                        normalized_name = normalize_text(file_name or '')
                        skip_file = False
                        for norm_exc, orig_exc in self.exclusions_map.items():
                            if norm_exc and norm_exc in normalized_name:
                                skip_file = True
                                write_activity(
                                    self.activity_log_path,
                                    'Download',
                                    'INFO',
                                    f"Descarga omitida por exclusión ({orig_exc}): {file_display}",
                                    url_index=log_index
                                )
                                break
                        if skip_file:
                            continue

                    # Check download scope
                    file_domain = urlparse(parsed_href).netloc
                    current_domain = urlparse(response.url).netloc

                    if self.download_scope == 'same-domain' and file_domain != current_domain:
                        self.logger.debug(f"Skipping file from different domain: {parsed_href}")
                        continue

                    # Download file
                    write_activity(
                        self.activity_log_path,
                        'Download',
                        'INFO',
                        f"Descarga programada: {parsed_href}",
                        url_index=log_index
                    )
                    item = AutoconsumoScraperScrapyItem()
                    item['url'] = parsed_href
                    item['source_index'] = log_index
                    item['file_urls'] = [parsed_href]
                    self.logger.info(f"Downloading file: {parsed_href}")
                    yield item
