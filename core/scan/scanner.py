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
import os
import glob
import importlib

from core.lib.exception import *
from core.lib.cookie import Cookie
from core.lib.utils import *
from base_scanner import BaseScanner
from core.lib.database import Database

class Scanner:

	def get_modules_file(self, path):
		files = glob.glob(os.path.join(path, "*.py"))
		return [os.path.basename(m).split(".")[0] for m in files if not m.endswith("__.py")]

	def __init__(self, argv, db_file=None):
		self.scanners = self.get_modules_file(os.path.join(getrealdir(__file__), "scanners"))

		num_threads = None
		request_types = None
		display_progress = True
		modules_path = None
		proxy = None
		cookies = None
		user_agent = None
		extra_headers = None

		try:
			opts, args = getopt.getopt(argv, 'hn:r:vm:p:U:c:E:')
		except getopt.GetoptError as err:
			print str(err)
			sys.exit(1)

		for o, v in opts:
			if o == '-h':
				self.usage()
				sys.exit(0)
			elif o == '-m':
				modules_path = v
				self.scanners.extend(self.get_modules_file(modules_path))
				sys.path.append(modules_path)

		if len(args) < 2:
			if not db_file or len(args) == 0:
				self.usage()
				sys.exit(1)
			args.append(db_file)


		self.scanner = args[0]
		self.db_file = args[1] if not db_file else db_file

		db = Database(self.db_file)
		crawl_info = db.get_crawl_info()
		try:
			proxy = json.loads(crawl_info['proxy'])
			cookies = json.loads(crawl_info['cookies'])
			extra_headers = json.loads(crawl_info['extra_headers'])
			user_agent = crawl_info['user_agent']
		except KeyError:
			print "Unable to read proxy, cookies and user_agent from db.. maybe db created vith an old version . . ."
			pass

		for o, v in opts:
			if o == '-n':
				num_threads = int(v)
			elif o == '-v':
				display_progress = False
			elif o == '-r':
				request_types = v
			elif o == '-p':
				if v == "0":
					proxy = None
				else:
					try:
						proxy = parse_proxy_string(v)
					except Exception as e:
						print e
						sys.exit(1)
			elif o == '-c':
				try:
					cookies = parse_cookie_string(v)
				except:
					print "Unable to decode cookies"
					sys.exit(1)
			elif o == '-U':
				user_agent = v
			elif o == '-E':
				if not extra_headers:
					extra_headers = {}
				(hn, hv) = v.split("=", 1)
				extra_headers[hn] = hv


		scanner_argv = args[2:]

		if not self.scanner in self.scanners:
			print "Available scanners are:\n  %s" % "\n  ".join(sorted(self.scanners))
			sys.exit(1)

		if not os.path.exists(self.db_file):
			print "No such file %s" % self.db_file
			sys.exit(1)

		try:
			mod = importlib.import_module("core.scan.scanners.%s" % self.scanner)
		except Exception as e:
			if modules_path:
				try:
					mod = importlib.import_module(self.scanner)
				except Exception as e1:
					raise e1
			else:
				raise e

		try:
			run = getattr(mod, self.scanner.title())
			run(self.db_file, num_threads, request_types, display_progress, scanner_argv, proxy, cookies, user_agent, extra_headers)
		except Exception as e:
			print "Error: %s" % e
			return

		print "Scan finished"



	def usage(self):
		print ("\nUsage: scan [options] <scanner> <db_file> [scanner_options]\n"
			"Options: \n"
			"  -h                   this help\n"
			"  -n THREADS           number of parallel threads\n"
			"  -r REQUEST_TYPES     comma separated list of request types to pass to the scanner\n"
			"  -m PATH              path to custom modules dir\n"
			"  -v                   verbose mode\n"
			"  -p PROXY | 0         proxy, set to 0 to disable default (default: crawler)\n"
			"  -U USERAGENT         user agent (default: crawler)\n"
			"  -c STRING | PATH     cookies (default: request)\n"
			"  -E HEADER            extra http headers (default: crawler)\n"
			##"  -B                   fuzz both with both GET and POST\n"
			"\n"
			"Scanner Options: \n"
			"  those are scanner-specific options (if available), you should try -h ..\n"
			"\n"
			"Available scanners are:\n"
			"  - " + "\n  - ".join(sorted(self.scanners)) +	"\n"
			"\n"
			# "Available request types are:\n"
			# "  - xhr (ajax)\n"
			# "  - fetch\n"
			# "  - link (anchors href)\n"
			# "  - redirect (url from redirect)\n"
			# "  - form\n"
			# "  - jsonp\n"
			# "  - websocket\n"
		)

