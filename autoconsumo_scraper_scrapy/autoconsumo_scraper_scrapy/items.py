import scrapy


class AutoconsumoScraperScrapyItem(scrapy.Item):
    url = scrapy.Field()
    text = scrapy.Field()
    html = scrapy.Field()
    file_urls = scrapy.Field()
    files = scrapy.Field()