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

from core.scan.base_scanner import BaseScanner
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



	def usage(self):
		print (	"htcap sqlmap module\nusage: scan sqlmap <db_file> [options]\n"
				"Options are:\n"
				"  -h   this help\n"
				"  -s   do not skip duplicated urls\n"
			)

	def get_settings(self):
		return dict(
			request_types = "xhr,link,form,jsonp,redirect",
			num_threads = 5,
			process_timeout = 300,
			scanner_exe = "/usr/share/sqlmap/sqlmap.py"
		)

	# return False to skip current request
	def get_cmd(self, request, tmp_dir):

		if self.skip_duplicates and self.is_request_duplicated(request):
			return False

		if request.method == "GET":
			purl = urlsplit(request.url)
			if not purl.query:
				return False

		#print request.url

		out_dir = tmp_dir + "/tmp"
		if not os.path.exists(out_dir):
			os.makedirs(out_dir, 0700)

		cookie_file = tmp_dir + "/cookies.json"
		with open(cookie_file,'w') as cf:
			for c in request.cookies:
				cf.write(c.get_as_netscape() + "\n")

		cmd = [
			"--batch",
			"-u", request.url,
			"-v", "0",
			"--disable-coloring",
			"--text-only",
			"--purge-output",
			"-o",
			"--crawl=0",
			"--output-dir", out_dir
			]

		if request.referer:
			cmd.extend(("--referer", request.referer))

		if len(request.cookies) > 0:
			cmd.extend(("--load-cookies", cookie_file))

		if request.method == "POST":
			cmd.extend(("--method","POST"))
			if request.data:
				cmd.extend(("--data",request.data))


		return cmd

	def scanner_executed(self, request, out, err, tmp_dir, cmd):
		# print cmd_to_str(cmd)
		if not out:return

		descr = "C O M M A N D\n\n%s\n\nD E T A I L S\n\n" % cmd_to_str(cmd)
		report = re.findall(r'---([^]]*)---', out)
		if len(report) == 0: return
		for vuln in report:
			descr += vuln + "\n"

		self.save_vulnerability(request, "sqli", descr)

