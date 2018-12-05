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


class Scanner:

	def get_modules_file(self, path):
		files = glob.glob(os.path.join(path, "*.py"))
		return [os.path.basename(m).split(".")[0] for m in files if not m.endswith("__.py")]

	def __init__(self, argv):
		self.scanners = self.get_modules_file(os.path.join(getrealdir(__file__), "scanners"))

		num_threads = None
		request_types = None
		process_timeout = None
		display_progress = True
		scanner_exe = None
		modules_path = None

		try:
			opts, args = getopt.getopt(argv, 'hn:t:r:ve:m:')
		except getopt.GetoptError as err:
			print str(err)
			sys.exit(1)


		if len(args) < 2:
			self.usage()
			sys.exit(1)


		for o, v in opts:
			if o == '-h':
				self.usage()
				sys.exit(0)
			elif o == '-n':
				num_threads = int(v)
			elif o == '-t':
				process_timeout = int(v)
			elif o == '-e':
				scanner_exe = v
			elif o == '-v':
				display_progress = False
			elif o == '-r':
				request_types = v
			elif o == '-m':
				modules_path = v
				self.scanners.extend(self.get_modules_file(modules_path))
				sys.path.append(modules_path)

		self.scanner = args[0]
		self.db_file = args[1]

		scanner_argv = args[2:]

		if not self.scanner in self.scanners:
			print "Available scanners are:\n  %s" % "\n  ".join(self.scanners)
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
			run(self.db_file, num_threads, request_types, process_timeout, scanner_exe, display_progress, scanner_argv)
		except Exception as e:
			print "Error: %s" % e
			return

		print "Scan finished"



	def usage(self):
		print (
			"\n"
			"Usage: scan [options] <scanner> <db_file> [scanner_options]\n"
			"Options: \n"
			   "  -h                   this help\n"
			   "  -n THREADS           number of parallel threads\n"
			   "  -r REQUEST_TYPES     comma separated list of request types to pass to the scanner\n"
			   "  -t TIMEOUT           process timeout in seconds\n"
			   "  -e PATH              path to scanner executable\n"
			   "  -m PATH              path to custom modules dir\n"
			   "  -v                   verbose mode\n"
			"\n"
			"Scanner Options: \n"
				"  those are scanner-specific options (if available), you should try -h ..\n"
			"\n"
			"Available scanners are:\n"
			"  - " + "\n  - ".join(self.scanners) +	"\n"
			"\n"
			"Available request types are:\n"
			"  - xhr (ajax)\n"
			"  - fetch\n"
			"  - link (anchors href)\n"
			"  - redirect (url from redirect)\n"
			"  - form\n"
			"  - jsonp\n"
			"  - websocket\n"
		)

