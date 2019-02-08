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
import os
import time
import re
import json
import base64
import uuid

from core.lib.exception import *
from core.lib.cookie import Cookie
from core.lib.utils import *
from core.scan.base_scanner import BaseScanner, ScannerThread

class Wapiti(BaseScanner):


	def init(self, argv):
		try:
			self.utils.execmd("wapiti")
		except:
			print "Wapiti executable not found in $PATH"
			self.exit(1)


	def get_settings(self):
		return dict(
			request_types = "xhr,link,form,jsonp,redirect,fetch",
			num_threads = 10
		)


	class Scan(ScannerThread):
		def run(self):
			request = self.request
			tmp_dir = self.tmp_dir
			url = request.url
			# skip check of XSS via POST sice they should be considered CSRF
			if request.method == "POST" and request.data:
				url += "?" + request.data


			out_file = tmp_dir + "/output.json"

			cookie_file = tmp_dir + "/cookies.json"
			with open(cookie_file,'w') as cf:
				jsn = self.convert_cookies(request.cookies)
				cf.write(jsn)


			cmd = [
				"--url", url,
				"--timeout", "30",
				# Set the list of attack modules (modules names separated with commas) to launch against the target.
				# Default behavior (when the option is not set) is to use the most common modules.
				# Common modules can also be specified using the "common" keyword.
				# To launch a scan without launching any attack, just give an empty value (-m "").
				# You can filter on http methods too (only get or post). For example -m "xss:get,exec:post".
				"--module", "xss:get",
				"--scope", "page",
				"--format", "json",
				"--output", out_file,
				"--verify-ssl", "0"
				]

			if self.request.referer:
				cmd.extend(("--header", "Referer:%s" % self.request.referer))

			if self.scanner.proxy:
				proto = self.scanner.proxy['proto']
				if proto.startswith("socks"): proto = "socks"
				cmd.extend(("--proxy", "%s://%s:%s/" % (proto, self.scanner.proxy['host'], self.scanner.proxy['port'])))

			extra_headers = []
			for hn in self.request.extra_headers:
				if hn not in self.scanner.extra_headers:
					extra_headers.append(hn + ":" + self.request.extra_headers[hn])

			for hn in self.scanner.extra_headers:
				extra_headers.append(hn + ":" + self.scanner.extra_headers[hn])

			for header in extra_headers:
				cmd.extend(("--header", header))

			if len(request.cookies) > 0:
				cmd.extend(("--cookie", cookie_file))

			out = None
			try:
				cmd_out = self.utils.execmd("wapiti", cmd)
				out = cmd_out['out']
			except Exception as e:
				self.sprint(e)
			#return cmd

	#def scanner_executed(self, request, out, err, tmp_dir, cmd):
		#out_file = tmp_dir + "/output.json"

			if not os.path.exists(out_file):
				return

			with open(out_file,'r') as fil:
				jsn = fil.read()

			report = []
			try:
				report = json.loads(jsn)['vulnerabilities']['Cross Site Scripting']
			except Exception as e:
				print err

			for vuln in report:
				self.save_vulnerabilities([{"type":'xss_reflected',"description": json.dumps(vuln)}])




		# convert cookies to wapiti format
		def convert_cookies(self, cookies):
			wcookies = {}
			for cookie in cookies:
				domain = cookie.domain
				if domain:
					if not domain.startswith("."): domain = ".%s" % domain
				elif cookie.setter:
					domain = cookie.setter.hostname

				if not domain in wcookies.keys():
					wcookies[domain] = {}

				if not cookie.path in wcookies[domain].keys():
					wcookies[domain][cookie.path] = {}

				wcookies[domain][cookie.path][cookie.name] = dict(
					version = 0,
					expires = cookie.expires,
					secure = cookie.secure,
					value = cookie.value,
					port = None
				)

			return json.dumps(wcookies)