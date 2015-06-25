# -*- coding: utf-8 -*- 

from __future__ import unicode_literals
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

from urlparse import urlparse, urljoin, parse_qsl

import lib.thirdparty.pysocks.socks as socks
from lib.thirdparty.pysocks.sockshandler import SocksiPyHandler

from lib.exception import *
from lib.shared import *

from lib.common import Result, UrlData, CommandExecutor, UrlFinder
from lib.cookie import Cookie




class Crawler(threading.Thread):
	
	def __init__(self):
		threading.Thread.__init__(self)		
		self.thread_uuid = uuid.uuid4()
		self.process_retries = 5
		self.process_retries_interval = 0.5
		
		self.status = THSTAT_RUNNING
		self.exit = False

		self.cookie_file = "%s%shtcap_cookiefile-%s.json" % (tempfile.gettempdir(), os.sep, self.thread_uuid)

		
	def run(self):		
		self.crawl()


	
	def get_parents(self, url):
		
		if not url in crawlerData.urls_data: return None
		child = crawlerData.urls_data[url]	
		if not child.parent: return None
		ret = [child.parent]
		
		p = self.get_parents(child.parent)
		if p is not None:
			ret.extend(p)
		return ret 


	def get_cookies(self, url):
		cookies = []
		
		parents = self.get_parents(url)
		
		if not parents:			
			return crawlerData.start_cookies	
		
		for p in reversed(parents):
			for parent_cookie in crawlerData.urls_data[p].set_cookie:
				if parent_cookie not in cookies:
					cookies.append(parent_cookie)
					# print ""
					# print "append from " + p + " to " + url
					# print str(parent_cookie.__dict__)
				else :				
					for cookie in cookies:
						if parent_cookie == cookie:
							cookie.update(parent_cookie.__dict__)		
							# print ""
							# print "update from " + p + " to " + url
							# print str(parent_cookie.__dict__)
		# print url
		# for c in cookies: print c.__dict__
		# print ""
		return cookies

		

	def normalize_path(self,url):
		purl = urlparse(url)
		if purl.path == "":
			return url
		new_path = posixpath.normpath(purl.path)
		if purl.path.endswith('/') and not new_path.endswith('/'):
			new_path += '/'
			
		purl = purl._replace(path = new_path)
		return purl.geturl()		
		

	def group_qs_params(self, url):
		purl = urlparse(url)
		qs = parse_qsl(purl.query)
		nqs = list()
	
		for t in reversed(qs):
			if t[0].endswith("[]") or t[0] not in [f for f,_ in nqs]:
				nqs.append(t)		
		
		# do not use urlencode since it will encode values and not just join tuples
		purl = purl._replace(query = "&".join([str(k) + "=" + str(v) for k,v in reversed(nqs)]))
		
		return purl.geturl();


	def get_html(self, url, url_data):
		parent = url_data.parent
		
		
		class RedirectHandler(urllib2.HTTPRedirectHandler):
			def http_error_302(self, req, fp, code, msg, headers):					
				raise RedirectException(headers['Location'])

			http_error_301 = http_error_303 = http_error_307 = http_error_302


		html = ""
		try :
			jar_response = cookielib.LWPCookieJar()
			jar_request = cookielib.LWPCookieJar()

			crawlerData.th_lock.acquire()		
			set_cookies = self.get_cookies(url)		
			for cookie in set_cookies:												
				jar_request.set_cookie(cookie.get_cookielib_cookie())
						
			crawlerData.th_lock.release()

			handlers = [urllib2.HTTPCookieProcessor(jar_response), RedirectHandler]		
			
			if crawlerData.options['proxy']:
				if crawlerData.options['proxy']['proto'] == "socks5":		
					# dns queries WONT go thru proxy .. consider "monkey patching"...						
					socksh = SocksiPyHandler(socks.PROXY_TYPE_SOCKS5, crawlerData.options['proxy']['host'], int(crawlerData.options['proxy']['port']))
					handlers.append(socksh)
				elif crawlerData.options['proxy']['proto'] == "http":			
					proxy_string = "http://%s:%s" % (crawlerData.options['proxy']['host'], crawlerData.options['proxy']['port'])						
					httproxy = urllib2.ProxyHandler({'http': proxy_string,'https': proxy_string})					
					handlers.append(httproxy)


			headers = [('User-agent', crawlerData.useragent)]

			if crawlerData.options['http_auth']:				
				auths = base64.encodestring("%s:%s" % tuple(crawlerData.options['http_auth']))
				headers.append(("Authorization", "Basic " + auths))				

			if crawlerData.options['set_referer'] and parent:
				headers.append(("Referer", parent))

			
			opener = urllib2.build_opener(*handlers)
			opener.addheaders = headers
						
			req = urllib2.Request(url=url)						
			jar_request.add_cookie_header(req)
					
			res = opener.open(req, None, crawlerData.options['process_timeout'])
						
			ctype = res.info()['Content-Type'].lower().split(";")[0]
			if ctype != "text/html":
				opener.close()
				raise NotHtmlException('mime type is not text/html')
				
			html = res.read() 
			opener.close()	

		except RedirectException:
			raise	
		except Exception as e:			
			#print str(e)
			raise 
		finally:			
			crawlerData.th_lock.acquire()
			for cookie in jar_response:			
				try:
					url_data.set_cookie.append(Cookie(cookie.__dict__))
				except Exception as e:
					print str(e)
			crawlerData.th_lock.release()

		return html
			

	def urllib_get_urls(self, url, parent):
		urls = []
		cookies = []
		retries = self.process_retries
		html = None
		while True:
			try:	
				html = self.get_html(url, parent)
				break
			except NotHtmlException:
				raise	
			except RedirectException:
				raise
			except Exception as e:				
				retries -= 1
				if retries == 0: raise
				time.sleep(self.process_retries_interval)
				
		if html:		
			finder = UrlFinder(html)
			try:				
				urls = finder.get_urls()
			except Exception as e:
				raise	
		else :
			raise AssertionError('Unexpected error: html is Null')
							

		return urls


	def wait_url(self):
		crawlerData.th_condition.acquire()

		while True:				
			if self.exit == True:														
				crawlerData.th_condition.notifyAll()
				crawlerData.th_condition.release()
				raise ThreadExitRequestException("exit request received")	
			try:
				url = crawlerData.pending_urls.pop()								
				crawlerData.scanned_urls.add(url)
				url_data = (crawlerData.urls_data[url] if url in crawlerData.urls_data else UrlData())				
				break
			except KeyError:					
				self.status = THSTAT_WAITING
				crawlerData.th_condition.wait() # The wait method releases the lock, blocks the current thread until another thread calls notify
			except Exception as e:
				raise

		crawlerData.th_condition.release()
		
		self.status = THSTAT_RUNNING		

		return (url, url_data)


	def add_url(self, url, baseurl, parent, redirects):
		try:
			url = url.decode("utf-8")
		except:
			try:
				url = url.decode("latin-1")
			except Exception as e:
				raise AssertionError("unable to decode " + url)				
		
		#print "%s redirects: %d   max%d" % (url, redirects, crawlerData.options['max_redirects']) 
		try:
			url = urljoin(baseurl, url)
		except Exception as e:
			raise AssertionError("urljoin error " + url)
			
		if crawlerData.options['normalize_url_path']:
			url = self.normalize_path(url)
		
		if crawlerData.options['group_querystring_parameters']:
			url = self.group_qs_params(url)

		crawlerData.th_condition.acquire()
		if url not in crawlerData.scanned_urls and url not in crawlerData.excluded_urls:
			crawlerData.pending_urls.add(url)			
			crawlerData.urls_data[url] = UrlData(parent=parent, redirects=redirects)
			crawlerData.th_condition.notifyAll()
		crawlerData.th_condition.release()




	def send_probe(self, url, url_data,  errors):
		
		"""
		sends probe and add cooies
		"""

		jsn = None
		probe = None
		retries = self.process_retries
		
		parent = url_data.parent
			
		cookies = []
		
		crawlerData.th_lock.acquire()
		set_cookies = self.get_cookies(url)		

		for cookie in set_cookies:												
			cookies.append(cookie.get_dict())
		crawlerData.th_lock.release()

		fil = open(self.cookie_file,'w')
		fil.write(json.dumps(cookies))
		fil.close()

		params = ["-c", self.cookie_file]
					
		if crawlerData.options['http_auth']:
			params.append("-p")			
			params.append("%s:%s" % tuple(crawlerData.options['http_auth']))

		if crawlerData.options['set_referer'] and parent:
			params.append("-r")
			params.append(parent)

		params.append(url)
		

		while retries:
		#while False:
		
			cmd = CommandExecutor(crawlerData.probe_cmd + params, crawlerData.DEVNULL)
			jsn = cmd.execute(crawlerData.options['process_timeout'])
			#print url
			# print " ".join(crawlerData.probe_cmd + params)
			# print ""

			if jsn == None:
				errors.append("probe: process timeout")
				time.sleep(self.process_retries_interval) # ... ???
				retries -= 1 
				continue
			

			# try to decode json also after an exception .. sometimes phantom crashes BUT returns a valid json .. 
			try:					
				if jsn and type(jsn) is not str:
					jsn = jsn[0]				
				probe = json.loads(jsn)								
			except Exception as e:
				raise				


			if probe:
				if not 'error' in probe:					
					break					

				if 'timeout' in probe and probe['timeout']:
					errors.append("timeout")						
				
				if 'loaderror' in probe and probe['loaderror']:
					errors.append("loaderror")

				if 'processingTimeout' in probe and probe['processingTimeout']:
					errors.append('processingTimeout')

			time.sleep(self.process_retries_interval)
			retries -= 1

		if probe and 'cookies' in probe:			
			crawlerData.th_lock.acquire()
			for c in probe['cookies']:	
				try:			
					url_data.set_cookie.append(Cookie(c))
				except Exception as e:
					print str(e)
			crawlerData.th_lock.release()
		
		return probe	


	def crawl(self):	
		
		while True:
			url = None
			cookies = []				
			#status = {'errors':[]}
			result = Result()

			urls_found = []
			redirects = 0

			try:				
				url, url_data = self.wait_url()
			except ThreadExitRequestException:
				if os.path.exists(self.cookie_file):
					os.remove(self.cookie_file)
				return
			except Exception as e:
				print e

			
			crawlerData.th_lock.acquire()			
			crawlerData.results.append(result)
			crawlerData.th_lock.release()							

			url = url.strip()			

			result.url = url;
			result.parent= url_data.parent;
			result.redirects = url_data.redirects

			purl = urlparse(url)

			if purl.scheme in ['mailto','javascript']:
				continue

			if not purl.scheme in ['http','https']:
				result.errors.append("non http: " + url)
				continue

			if not purl.hostname:
				result.errors.append("malformed URL: " + url)
				continue

			
			if purl.hostname not in crawlerData.allowed_domains:
				result.out_of_scope = True
				continue

			probe = None
			try:
				# pass errors object to let send_probe push all errors during retries				
				probe = self.send_probe(url, url_data, result.errors)
			except Exception as e:
				result.errors.append("probe error: " + str(e))

			

			if probe:				
				if 'contentTypeError' in probe:
					result.errors.append("mime is not text/html")
					continue
						
				# @todo: should redirect of the first url replace crawlerData.starturl ???
				if 'redirect' in probe:					
					if 'redirect_has_content' in probe and probe['redirect_has_content'] == True:
						result.redirec_has_content = True;
					urls_found.append(probe['redirect'])
					url_data.redirects += 1
					redirects = url_data.redirects + 1

				if 'urls' in probe:
					urls_found.extend(probe['urls'])				
				
				for k in ['ajax','resources', 'elements','script_tags','websockets','html']:
					if k in probe:											
						setattr(result, k, probe[k])

				result.urlsfound = len(urls_found)

				if len(result.errors) < self.process_retries:
					result.errors = []

			else :
				# get urls with python to continue crawling								
				if crawlerData.options['use_urllib_onerror'] == False:
					continue				
				try:
					pyurls = self.urllib_get_urls(url, url_data)	
				except NotHtmlException: # not text/html
					continue
				except RedirectException as redirect_url:					
					redirects = url_data.redirects + 1
					pyurls = [str(redirect_url)]					
					
				except Exception as e:
					result.errors.append(str(e))
					continue
				
				urls_found.extend(pyurls)
				#result.errors = []
				result.errors.append("probe failure, html fetched with urllib2")

			crawlerData.th_lock.acquire()
			crawlerData.valid_urls.add(url)						
			crawlerData.th_lock.release()	

			# parent and current may differ in case of redirects
			parent = url if redirects == 0 else url_data.parent			
			current = url


			for newurl in urls_found:				
				if redirects > crawlerData.options['max_redirects']:
					result.errors.append("too many redirects")
					continue
				try:
					self.add_url(newurl, current, parent, redirects)
				except Exception as e:
					result.errors.append(str(e))
			
			#if url.endswith("print=1"): return
			#return
			




