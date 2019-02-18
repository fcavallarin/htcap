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

from core.scan.base_scanner import BaseScanner, ScannerThread


class Repeater(BaseScanner):
	def init(self, argv):
		return True


	def get_settings(self):
		return dict(
			request_types = "form,link,redirect,xhr,fetch",
			num_threads = 10
		)


	class Scan(ScannerThread):
		def run(self):
			try:
				self.send_request(ignore_errors=True)
			except Exception as e:
				self.sprint("-->%s" % e)
