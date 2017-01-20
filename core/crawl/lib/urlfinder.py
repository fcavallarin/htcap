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


class UrlFinder:
    def __init__(self, html):
        self.html = html

    def get_urls(self):
        urls = []

        class UrlHTMLParser(HTMLParser):
            def __init__(self):
                HTMLParser.__init__(self)
                self.base_tag_href = ""

            def handle_starttag(self, tag, attrs):
                # more info about the <base> tag: https://www.w3.org/wiki/HTML/Elements/base
                if tag == "base":
                    for key, val in attrs:
                        if key == "href" and re.match("^https?://", val, re.I):
                            self.base_tag_href = val.strip()

                elif tag == "a":
                    for key, val in attrs:
                        if key == "href":
                            if re.match("^https?://", val, re.I):
                                urls.extend([val])
                            elif not re.match("^[a-z]+:", val, re.I) and not val.startswith("#"):
                                urls.extend(['{}{}'.format(self.base_tag_href, val)])

        try:
            parser = UrlHTMLParser()
            parser.feed(self.html)
        except:
            raise

        return urls
