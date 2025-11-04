from scrapy import logformatter

class PoliteLogFormatter(logformatter.LogFormatter):
    """
    Custom log formatter that prevents logging item content to avoid huge log files.
    Only logs item metadata (URL, type) instead of full content.
    """

    def scraped(self, item, response, spider):
        """
        Called when an item is scraped.
        Override to prevent logging the full item content.
        """
        # Only log basic info, NOT the item content
        if hasattr(item, 'get') and 'url' in item:
            return {
                'level': logformatter.INFO,
                'msg': f"Scraped item from: {item.get('url', 'unknown')}",
                'args': {}
            }
        return {
            'level': logformatter.INFO,
            'msg': "Scraped item (URL not available)",
            'args': {}
        }

    def dropped(self, item, exception, response, spider):
        """
        Called when an item is dropped.
        Override to prevent logging the full item content.
        """
        return {
            'level': logformatter.WARNING,
            'msg': f"Dropped item: {exception}",
            'args': {}
        }
