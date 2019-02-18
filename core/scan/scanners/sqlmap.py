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
import sys
import time
import re
import json
import base64
import uuid
import getopt

import threading

from urlparse import urlparse, urljoin, parse_qs, parse_qsl, urlsplit

from core.lib.exception import *
from core.lib.cookie import Cookie

from core.scan.base_scanner import BaseScanner, ScannerThread
from core.lib.utils import *



class Sqlmap(BaseScanner):

	def init(self, argv):
		self.skip_duplicates = True

		try:
			opts, args = getopt.getopt(argv, 'hs')
		except getopt.GetoptError as err:
			print str(err)
			self.exit(1)

		for o, v in opts:
			if o == '-h':
				self.usage()
				self.exit(0)
			elif o == '-s':
				self.skip_duplicates = False

		try:
			self.utils.execmd("sqlmap")
		except:
			print "Sqlmap executable not found in $PATH"
			self.exit(1)




	def usage(self):
		print (	"htcap sqlmap module\nusage: scan sqlmap <db_file> [options]\n"
				"Options are:\n"
				"  -h   this help\n"
				"  -s   do not skip duplicated urls\n"
			)

	def get_settings(self):
		return dict(
			request_types = "xhr,link,form,jsonp,redirect,fetch",
			num_threads = 5,
			process_timeout = 300,
			scanner_exe = "/usr/share/sqlmap/sqlmap.py"
		)



	class Scan(ScannerThread):
		def run(self):
			if self.scanner.skip_duplicates and self.is_request_duplicated():
				return False

			if self.request.method == "GET":
				purl = urlsplit(self.request.url)
				if not purl.query:
					return False

			self.sprint("Scanning %s" % self.request.url)
			out_dir = self.tmp_dir + "/tmp"
			if not os.path.exists(out_dir):
				os.makedirs(out_dir, 0700)

			cookie_file = self.tmp_dir + "/cookies.json"
			with open(cookie_file,'w') as cf:
				for c in self.request.cookies:
					cf.write(c.get_as_netscape() + "\n")

			cmd = [
				"--batch",
				"-u", self.request.url,
				"-v", "0",
				"--disable-coloring",
				"--text-only",
				"--purge",
				"-o",
				"--crawl=0",
				"--output-dir", out_dir
				]

			if self.request.referer:
				cmd.extend(("--referer", self.request.referer))

			if len(self.request.cookies) > 0:
				cmd.extend(("--load-cookies", cookie_file))

			if self.request.method == "POST":
				cmd.extend(("--method", "POST"))
				if self.request.data:
					cmd.extend(("--data", self.request.data))

			if self.scanner.proxy:
				cmd.extend(("--proxy", "%s://%s:%s" % (self.scanner.proxy['proto'], self.scanner.proxy['host'], self.scanner.proxy['port'])))

			extra_headers = []
			if self.request.extra_headers:
				for hn in self.request.extra_headers:
					if hn not in self.scanner.extra_headers:
						extra_headers.append(hn + ":" + self.request.extra_headers[hn])

				for hn in self.scanner.extra_headers:
					extra_headers.append(hn + ":" + self.scanner.extra_headers[hn])

				if len(extra_headers) > 0:
					cmd.extend(("--headers", "\n".join(extra_headers)))

			out = None
			#self.sprint(cmd_to_str(cmd))
			try:
				cmd_out = self.utils.execmd("sqlmap", cmd)
				# self.sprint(cmd_out['out'])
				# self.sprint(cmd_out['err'])
				# self.sprint(cmd_out['returncode'])
				out = cmd_out['out']
			except Exception as e:
				self.sprint(e)

			if out:
				descr = "C O M M A N D\n\n%s\n\nD E T A I L S\n\n" % cmd_to_str(cmd)
				report = re.findall(r'---([^]]*)---', out)
				if len(report) == 0:
					return
				for vuln in report:
					descr += vuln + "\n"

				self.save_vulnerabilities([{"type":'sqli',"description": descr}])
				#self.save_vulnerability(request, "sqli", descr)

