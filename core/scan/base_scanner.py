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

import datetime



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

		#override default settings
		if num_threads: self.settings['num_threads'] = num_threads
		if request_types: self.settings['request_types'] = request_types
		if process_timeout: self.settings['process_timeout'] = process_timeout
		if scanner_exe: self.settings['scanner_exe'] = scanner_exe
		self.settings['scanner_exe'] = self.settings['scanner_exe'].split(" ")
			


		self.db = Database(db_file)
		self.id_assessment = self.db.create_assessment(self.scanner_name, int(time.time()))
		self.pending_requests = self.db.get_requests(self.settings['request_types'])
		self.tot_requests = len(self.pending_requests)
		self._duplicated_requests = []

		urlpatterns = []
		for req in self.pending_requests:			
			if req.method == "GET":
				pat = self.get_url_pattern(req.url)				
				if pat in urlpatterns:								
					self._duplicated_requests.append(req.db_id)
				else:	
					urlpatterns.append(pat)
		
		init = self.init(scanner_argv if scanner_argv else [])
		
		self._running = True
		print "Scanner %s started with %d threads" % (self.scanner_name, self.settings['num_threads']) 
		
		for n in range(0, self.settings['num_threads']):	
			thread = self.Executor(self)
			self.threads.append(thread)		
			thread.start()

		

		try:
			self.wait_executor(self.threads, display_progress)
		except KeyboardInterrupt:
			print "\nTerminated by user"
			self.kill_threads()

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



	def wait_executor(self, threads, display_progress):
		executor_done = False
		while not executor_done:				
			executor_done = True
			for th in threads:		
				if th.isAlive(): 				
					executor_done = False
				th.join(1)

				if display_progress:
					self._th_lock.acquire()				
					scanned = self.performed_requests
					pending = len(self.pending_requests)						
					tot = self.tot_requests
					self._th_lock.release()			

					print_progressbar(tot, scanned, self.scan_start_time, "requests scanned")
		if display_progress:
			print ""


	def kill_threads(self):
		self._th_lock.acquire()
		for th in self.threads:
			if th.isAlive(): th.exit = True
		self._th_lock.release()
		

	def exit(self, code):
		if self._running:			
			self._th_lock.acquire()
			self._exitcode = code
			self._th_lock.release()			
			self.kill_threads()
			print "kill thread"
			print ""
		else :
			sys.exit(code)


	def save_vulnerability(self, request, type, description):
		self._th_lock_db.acquire()		
		self.db.insert_vulnerability(self.id_assessment, request.db_id, type, description)		
		self._th_lock_db.release()


	def save_assessment(self):
		self._th_lock_db.acquire()		
		self.db.save_assessment(self.id_assessment, int(time.time()))		
		self._th_lock_db.release()

	
	def get_url_pattern(self, url):
		"""
		returns url pattern for comparision (query parameters are sorted and without values)
		"""
		purl = urlsplit(url)	
		query = parse_qs(purl.query, True)
		return [purl.scheme, purl.netloc, purl.path, sorted(query.keys())]

	def is_request_duplicated(self, request):
		
		return request.db_id in self._duplicated_requests

	class Executor(threading.Thread):
		
		def __init__(self, scanner):
			threading.Thread.__init__(self)
			self.scanner = scanner
			self.exit = False		
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

				req = self.scanner.pending_requests.pop()
									
				self.scanner._th_lock.release()						

				
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
				
