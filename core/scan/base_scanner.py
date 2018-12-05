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
import urllib
import cookielib
import threading
import base64
import posixpath
import tempfile
import os
import uuid
import urllib2
import shutil
import datetime

from urlparse import urlparse, urlsplit, urljoin, parse_qs

import core.lib.thirdparty.pysocks.socks as socks
from core.lib.thirdparty.pysocks.sockshandler import SocksiPyHandler

from core.lib.exception import *
from core.crawl.lib.shared import *


from core.lib.request import Request

from core.lib.cookie import Cookie


from core.lib.shell import CommandExecutor
from core.lib.database import Database

from core.lib.utils import *
from core.constants import *
from core.lib.progressbar import Progressbar
from core.lib.request_pattern import RequestPattern



class BaseScanner:
	def __init__(self, db_file, num_threads, request_types, process_timeout, scanner_exe, display_progress, scanner_argv):
		self.scan_start_time = int(time.time())
		self.threads = []
		self._th_lock = threading.Lock()
		self._th_lock_db = threading.Lock()
		self.performed_requests = 0
		self._urlpatterns = []
		self._exitcode = 0
		self.scanner_name = self.__class__.__name__.lower()
		self._running = False
		self.settings = self.get_settings()
		self._type = self.settings['scanner_type'] if 'scanner_type' in self.settings else "external"
		self.exit_requested = False
		self.print_queue = []
		self.display_progress = display_progress
		#override default settings
		if num_threads: self.settings['num_threads'] = num_threads
		if request_types: self.settings['request_types'] = request_types
		if process_timeout: self.settings['process_timeout'] = process_timeout
		if scanner_exe: self.settings['scanner_exe'] = scanner_exe

		if self._type == "external":
			self.settings['scanner_exe'] = self.settings['scanner_exe'].split(" ")

		self.db = Database(db_file)
		self.id_assessment = self.db.create_assessment(self.scanner_name, int(time.time()))
		self.pending_requests = self.db.get_requests(self.settings['request_types'])
		self.tot_requests = len(self.pending_requests)
		self._duplicated_requests = []

		urlpatterns = []
		for req in self.pending_requests:
			patt = RequestPattern(req).pattern
			if patt in urlpatterns:
				self._duplicated_requests.append(req.db_id)
			else:
				urlpatterns.append(patt)

		init = self.init(scanner_argv if scanner_argv else [])

		if self._type == "external" and not os.path.isfile(self.settings['scanner_exe'][0]):
			raise Exception("scanner_exe not found")

		self._running = True
		print "Scanner %s started with %d threads" % (self.scanner_name, self.settings['num_threads']) 

		for n in range(0, self.settings['num_threads']):
			thread = self.Executor(self)
			self.threads.append(thread)
			thread.start()

	#	try:
		self.wait_executor(self.threads)
		# except KeyboardInterrupt:
		# 	print "\nTerminated by user"
		# 	self.kill_threads()

		self.save_assessment()
		sys.exit(self._exitcode)


	def get_settings(self):
		return dict(
			request_types = "xhr,link,redirect,form,json",
			num_threads = 10,
			process_timeout = 120,
			scanner_exe = ""
		)


	def get_cmd(self, url, outfile):
		cmd = []
		return cmd


	def scanner_executed(self, id_parent, out, err, out_file):
		return


	def wait_executor(self, threads):
		executor_done = False
		pb = Progressbar(self.scan_start_time, "requests scanned")

		while not executor_done:
			try:
				executor_done = True
				for th in threads:
					# if th.isAlive():
					# 	executor_done = False
					# th.join(1)
					if self.display_progress:
						self._th_lock.acquire()
						scanned = self.performed_requests
						pending = len(self.pending_requests)
						tot = self.tot_requests
						self._th_lock.release()
						pb.out(tot, scanned)
					else:
						self._th_lock.acquire()
						for out in self.print_queue:
							print out
						self.print_queue = []
						self._th_lock.release()

					if th.isAlive():
						executor_done = False
					th.join(1)
			except KeyboardInterrupt:
				self.pause_threads(True)
				if not self.get_user_command():
					print "Exiting . . ."
					self.kill_threads()
					return
				self.pause_threads(False)
		if self.display_progress:
			print ""


	def get_user_command(self):
		while True:
			print (
				"\nScan is paused. Choose what to do:\n"
				"   r    resume scan\n"
				"   v    verbose mode\n"
				"   p    show progress bar\n"
				"Hit ctrl-c again to exit\n"
			)
			try:
				ui = raw_input("> ").strip()
			except KeyboardInterrupt:
				print ""
				return False

			if ui == "r":
				break
			elif ui == "v":
				self.display_progress = False
				break
			elif ui == "p":
				self.display_progress = True
				break

			print "	"

		return True

	def kill_threads(self):
		self.exit_requested = True;
		self._th_lock.acquire()
		for th in self.threads:
			if th.isAlive(): th.exit = True
		self._th_lock.release()

	def pause_threads(self, pause):
		self._th_lock.acquire()
		for th in self.threads:
			if th.isAlive(): th.pause = pause
		self._th_lock.release()

	def lockprint(self, str):
		self._th_lock.acquire()
		self.print_queue.append(str)
		self._th_lock.release()

	# def exit(self, code):
	# 	if self._running:
	# 		self._th_lock.acquire()
	# 		self._exitcode = code
	# 		self._th_lock.release()
	# 		self.kill_threads()
	# 		print "kill thread"
	# 		print ""
	# 	else :
	# 		sys.exit(code)


	def save_vulnerability(self, request, type, description):
		self._th_lock_db.acquire()
		self.db.insert_vulnerability(self.id_assessment, request.db_id, type, description)
		self._th_lock_db.release()


	def save_assessment(self):
		self._th_lock_db.acquire()
		self.db.save_assessment(self.id_assessment, int(time.time()))
		self._th_lock_db.release()


	def is_request_duplicated(self, request):
		return request.db_id in self._duplicated_requests


	class Executor(threading.Thread):

		def __init__(self, scanner):
			threading.Thread.__init__(self)
			self.scanner = scanner
			self.exit = False
			self.pause = False
			self.thread_uuid = uuid.uuid4()
			self.tmp_dir = "%s%shtcap_tempdir-%s" % (tempfile.gettempdir(), os.sep, self.thread_uuid)
			os.makedirs(self.tmp_dir, 0700)

		def inc_counter(self):
			self.scanner._th_lock.acquire()
			self.scanner.performed_requests += 1
			self.scanner._th_lock.release()

		def run(self):
			req = None
			while True:

				self.scanner._th_lock.acquire()
				if self.exit == True or len(self.scanner.pending_requests) == 0:
					self.scanner._th_lock.release()
					shutil.rmtree(self.tmp_dir)
					return
				if self.pause == True:
					self.scanner._th_lock.release()
					time.sleep(1)
					continue
				req = self.scanner.pending_requests.pop()
				self.scanner._th_lock.release()

				if self.scanner._type == "native":
					self.scanner.scan(req)
					self.inc_counter()

				else:
					cmd_options = self.scanner.get_cmd(req, self.tmp_dir)
					if cmd_options == False:
						self.inc_counter()
						continue

					cmd = self.scanner.settings['scanner_exe'] + cmd_options

					exe = CommandExecutor(cmd, True)
					out, err = exe.execute(self.scanner.settings['process_timeout'])
					# if err: print "\nError: \n%s\n%s\n%s\n" % (err," ".join(cmd),out)

					self.inc_counter()

					self.scanner.scanner_executed(req, out,err, self.tmp_dir, cmd)

