# -*- coding: utf-8 -*-

"""
HTCAP - beta 1
Author: filippo.cavallarin@wearesegment.com

This program is free software; you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation; either version 2 of the License, or (at your option) any later
version.
"""

from __future__ import unicode_literals

import re
from core.scan.base_scanner import BaseScanner, ScannerThread


class Ck401(BaseScanner):
	def init(self, argv):
		return True

	def get_settings(self):
		return dict(
			request_types = "link,redirect,xhr,form,fetch",
			num_threads = 10
		)


	class Scan(ScannerThread):
		def run(self):
			try:
				resp = self.send_request(proxy="http:127.0.0.1:8080", ignore_errors=True)
				if resp and resp['code'] == 401 and not re.search("action\[login\]", resp['body']):
					self.save_vulnerabilities([{"type":'cross-session',"description": "just a test"}])
			except Exception as e:
				self.sprint("-->%s" % e)
