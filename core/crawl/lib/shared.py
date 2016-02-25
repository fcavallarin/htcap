# -*- coding: utf-8 -*- 

"""
HTCAP - beta 1
Author: filippo.cavallarin@wearesegment.com

This program is free software; you can redistribute it and/or modify it under 
the terms of the GNU General Public License as published by the Free Software 
Foundation; either version 2 of the License, or (at your option) any later 
version.
"""


class Shared:
	"""
	data shared between threads
	"""
	
	starturl = ""
	results = []	
	pending_urls = set()
	crawled_requests = set()
	valid_urls = set()
	allowed_domains = set()
	excluded_urls = set()	
	urls_tree = dict()
	th_lock = None	
	th_condition = None
	start_cookies = []

	database = None
	th_lock_db = None

	options = {}

	requests = []
	requests_index = 0

	
	

