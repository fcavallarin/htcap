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


class Ck401(BaseScanner):
	def init(self, argv):
		return True
	
	def get_settings(self):
		return dict(			
			request_types = "link,redirect,xhr,form,fetch", 
			num_threads = 10,
			process_timeout = 20 ,
			scanner_exe = "/usr/bin/env curl"
		)

	def get_cmd(self, request, tmp_dir):
		#cookies = ["%s=%s" % (c.name,c.value) for c in request.cookies]
		#cookies_str = " -H 'Cookie: %s'" % " ;".join(cookies) if len(cookies) > 0 else ""
		method = ["-X", "POST"] if request.method == "POST" else []
		referer = ["-H", "'Referer: %s'" % request.referer] if request.referer else []
		data = ["--data", "'%s'" % request.data] if request.data else []
		
	
		cmd = [ "-i" ] + referer + method + data + [request.url]		
		# print " ".join(cmd)
		# return False

		return cmd

	def scanner_executed(self, request, out, err, tmp_dir, cmd):
		if not re.search("^HTTP/1.1 401 Unauthorized", out) and not re.search("action\[login\]",out):			
			self.save_vulnerability(request, "cross-session", " ".join(cmd)+ "\n" + out)
		