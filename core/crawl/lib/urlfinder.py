# -*- coding: utf-8 -*- 

"""
HTCAP - beta 1
Author: filippo.cavallarin@wearesegment.com

This program is free software; you can redistribute it and/or modify it under 
the terms of the GNU General Public License as published by the Free Software 
Foundation; either version 2 of the License, or (at your option) any later 
version.
"""

import re
from HTMLParser import HTMLParser
from urlparse import urljoin, urlparse


class UrlFinder:
    def __init__(self, html):
        self.html = html

    def get_urls(self):

        try:
            parser = UrlHTMLParser()
            parser.feed(self.html)
        except:
            raise

        return parser.urls


class UrlHTMLParser(HTMLParser):
    def __init__(self):

        HTMLParser.__init__(self)
        self.base_url = ""
        self.urls = []

    def handle_starttag(self, tag, attrs):
        # more info about the <base> tag: https://www.w3.org/wiki/HTML/Elements/base
        if tag == "base":
            for key, val in attrs:
                if key == "href":
                    self.base_url = urlparse(val.strip()).geturl()

        elif tag == "a":
            for key, val in attrs:
                if key == "href":
                    if re.match("^https?://", val, re.I):
                        self.urls.extend([val])
                    elif not re.match("^[a-z]+:", val, re.I) and not val.startswith("#"):
                        self.urls.extend([urljoin(self.base_url, val)])
