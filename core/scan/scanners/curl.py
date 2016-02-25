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
from core.scan.base_scanner import BaseScanner


class Curl(BaseScanner):
	def init(self, argv):
		return True
	
	def get_settings(self):
		return dict(			
			request_types = "link,redirect", 
			num_threads = 10,
			process_timeout = 20 ,
			scanner_exe = "/usr/bin/env curl"
		)

	def get_cmd(self, request, tmp_dir):
		cmd = [ "-I", request.url]		
		print self.scanner_name
		
		return cmd

	def scanner_executed(self, request, out, err, tmp_dir, cmd):
		if not re.search("^X-XSS-Protection\:", out, re.M):			
			self.save_vulnerability(request, "xss-portection-missing", "X-XSS-Protection header is not set")
		