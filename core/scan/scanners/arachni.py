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
import urllib
import getopt
import datetime

from core.lib.exception import *
from core.lib.cookie import Cookie

from core.scan.base_scanner import BaseScanner, ScannerThread
from core.lib.shell import CommandExecutor
from core.lib.utils import *

class Arachni(BaseScanner):

	def init(self, argv):

		self.skip_duplicates = True
		self.execute_command = True
		self.audit_both_methods = False
		self.arachni_bin = None
		self.acmd = "arachni"
		self.rcmd = "arachni_reporter"

		try:
			opts, args = getopt.getopt(argv, 'hspbx:')
		except getopt.GetoptError as err:
			print str(err)
			self.exit(1)

		for o, v in opts:
			if o == '-h':
				self.usage()
				self.exit(0)
			elif o == '-s':
				self.skip_duplicates = False
			elif o == '-p':
				self.execute_command = False
			elif o == '-b':
				self.audit_both_methods = False
			elif o == '-x':
				self.arachni_bin = v


		if self.arachni_bin:
			self.acmd = os.path.join(self.arachni_bin, self.acmd)
			self.rcmd = os.path.join(self.arachni_bin, self.rcmd)

		try:
			self.utils.execmd(self.acmd)
		except:
			print "arachni executable not found %s" % self.acmd
			self.exit(1)
		try:
			self.utils.execmd(self.rcmd)
		except:
			print "arachni_reporter executable not found"
			self.exit(1)


	def usage(self):
		print (	"htcap arachni module\nusage: scan arachni <db_file> [options]\n"
				"Options are:\n"
				"  -h       this help\n"
				"  -s       do not skip duplicated urls\n"
				"  -p       print first command and exit\n"
				"  -b       set audit-with-both-methods arachni option\n"
				"  -x PATH  set arachni bin dir (by default is's supposed to be in $PATH)"
			)

	def get_settings(self):
		return dict(
			request_types = "xhr,link,form,jsonp,redirect,fetch",
			num_threads = 5,
			process_timeout = 180
		)

	# return False to skip current request
	#def get_cmd(self, request, tmp_dir):
	class Scan(ScannerThread):

		#def scan(self, request):
		def run(self):
			out_file = self.tmp_dir + "/report"

			if self.scanner.skip_duplicates and self.is_request_duplicated():
				return False

			timeout = str(datetime.timedelta(seconds=(self.scanner.settings['process_timeout'] - 5)))

			cmd = [
				#"--checks", "sql_injection*",
				"--checks", "code_injection*,file_inclusion*,path_traversal*,rfi*,xss*,xxe*", # "xss*",
				"--output-only-positives",
				"--http-request-concurrency", "1",
				"--http-request-timeout", "10000",
				"--timeout", timeout, #"00:03:00",
				"--scope-dom-depth-limit", "0",
				"--scope-directory-depth-limit", "0",
				"--scope-page-limit", "1",
				"--report-save-path", out_file,
				"--snapshot-save-path", "/dev/null",
				"--daemon-friendly"
				]

			if self.scanner.audit_both_methods:
				cmd.append("--audit-with-both-methods")

			if self.request.referer:
				cmd.extend(['--http-request-header', 'Referer=%s' % self.request.referer])

			if len(self.request.cookies) > 0:
				cmd.extend(["--http-cookie-string", "; ".join(["%s=%s" % (c.name, c.value) for c in self.request.cookies])])

			if self.scanner.proxy:
				cmd.extend(['--http-proxy-type', self.scanner.proxy['proto']])
				cmd.extend(['--http-proxy', '%s:%s' % (self.scanner.proxy['host'], self.scanner.proxy['port'])])

			extra_headers = []
			for hn in self.request.extra_headers:
				if hn not in self.scanner.extra_headers:
					extra_headers.append(hn + "=" + self.request.extra_headers[hn])

			for hn in self.scanner.extra_headers:
				extra_headers.append(hn + "=" + self.scanner.extra_headers[hn])

			for header in extra_headers:
				cmd.extend(("--http-request-header", header))

			cmd.append(self.request.url)

			if not self.scanner.execute_command:
				print cmd_to_str(self.scanner.acmd + cmd)
				self.exit(0)
				return False

			out = None
			#self.sprint(cmd_to_str(cmd))
			self.sprint("Scanning %s %s" % (self.request.method, self.request.url))
			try:
				cmd_out = self.utils.execmd(self.scanner.acmd, cmd)
				# self.sprint(cmd_out['out'])
				# self.sprint(cmd_out['err'])
				# self.sprint(cmd_out['returncode'])
				out = cmd_out['out']
			except Exception as e:
				self.sprint(e)

			if not os.path.isfile(out_file):
				return

			json_file = self.tmp_dir + "/report.json"
			try:
				cmd_out = self.utils.execmd(self.scanner.rcmd, ["--reporter", "json:outfile=%s" % json_file, out_file])
			except Exception as e:
				print "%s" % e

			if cmd_out['err']:
				print ">>> error exporting arachni to json: %s %s" % (cmd_out['err'], self.request.url)
				return

			if not os.path.isfile(json_file):
				return

			with open(json_file,'r') as fil:
				jsn = fil.read()

			report = []
			try:
				report = json.loads(jsn)
			except Exception as e:
				print err

			issues = report['issues']

			for i in issues:
				ref = i['references']['OWASP'] if i['references'] and 'OWASP' in i['references'] else "N/A"
				req = "N/A"
				req = None

				if 'request' in i:
					req = i['request']
				elif 'variations' in i and len(i['variations']) > 0:
					req = i['variations'][0]['request']


				fields = (i['name'], ref, i['severity'], req['headers_string'] if req else "N/A")
				descr = "D E T A I L S\n\nName:       %s\nReference:  %s\nSeverity:   %s\n\n\nR E Q U E S T\n\n%s" % fields

				if req and req['method'] == "post":
					descr += "%s" % urllib.urlencode(req['body'])
				self.save_vulnerabilities([{"type":i['check']['shortname'], "description": descr}])
				#self.save_vulnerability(request, i['check']['shortname'], descr)



