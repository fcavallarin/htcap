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
import time
import re
import json
import urllib
import cookielib
import threading
import base64

import tempfile
import os
import uuid

from urlparse import urlparse, urlsplit, urljoin, parse_qsl

from core.lib.exception import *
from core.crawl.lib.shared import *


from core.crawl.lib.probe import Probe

from core.lib.http_get import HttpGet
from core.lib.cookie import Cookie
from core.lib.shell import CommandExecutor
from core.lib.request import Request

from core.lib.utils import *
from core.constants import *

from lib.utils import *



class CrawlerThread(threading.Thread):

	def __init__(self):
		threading.Thread.__init__(self)		
		self.thread_uuid = uuid.uuid4()
		self.process_retries = 2
		self.process_retries_interval = 0.5

		self.status = THSTAT_RUNNING
		self.exit = False

		self.cookie_file = "%s%shtcap_cookiefile-%s.json" % (tempfile.gettempdir(), os.sep, self.thread_uuid)

		
	def run(self):		
		self.crawl()



	def wait_request(self):
		request = None
		Shared.th_condition.acquire()
		while True:				
			if self.exit == True:														
				Shared.th_condition.notifyAll()
				Shared.th_condition.release()
				raise ThreadExitRequestException("exit request received")	
				
			if Shared.requests_index >= len(Shared.requests):
				self.status = THSTAT_WAITING
				Shared.th_condition.wait() # The wait method releases the lock, blocks the current thread until another thread calls notify
				continue

			request = Shared.requests[Shared.requests_index]
			Shared.requests_index += 1
			
			break

		Shared.th_condition.release()
		
		self.status = THSTAT_RUNNING		
				
		return request



	def load_probe_json(self, jsn):
		jsn = jsn.strip()
		if not jsn: jsn = "["
		if jsn[-1] != "]":				
			jsn += '{"status":"ok", "partialcontent":true}]'				
		try:
			return json.loads(jsn)
		except Exception:
			#print "-- JSON DECODE ERROR %s" % jsn 
			raise


	def send_probe(self, request,  errors):
		
		url = request.url
		jsn = None
		probe = None
		retries = self.process_retries
		params = []
		cookies = []
		

		if request.method == "POST":
			params.append("-P")
			if request.data:
				params.extend(("-D", request.data))

		
		if len(request.cookies) > 0:
			for cookie in request.cookies:
				cookies.append(cookie.get_dict())
			
			with open(self.cookie_file,'w') as fil:
				fil.write(json.dumps(cookies))

			params.extend(("-c", self.cookie_file))
				
					
		
		if request.http_auth:
			params.extend(("-p" ,request.http_auth))

		if Shared.options['set_referer'] and request.referer:
			params.extend(("-r", request.referer))
		
		params.append(url)
		
		
		while retries:
		#while False:
			
			# print cmd_to_str(Shared.probe_cmd + params)
			# print ""
		
			cmd = CommandExecutor(Shared.probe_cmd + params)
			jsn = cmd.execute(Shared.options['process_timeout'] + 2)
						
			if jsn == None:
				errors.append(ERROR_PROBEKILLED)
				time.sleep(self.process_retries_interval) # ... ???
				retries -= 1 
				continue
			

			# try to decode json also after an exception .. sometimes phantom crashes BUT returns a valid json .. 
			try:					
				if jsn and type(jsn) is not str:
					jsn = jsn[0]									
				probeArray = self.load_probe_json(jsn)
			except Exception as e:								
				raise				

			
			if probeArray:							
				probe = Probe(probeArray, request)				
				
				if probe.status == "ok": 
					break
											
				errors.append(probe.errcode)
				
				if probe.errcode in (ERROR_CONTENTTYPE, ERROR_PROBE_TO):					
					break

			time.sleep(self.process_retries_interval)
			retries -= 1

		return probe



	def crawl(self):	
		
		while True:
			url = None
			cookies = []							
			requests = []

			requests_to_crawl = []
			redirects = 0
			errors = []

			try:				
				request = self.wait_request()								
			except ThreadExitRequestException:
				if os.path.exists(self.cookie_file):
					os.remove(self.cookie_file)
				return
			except Exception as e:
				print "-->"+str(e)
				continue

			url = request.url

			purl = urlsplit(url)


			if request_depth(request) > Shared.options['max_depth'] or request_post_depth(request) > Shared.options['max_post_depth']:				
				Shared.th_lock_db.acquire()				
				Shared.database.save_request_response_data(request.db_id, errors=[ERROR_CRAWLDEPTH])
				Shared.th_lock_db.release()
				continue

			if request.out_of_scope:
				continue				

			probe = None

			probe = self.send_probe(request, errors)			

			if probe:
				if probe.status == "ok" or probe.errcode == ERROR_PROBE_TO:
				
					if probe.redirect:																
						# @todo: should redirect of the first url replace Shared.starturl ???																		
						redirects = request.redirects + 1

					reqtypes_to_crawl = [REQTYPE_LINK, REQTYPE_REDIRECT]
					if Shared.options['mode'] == CRAWLMODE_AGGRESSIVE and Shared.options['crawl_forms']:
						reqtypes_to_crawl.append(REQTYPE_FORM)

					requests_to_crawl.extend(probe.get_requests_for_crawler(reqtypes_to_crawl))
				
					requests = probe.requests

					if probe.html:
						request.html = probe.html													

			else :
				errors.append(ERROR_PROBEFAILURE)
				# get urls with python to continue crawling								
				if Shared.options['use_urllib_onerror'] == False:
					continue
				try:		
					hr = HttpGet(request, Shared.options['process_timeout'], self.process_retries, Shared.options['useragent'], Shared.options['proxy'])			
					requests = hr.get_requests()
					requests_to_crawl.extend(requests)					
				except Exception as e:					
					errors.append(str(e))
				

			# set out_of_scope, apply user-supplied filters to urls (ie group_qs)
			adjust_requests(requests)

			Shared.th_lock_db.acquire()
			Shared.database.save_request_response_data(request.db_id, errors=errors, html=request.html)
			Shared.database.connect()
			for r in requests:											
				Shared.database.save_request(r)
			Shared.database.close()			
			Shared.th_lock_db.release()

			notify = False
			Shared.th_condition.acquire()
			for req in requests_to_crawl:								
				if req.redirects > Shared.options['max_redirects']:
					errors.append(ERROR_MAXREDIRECTS)
					# shoud use BREAK instead... if its a redirect len(requests_to_crawl) = 1
					continue
			
				if not req in Shared.requests:
					Shared.requests.append(req)
					notify = True

			if notify:
				Shared.th_condition.notifyAll() 
	
			Shared.th_condition.release()
			


			



