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
from core.lib.http_get import HttpGet


class BaseScanner:
	def __init__(self, db_file, num_threads, request_types, display_progress, scanner_argv, proxy, cookies, user_agent, extra_headers):
		self.scan_start_time = int(time.time())
		self.threads = []
		self.lock = threading.Lock()
		self._th_lock = threading.Lock()
		self._th_lock_db = threading.Lock()
		self._th_lock_stdout = threading.Lock()
		self.performed_requests = 0
		self._urlpatterns = []
		self._exitcode = 0
		self._commands = []
		self.scanner_name = self.__class__.__name__.lower()
		self._running = False
		self.settings = self.get_settings()
		#self._type = self.settings['scanner_type'] if 'scanner_type' in self.settings else "external"
		self.exit_requested = False
		self.pause_requested = False
		self._print_queue = {}
		self.display_progress = display_progress
		#override default settings
		if num_threads: self.settings['num_threads'] = num_threads
		if request_types: self.settings['request_types'] = request_types
		#if process_timeout: self.settings['process_timeout'] = process_timeout
		#if scanner_exe: self.settings['scanner_exe'] = scanner_exe

		# if self._type == "external":
		# 	self.settings['scanner_exe'] = self.settings['scanner_exe'].split(" ")

		self.db = Database(db_file)
		self.id_assessment = self.db.create_assessment(self.scanner_name, int(time.time()))
		self.pending_requests = self.db.get_requests(self.settings['request_types'])
		self.tot_requests = len(self.pending_requests)
		self._duplicated_requests = []

		self.proxy = proxy
		self.cookies = cookies
		self.user_agent = user_agent
		self.extra_headers = extra_headers if extra_headers else []

		self.utils = ScannerUtils(self)

		urlpatterns = []
		for req in self.pending_requests:
			patt = RequestPattern(req).pattern
			if patt in urlpatterns:
				self._duplicated_requests.append(req.db_id)
			else:
				urlpatterns.append(patt)

		init = self.init(scanner_argv if scanner_argv else [])

		# if self._type == "external" and not os.path.isfile(self.settings['scanner_exe'][0]):
		# 	raise Exception("scanner_exe not found")

		self._running = True
		print "Scanner %s started with %d threads (^C to pause or change verbosity)" % (self.scanner_name, self.settings['num_threads'])

		for n in range(0, self.settings['num_threads']):
			thread = self.Executor(self)
			self.threads.append(thread)
			thread.start()


		self.wait_executor(self.threads)

		if not self.wait_threads_exit():
			self._th_lock.acquire()
			for cmd in self._commands:
				if cmd:
					cmd.kill()
			self._th_lock.release()
			os._exit(1)

		self.end()

		self.save_assessment()


	def end(self):
		pass


	def get_settings(self):
		return dict(
			request_types = "xhr,fetch,link,redirect,form,json",
			num_threads = 10,
			#process_timeout = 120,
			#scanner_exe = ""
		)


	def wait_executor(self, threads):
		executor_done = False
		pb = Progressbar(self.scan_start_time, "requests scanned")

		while not executor_done:
			try:
				executor_done = True
				for th in threads:
					if self.display_progress:
						self._th_lock.acquire()
						scanned = self.performed_requests
						pending = len(self.pending_requests)
						tot = self.tot_requests
						self._th_lock.release()
						pb.out(tot, scanned)
					else:
						self._th_lock_stdout.acquire()
						for id in self._print_queue:
							for out in self._print_queue[id]:
								print out
						self._print_queue = {}
						self._th_lock_stdout.release()
					if th.isAlive():
						executor_done = False
					th.join(1)
			except KeyboardInterrupt:
				try:
					self._th_lock.release()
					self._th_lock_stdout.release()
				except:
					pass
				self.pause_threads(True)
				if not self.get_runtime_command():
					print "Exiting . . ."
					self.request_exit()
					return
				print "Scan is running"
				self.pause_threads(False)
		if self.display_progress:
			print ""


	def get_runtime_command(self):
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

			print " "

		return True

	def request_exit(self):
		self.exit_requested = True;
		self.pause_requested = False;
		self._th_lock.acquire()
		for th in self.threads:
			if th.isAlive():
				th.exit = True
				th.pause = False
				for cmd in self._commands:
					if cmd:
						cmd.terminate()
		self._th_lock.release()

	def wait_threads_exit(self):
		waittime = 0.0
		msg = ""
		while True:
			try:
				at = 0
				for th in self.threads:
					if th.isAlive(): at += 1
				if at == 0:
					break
				if waittime > 2:
					stdoutw("\b"*len(msg))
					msg = "Waiting %d requests to be completed" % at
					stdoutw(msg)
				waittime += 0.1
				time.sleep(0.1)
			except KeyboardInterrupt:
				die = raw_input("\nForce exit? [y/N] ").strip()
				if die == "y":
					return False
		print ""
		return True

	def pause_threads(self, pause):
		self.pause_requested = pause
		self._th_lock.acquire()
		for th in self.threads:
			if th.isAlive(): th.pause = pause
		self._th_lock.release()

	def _sprint(self, id, str):
		self._th_lock_stdout.acquire()
		if not id in self._print_queue or not self._print_queue[id]:
			self._print_queue[id] = []
		self._print_queue[id].append(str)
		self._th_lock_stdout.release()

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


	def save_vulnerabilities(self, request, vulnerabilities):
		self._th_lock_db.acquire()
		self.db.insert_vulnerabilities(self.id_assessment, request.db_id, vulnerabilities)
		self._th_lock_db.release()


	def save_assessment(self):
		self._th_lock_db.acquire()
		self.db.save_assessment(self.id_assessment, int(time.time()))
		self._th_lock_db.release()


	def is_request_duplicated(self, request):
		return request.db_id in self._duplicated_requests


	# class utils:
	# 	@staticmethod
	# 	def send(url, method=None, data=None, cookies=None, user_agent=None, proxy=None, extra_headers=None, req_timeout=5, ignore_errors=False):
	# 		if not method:
	# 			method = METHOD_GET
	# 		req = Request(REQTYPE_LINK, method, url)
	# 		http = HttpGet(req, req_timeout, proxy=proxy, useragent=user_agent, extra_headers=extra_headers)
	# 		return  http.send_request(method=method, url=url, data=data, cookies=cookies, ignore_errors=ignore_errors)

	# 	@staticmethod
	# 	def strip_html_tags(html):
	# 		return strip_html_tags(html)

	# 	@staticmethod
	# 	def execmd(cmd, params=None, timeout=None):
	# 		return execmd(cmd, params, timeout)

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

				#if self.scanner._type == "native":
				sc = self.scanner.Scan(self, req)
				sc.run()
				self.inc_counter()



class ScannerThread:
	def __init__(self, thread, request):
		self._thread = thread # just in case you need to use something like thread.is_alive ecc
		self.uuid = thread.thread_uuid
		self.request = request
		self.scanner = thread.scanner
		self.tmp_dir = thread.tmp_dir
		self.utils = self.scanner.utils

	def sprint(self, str):
		return self.scanner._sprint(self.uuid, str)

	def is_request_duplicated(self):
		return self.scanner.is_request_duplicated(self.request)

	def save_vulnerabilities(self, vulnerabilities):
		return self.scanner.save_vulnerabilities(self.request, vulnerabilities)

	def send_request(self, url=None, method=None, data=None, cookies=None, user_agent=None, proxy=None, extra_headers=None, req_timeout=5, ignore_errors=False):
		return self.scanner.utils.send_request(self.request, url, method, data, cookies, user_agent, proxy, extra_headers, req_timeout, ignore_errors)


class ScannerUtils:

	def __init__(self, scanner):
		self.cookies = scanner.cookies
		self.proxy = scanner.proxy
		self.user_agent = scanner.user_agent
		self.extra_headers = scanner.extra_headers
		self.scanner = scanner

	def send_request(self, req, url=None, method=None, data=None, cookies=None, user_agent=None, proxy=None, extra_headers=None, req_timeout=5, ignore_errors=False):
		if not proxy:
			proxy = self.proxy
		if not user_agent:
			user_agent = self.user_agent
		if not extra_headers:
			extra_headers = self.extra_headers

		http = HttpGet(req, req_timeout, proxy=proxy, useragent=user_agent, extra_headers=extra_headers ) #{"proto":"http", "host":"127.0.0.1","port":"8080"})
		#http = HttpGet(self.request, req_timeout)
		allcookies = []
		if cookies:
			allcookies.extend(cookies)
		if self.cookies:
			allcookies.extend(self.cookies)
		http = HttpGet(req, req_timeout, proxy=proxy, useragent=user_agent, extra_headers=extra_headers)
		return  http.send_request(method=method, url=url, data=data, cookies=allcookies, ignore_errors=ignore_errors)

	#unused
	def rawsend(self, url, method=None, data=None, cookies=None, user_agent=None, proxy=None, extra_headers=None, req_timeout=5, ignore_errors=False):
		if not method:
			method = METHOD_GET
		req = Request(REQTYPE_LINK, method, url)
		http = HttpGet(req, req_timeout, proxy=proxy, useragent=user_agent, extra_headers=extra_headers)
		return  http.send_request(method=method, url=url, data=data, cookies=cookies, ignore_errors=ignore_errors)


	def strip_html_tags(self, html):
		return strip_html_tags(html)


	def execmd(self, cmd, params=None, timeout=None):
		if not re.search(r'^\.?/', cmd):
			cmd = get_cmd_path(cmd)
		if not cmd or not os.path.isfile(cmd):
			raise Exception("Command not found")
		cmd = [cmd] + params if params else [cmd]
		exe = CommandExecutor(cmd, stderr=True)
		self.scanner._th_lock.acquire()
		self.scanner._commands.append(exe)
		self.scanner._th_lock.release()

		out, err = exe.execute(timeout)
		ret = {"out": out, "err": err, "returncode": exe.returncode}

		self.scanner._th_lock.acquire()
		self.scanner._commands.remove(exe)
		self.scanner._th_lock.release()

		return ret

