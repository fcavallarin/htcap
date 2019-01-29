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
import datetime
import time
import json
import re
import cookielib
import urllib
import urllib2
import base64
import ssl
from urlparse import urlsplit, urljoin
from urllib import urlencode
from core.crawl.lib.urlfinder import UrlFinder

import core.lib.thirdparty.pysocks.socks as socks
from core.lib.thirdparty.pysocks.sockshandler import SocksiPyHandler

from core.lib.exception import *
from core.lib.cookie import Cookie

from core.lib.request import Request


from core.lib.utils import *
from core.constants import *

class HttpGet:

	def __init__(self, request, timeout, retries=None, useragent=None, proxy=None, extra_headers=None):
		self.request = request
		self.timeout = timeout
		self.retries = retries if retries else 1
		self.proxy = parse_proxy_string(proxy) if isinstance(proxy, basestring) else proxy
		self.retries_interval = 0.5
		self.useragent = useragent
		self.extra_headers = extra_headers

	def urllib2_opener(self, request, jar_response, follow_redirect = None):
		url = request.url
		headers = []

		class RedirectHandler(urllib2.HTTPRedirectHandler):
			def http_error_302(self, req, fp, code, msg, headers):
				raise RedirectException(headers['Location'])

			http_error_301 = http_error_303 = http_error_307 = http_error_302


		try :
			handlers = [urllib2.HTTPCookieProcessor(jar_response)]

			# SSLContext is available from python 2.7.9
			if hasattr(ssl, "SSLContext"):
				handlers.append(urllib2.HTTPSHandler(context=ssl.SSLContext(ssl.PROTOCOL_SSLv23)))

			if not follow_redirect:
				handlers.append(RedirectHandler)

			if self.proxy:
				if self.proxy['proto'] == "socks5":
					# dns queries WONT go thru self.proxy .. consider "monkey patching"...
					socksh = SocksiPyHandler(socks.PROXY_TYPE_SOCKS5, self.proxy['host'], int(self.proxy['port']))
					handlers.append(socksh)
				elif self.proxy['proto'] == "http":
					proxy_string = "http://%s:%s" % (self.proxy['host'], self.proxy['port'])
					httproxy = urllib2.ProxyHandler({'http': proxy_string,'https': proxy_string})
					handlers.append(httproxy)

			if self.useragent:
				headers.append(('User-agent', self.useragent))


			if request.http_auth:
				auths = base64.b64encode(request.http_auth)
				headers.append(("Authorization", "Basic %s" % auths))


			if request.referer:
				headers.append(("Referer", request.referer))


			opener = urllib2.build_opener(*handlers)
			opener.addheaders = headers

			return opener


		except RedirectException as e:
			raise
		except Exception as e:
			print "\n--->"+url+" "+str(e)
			raise




	def get_requests(self): # Shared.options['process_timeout']

		if self.request.method == "POST":
			raise Exception("POST method with urllib is not supported yet")

		#parent = self.request.parent.url if self.request.parent else ""

		self.retries_interval = 0.5

		jar_response = cookielib.LWPCookieJar()
		jar_request = cookielib.LWPCookieJar()


		html = ""
		set_cookie = []

		requests = []


		while True:
			try :
				#Shared.th_lock.acquire()

				for cookie in self.request.cookies:
					jar_request.set_cookie(cookie.get_cookielib_cookie())

				#Shared.th_lock.release()

				opener = self.urllib2_opener(self.request, jar_response)
				req = urllib2.Request(url=self.request.url)
				jar_request.add_cookie_header(req)

				res = opener.open(req, None, self.timeout)

				for cookie in jar_response:
					set_cookie.append(Cookie(cookie.__dict__, self.request.url))

				ctype = res.info()['Content-Type'] # @TODO !! WRONG!! (check if wrong...not sure)
				if ctype is not None:
					if ctype.lower().split(";")[0] != "text/html":
						opener.close()
						raise NotHtmlException(ERROR_CONTENTTYPE)

				html = res.read()
				opener.close()

				if html:
					finder = UrlFinder(html)
					try:
						urls = finder.get_urls()
					except Exception as e:
						raise

				for url in urls:
					# @TODO handle FORMS
					requests.append(Request(REQTYPE_LINK, "GET", url, parent=self.request, set_cookie=set_cookie, parent_db_id=self.request.db_id))

				break

			except RedirectException as e:
				set_cookie = []
				for cookie in jar_response:
					set_cookie.append(Cookie(cookie.__dict__, self.request.url))

				r = Request(REQTYPE_REDIRECT, "GET", str(e), parent=self.request, set_cookie=set_cookie, parent_db_id=self.request.db_id)
				requests.append(r)
				break
			except NotHtmlException:
				raise
			except Exception as e:
				self.retries -= 1
				if self.retries == 0: raise
				time.sleep(self.retries_interval)

		return requests




	def send_request(self, method=None, url=None, data=None, cookies=None, ignore_errors=False): # Shared.options['process_timeout']

		if not method:
			method = self.request.method

		if not url:
			url = self.request.url

		if method in ("POST", "PUT"):
			if not data:
				data = self.request.data if self.request.data else ""

		if not cookies:
			cookies = []

		jar_request = cookielib.LWPCookieJar()


		ret = {
			"code": None,
			"url": None,
			"headers": None,
			"body": None,
			"time": None
		}

		while True:
			try :
				existing_cookies = []
				for cookie in self.request.cookies:
					clc = cookie.get_cookielib_cookie()
					for c in cookies:
						if c['name'] == cookie.name:
							clc.value = c['value']
							existing_cookies.append(c)
					jar_request.set_cookie(clc)

				for cookie in [x for x in cookies if x not in existing_cookies]:
				 	c = Cookie(cookie) # check what to do with cookie.setter
					jar_request.set_cookie(c.get_cookielib_cookie())

				opener = self.urllib2_opener(self.request, None, True)
				req = urllib2.Request(url=url, data=data)
				req.get_method = lambda: method
				jar_request.add_cookie_header(req)
				headers = self.request.extra_headers
				if self.extra_headers:
					for h in self.extra_headers:
						headers[h] = self.extra_headers[h]
				for hn in headers:
					req.add_header(hn, headers[hn])

				if data and not 'Content-type' in req.headers:
					req.add_header("Content-type", detect_content_type(data))
				now = time.time()
				try:
					res = opener.open(req, None, self.timeout)
				except urllib2.HTTPError as e:
					if not ignore_errors:
						raise
					res = e
				opener.close()

				ret['code'] = res.getcode()
				ret['url'] = res.geturl()
				ret['headers'] = [x.strip() for x in res.info().headers]
				ret['body'] = res.read()
				ret['time'] = time.time() - now

				break

			except Exception as e:
				self.retries -= 1
				if self.retries == 0:raise
				time.sleep(self.retries_interval)

		return ret



	def get_file(self, url=None): # Shared.options['process_timeout']

		if self.request.method == "POST":
			raise Exception("get_file: POST method with urllib is not supported yet")

		# return self.send_request().body << enable this eand test it

		if not url:
			url = self.request.url

		jar_request = cookielib.LWPCookieJar()


		cont = ""
		while True:
			try :

				for cookie in self.request.cookies:
					jar_request.set_cookie(cookie.get_cookielib_cookie())

				opener = self.urllib2_opener(self.request, None, True)
				req = urllib2.Request(url=url)
				jar_request.add_cookie_header(req)
				res = opener.open(req, None, self.timeout)

				cont = res.read()
				opener.close()

				break

			except Exception as e:
				self.retries -= 1
				if self.retries == 0: raise
				time.sleep(self.retries_interval)

		return cont





