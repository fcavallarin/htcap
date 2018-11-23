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

from core.scan.base_scanner import BaseScanner
from core.lib.shell import CommandExecutor
from core.lib.utils import *

class Arachni(BaseScanner):

	def init(self, argv):
		# scanner_exe is converted to array to handle something like "python /usr/bin/scanner"
		self.reporter = "%s%sarachni_reporter" % (os.path.dirname(self.settings['scanner_exe'][-1]), os.sep)
		if not os.path.exists(self.reporter):
			print "Error finding arachni_reporter: %s" % self.reporter
			self.exit(1)

		self.skip_duplicates = True
		self.execute_command = True
		self.audit_both_methods = False

		try:
			opts, args = getopt.getopt(argv, 'hspb')
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



	def usage(self):
		print (	"htcap arachni module\nusage: scan arachni <db_file> [options]\n"
				"Options are:\n"
				"  -h   this help\n"
				"  -s   do not skip duplicated urls\n"
				"  -p   print first command and exit\n"
				"  -b   set audit-with-both-methods arachni option\n"
			)

	def get_settings(self):
		return dict(
			request_types = "xhr,link,form,jsonp,redirect,fetch",
			num_threads = 5,
			process_timeout = 180,
			scanner_exe = "/usr/share/arachni/bin/arachni"
			#scanner_exe = "/usr/bin/arachni"
		)

	# return False to skip current request
	def get_cmd(self, request, tmp_dir):
		out_file = tmp_dir + "/report"

		if self.skip_duplicates and self.is_request_duplicated(request):
			return False

		timeout = str(datetime.timedelta(seconds=(self.settings['process_timeout']-5)))

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
			#"--http-proxy-type", "socks5",
			#"--http-proxy","127.0.0.1:9150"
			]

		if self.audit_both_methods:
			cmd.append("--audit-with-both-methods")

		if request.referer:
			cmd.extend(['--http-request-header', 'Referer=%s' % request.referer])

		if len(request.cookies) > 0:
			cmd.extend(["--http-cookie-string", "; ".join(["%s=%s" % (c.name,c.value) for c in request.cookies])])

		cmd.append(request.url)

		if not self.execute_command:
			print cmd_to_str(self.settings['scanner_exe'] + cmd)
			self.exit(0)
			return False

		return cmd

	def scanner_executed(self, request, out, err, tmp_dir, cmd):
		out_file = tmp_dir + "/report"

		if not os.path.isfile(out_file):
			return

		json_file = tmp_dir + "/report.json"

		cmd = [self.reporter, "--reporter", "json:outfile=%s" % json_file, out_file]
		exe = CommandExecutor(cmd, True)
		out, err = exe.execute(30)

		if err:
			print ">>> error exporting arachni to json: %s %s" % (err, request.url)
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

			self.save_vulnerability(request, i['check']['shortname'], descr)



