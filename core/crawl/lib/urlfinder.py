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
			def handle_starttag(self, tag, attrs):
				if tag == "a":
					#urls.extend([attr[1] for attr in attrs if attr[0] == "href" and attr[1] != ""])
					#urls.extend([val for key,val in attrs if key == "href" and val != ""])
					urls.extend([val for key,val in attrs if key == "href" and (re.match("^https?://", val, re.I) or (not re.match("^[a-z]+:", val, re.I) and not val.startswith("#")))])
			
		try:
			parser = UrlHTMLParser()
			parser.feed(self.html)
		except:
			raise

		
		return urls
