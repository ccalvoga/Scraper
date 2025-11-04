import scrapy
import os
import unicodedata
from urllib.parse import urljoin, urlparse
from autoconsumo_scraper_scrapy.items import AutoconsumoScraperScrapyItem

def normalize_text(text: str) -> str:
    text_norm = unicodedata.normalize('NFD', text)
    stripped = ''.join(
        c for c in text_norm if unicodedata.category(c) != 'Mn'
    )
    return stripped.lower()

class MitecoSpider(scrapy.Spider):
    name = "miteco"
    # allowed_domains se configurará dinámicamente en __init__

    def __init__(self, start_urls, keywords_map=None, exclusions_map=None, max_depth=3, *args, **kwargs):
        super(MitecoSpider, self).__init__(*args, **kwargs)
        self.start_urls = start_urls
        self.keywords_map = keywords_map or {}
        self.exclusions_map = exclusions_map or {}
        self.max_depth = int(max_depth)

        # Extraer dominios únicos de las start_urls
        self.allowed_domains = list(set([urlparse(url).netloc for url in start_urls if url]))
        self.logger.info(f"Allowed domains: {self.allowed_domains}")

    def parse(self, response, current_depth=0):
        # Extract text
        raw_text = ' '.join(response.css('body *::text').getall())
        page_text_norm = normalize_text(raw_text)

        # Check for exclusions
        if self.exclusions_map:
            for norm_exc, orig_exc in self.exclusions_map.items():
                if norm_exc in page_text_norm:
                    self.logger.info(f"Exclusion keyword '{orig_exc}' found on {response.url}. Stopping this branch.")
                    return

        # Check for keywords
        keywords_on_page = set()
        if self.keywords_map:
            for norm_kw, orig_kw in self.keywords_map.items():
                if norm_kw in page_text_norm:
                    keywords_on_page.add(orig_kw)
        
        if keywords_on_page:
            self.logger.info(f"Keywords found on {response.url}: {', '.join(keywords_on_page)}")
            item = AutoconsumoScraperScrapyItem()
            item['url'] = response.url
            item['text'] = raw_text
            item['file_urls'] = []
            yield item

        # Follow links
        if current_depth < self.max_depth:
            base_path = os.path.dirname(urlparse(response.url).path)
            for link in response.css('a::attr(href)').getall():
                parsed_href = urljoin(response.url, link)
                target_domain = urlparse(parsed_href).netloc
                target_path = urlparse(parsed_href).path

                # Verificar si el dominio está permitido y el path está dentro del directorio base
                if target_domain in self.allowed_domains and target_path.startswith(base_path):
                    yield scrapy.Request(
                        parsed_href,
                        callback=self.parse,
                        cb_kwargs={'current_depth': current_depth + 1}
                    )

        # Find and download files
        for link in response.css('a::attr(href)').getall():
            parsed_href = urljoin(response.url, link)
            file_ext = os.path.splitext(urlparse(parsed_href).path)[1].lower()
            recognized_exts = {'.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'}

            if file_ext in recognized_exts:
                link_text_norm = normalize_text(response.xpath(f'//a[@href="{link}"]//text()').get() or '')
                should_download = False
                if self.keywords_map:
                    for norm_kw in self.keywords_map.keys():
                        if norm_kw in link_text_norm or norm_kw in page_text_norm:
                            should_download = True
                            break
                
                if should_download:
                    item = AutoconsumoScraperScrapyItem()
                    item['file_urls'] = [parsed_href]
                    yield item