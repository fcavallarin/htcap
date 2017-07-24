# -*- coding: utf-8 -*- 

"""
HTCAP - beta 1
Author: filippo.cavallarin@wearesegment.com

This program is free software; you can redistribute it and/or modify it under 
the terms of the GNU General Public License as published by the Free Software 
Foundation; either version 2 of the License, or (at your option) any later 
version.
"""



class CrawlResult:
	def __init__(self, request, found_requests = None, errors = None, page_hash = 0):
		self.request = request
		self.found_requests = found_requests if found_requests else []
		self.errors = errors if errors else []
		self.page_hash = page_hash

