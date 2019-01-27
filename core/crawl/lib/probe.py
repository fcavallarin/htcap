# -*- coding: utf-8 -*- 

"""
HTCAP - beta 1
Author: filippo.cavallarin@wearesegment.com

This program is free software; you can redistribute it and/or modify it under 
the terms of the GNU General Public License as published by the Free Software 
Foundation; either version 2 of the License, or (at your option) any later 
version.
"""

import json
from core.lib.request import Request
from core.lib.cookie import Cookie
from core.constants import *
from core.lib.texthash import TextHash

class Probe:

	def __init__(self, data, parent):
		self.status = "ok"
		self.requests = []
		self.cookies = []
		self.redirect = None;
		# if True the probe returned no error BUT the json is not closed properly
		self.partialcontent = False
		self.html = None
		self.user_output = []
		self.page_hash = 0

		status = data.pop()

		if status['status'] == "error":
			self.status = "error"
			self.errcode = status['code']


		if "partialcontent" in status:
			self.partialcontent = status['partialcontent']

		# grap cookies before creating rquests
		for key,val in data:
			if key == "cookies":
				for cookie in val:
					self.cookies.append(Cookie(cookie, parent.url))

		if "redirect" in status:
			self.redirect = status['redirect']
			r = Request(REQTYPE_REDIRECT, "GET", self.redirect, parent=parent, set_cookie=self.cookies, parent_db_id=parent.db_id)
			self.requests.append(r)

		for key,val in data:
			if key == "request":
				trigger = val['trigger'] if 'trigger' in val else None
				extra_headers = val['extra_headers'] if 'extra_headers' in val else None
				#try:
				r = Request(val['type'], val['method'], val['url'], parent=parent, set_cookie=self.cookies, data=val['data'], trigger=trigger, parent_db_id=parent.db_id, extra_headers=extra_headers)
				self.requests.append(r)
				#except Exception as e:
				#	pass
			elif key == "html":
				self.html = val
			elif key == "page_hash":
				page_hash = TextHash(val).hash
				self.page_hash = page_hash if page_hash else 0
			elif key == "user":
				self.user_output.append(val)



	# @TODO handle cookies set by ajax (in probe too)
