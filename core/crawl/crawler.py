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
import getopt
import json
import re
from urlparse import urlsplit, urljoin
from urllib import unquote
import urllib2
import threading
import subprocess
from random import choice
import string
from distutils import spawn


from core.lib.exception import *
from core.lib.cookie import Cookie
from core.lib.database import Database

from lib.shared import *
from core.lib.request import Request
from core.lib.http_get import HttpGet
from crawler_thread import CrawlerThread

from core.lib.utils import *
from core.constants import *

from lib.utils import *

class Crawler:

	def __init__(self, argv):
		
		self.base_dir = getrealdir(__file__) + os.sep
		
		self.crawl_start_time = int(time.time())
		self.crawl_end_time = None

		self.defaults = {
			"useragent": 'Mozilla/5.0 (Windows; U; Windows NT 5.1; it; rv:1.8.1.11) Gecko/20071127 Firefox/2.0.0.11',
			"num_threads": 10,
			"max_redirects": 10,	
			"out_file_overwrite": False,
			"proxy": None,
			"http_auth": None,
			"use_urllib_onerror": True,	
			"group_qs": False,
			#"normalize_url_path": True,
			"process_timeout": 300, # when lots of element(~25000) are added dynamically it can take some time..
			"set_referer": True,
			"scope": CRAWLSCOPE_DOMAIN,
			"mode": CRAWLMODE_AGGRESSIVE,
			"max_depth": 100,
			"max_post_depth": 10,
			'crawl_forms': True # only if mode == CRAWLMODE_AGGRESSIVE
		}


		self.main(argv)



	def usage(self):
		infos = get_program_infos()
		print ("htcap crawler ver " + infos['version'] + "\n"
			   "usage: htcap [options] url outfile\n" 
			   "Options: \n"
			   "  -h               this help\n"			   
			   "  -w               overwrite output file\n"
			   "  -q               do not display progress informations\n"			   
			   "  -m MODE          set crawl mode:\n"
			   "                      - "+CRAWLMODE_PASSIVE+": do not intract with the page\n"
			   "                      - "+CRAWLMODE_ACTIVE+": trigger events\n"
			   "                      - "+CRAWLMODE_AGGRESSIVE+": also fill input values and crawl forms (default)\n"
			   "  -s SCOPE         set crawl scope\n"
			   "                      - "+CRAWLSCOPE_DOMAIN+": limit crawling to current domain (default)\n"		   
			   "                      - "+CRAWLSCOPE_DIRECTORY+": limit crawling to current directory (and subdirecotries) \n"			   
			   "                      - "+CRAWLSCOPE_URL+": do not crawl, just analyze a single page\n"			   
			   "  -D               maximum crawl depth (default: " + str(Shared.options['max_depth']) + ")\n"
			   "  -P               maximum crawl depth for consecutive forms (default: " + str(Shared.options['max_post_depth']) + ")\n"
			   "  -F               even if in aggressive mode, do not crawl forms\n"
			   "  -H               save HTML generated by the page\n"	   
			   "  -d DOMAINS       comma separated list of allowed domains (ex *.target.com)\n"
			   "  -c COOKIES       cookies as json or name=value pairs separaded by semicolon\n"
			   "  -C COOKIE_FILE   path to file containing COOKIES \n"		   
			   "  -r REFERER       set initial referer\n"
			   "  -x EXCLUDED      comma separated list of urls to exclude (regex) - ie logout urls\n"
			   "  -p PROXY         proxy string protocol:host:port -  protocol can be 'http' or 'socks5'\n"
			   "  -n THREADS       number of parallel threads (default: " + str(self.defaults['num_threads']) + ")\n"
			   "  -A CREDENTIALS   username and password used for HTTP authentication separated by a colon\n"
			   "  -U USERAGENT     set user agent\n"
			   "  -t TIMEOUT       maximum seconds spent to analyze a page (default " + str(self.defaults['process_timeout']) + ")\n"			   
			   "  -S               skip initial url check\n"
			   "  -G               group query_string parameters with the same name ('[]' ending excluded)\n"		   
			   "  -N               don't normalize URL path (keep ../../)\n"			  
			   "  -R               maximum number of redirects to follow (default " + str(self.defaults['max_redirects']) + ")\n"			   
			   "  -I               ignore robots.txt\n"
			   )
		


	def get_phantomjs_cmd(self):
		phantom_cmd = []
		phantom_path = spawn.find_executable("phantomjs")
		if phantom_path is None:
			return None
		phantom_cmd.extend([phantom_path, "--ignore-ssl-errors=yes","--web-security=false","--ssl-protocol=any","--debug=false"])
		return phantom_cmd 


	def generate_filename(self, name, out_file_overwrite):	
		fname = generate_filename(name, None, out_file_overwrite)
		if out_file_overwrite:
			if os.path.exists(fname):
				os.remove(fname)
		
		return fname


	def kill_threads(self, threads):
		for th in threads:
			if th.isAlive(): th.exit = True
		# start notify() chain
		Shared.th_condition.acquire()
		Shared.th_condition.notifyAll()
		Shared.th_condition.release()	




	def wait_crawler(self, threads, display_progress):
		crawler_done = False
		while not crawler_done:				
			for th in threads:
				crawler_done = True
				for th1 in threads:
					if th1.status == THSTAT_RUNNING:# and th1.isAlive(): 
						crawler_done = False
				if crawler_done: break;

				if not th.isAlive(): continue #@todo fix
				th.join(1)

				if display_progress:
					Shared.th_condition.acquire()									
					scanned = Shared.requests_index #len(Shared.crawled_requests)
					pending = len(Shared.requests) - scanned				
					Shared.th_condition.release()					
					tot = (scanned + pending) 
					print_progressbar(tot, scanned, self.crawl_start_time, "pages processed")				

		if display_progress:
			print ""



	def parse_cookie_string(self, string):
		
		cookies = []
		try:
			cookies = json.loads(string)
		except ValueError:
			tok = re.split("; *", string)		
			for t in tok:
				k, v = t.split("=", 1)				
				cookies.append({"name":k.strip(), "value":unquote(v.strip())})
		except Exception as e:	
			raise

		# print cookies
		# sys.exit(1)
		return cookies



	def init_db(self, dbname, report_name):
		infos = {
			"target": Shared.starturl,
			"scan_date": -1,
			"urls_scanned": -1, 
			"scan_time": -1,
			'command_line': " ".join(sys.argv)
		}

		Shared.database = Database(dbname, report_name, infos)
		Shared.database.create()	



	def check_startrequest(self, request):
		#def __init__(self, request, timeout, retries=None, useragent=None,  proxy=None, http_auth=None):

		h = HttpGet(request, Shared.options['process_timeout'], 2, Shared.options['useragent'], Shared.options['proxy'])
		try:
			h.get_requests()
		except NotHtmlException:
			print "\nError: Document is not html"
			sys.exit(1)
		except Exception as e:
			print "\nError: unable to open url: %s" % e
			sys.exit(1)



	def get_requests_from_robots(self, request):
		purl = urlsplit(request.url)		
		url = "%s://%s/robots.txt" % (purl.scheme, purl.netloc)
		
		getreq = Request(REQTYPE_LINK, "GET", url)
		try:		
			# request, timeout, retries=None, useragent=None, proxy=None):
			httpget = HttpGet(getreq, 10, 1, "Googlebot", Shared.options['proxy'])			
			lines = httpget.get_file().split("\n")
		except urllib2.HTTPError:
			return None
		except:
			raise

		requests = []
		for line in lines:			
			directive = ""
			url = None
			try:
				directive, url = re.sub("\#.*","",line).split(":",1)
			except:
				continue # ignore errors

			if re.match("(dis)?allow", directive.strip(), re.I):
				req = Request(REQTYPE_LINK, "GET", url.strip(), parent=request)			
				requests.append(req)


		return adjust_requests(requests) if requests else None



	def randstr(self, length):
		all_chars = string.digits + string.letters + string.punctuation
		random_string = ''.join(choice(all_chars) for _ in range(length))
		return random_string
		


	def main(self, argv):
		Shared.options = self.defaults
		Shared.th_lock = threading.Lock()
		Shared.th_lock_db = threading.Lock()
		Shared.th_condition = threading.Condition()


		probe_cmd = self.get_phantomjs_cmd()
		if not probe_cmd:
			print "Error: unable to find phantomjs executable"
			sys.exit(1)

		start_cookies = []
		start_referer = None
		
		probe_options = ["-R", self.randstr(20)]
		threads = []
		num_threads = self.defaults['num_threads']			
	
		out_file = ""
		out_file_overwrite = self.defaults['out_file_overwrite']	
		cookie_string = None
		display_progress = True
		check_starturl = True
		http_auth = None
		get_robots_txt = True
		save_html = False

		try:
			opts, args = getopt.getopt(argv, 'hc:t:jn:x:O:A:p:d:BGR:U:wD:s:m:C:qr:SIHFP:')
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
			elif o == '-c':
				cookie_string = v
			elif o == '-C':
				try:
					with open(v) as cf:
						cookie_string = cf.read()
				except Exception as e:				
					print "error reading cookie file"		
					sys.exit(1)			
			elif o == '-r':
				start_referer = v
			elif o == '-n':
				num_threads = int(v)
			elif o == '-t':
				Shared.options['process_timeout'] = int(v)
			elif o == '-q':
				display_progress = False				
			elif o == '-A':
				http_auth = v
			elif o == '-p':			
				if v == "tor": v = "socks5:127.0.0.1:9150"
				proxy =  v.split(":")
				if proxy[0] not in ("http", "https"): # != "http" and proxy[0] != "socks5":
					print "only http and socks5 proxies are supported"
					sys.exit(1)
				Shared.options['proxy'] = {"proto":proxy[0], "host":proxy[1], "port":proxy[2]}
			elif o == '-d':			
				for ad in v.split(","):
					# convert *.domain.com to *.\.domain\.com
					pattern = re.escape(ad).replace("\\*\\.","((.*\\.)|)")
					Shared.allowed_domains.add(pattern)
			elif o == '-x':	
				for eu in v.split(","):					
					Shared.excluded_urls.add(eu)								
			elif o == "-G":
				Shared.options['group_qs'] = True			
			elif o == "-w":
				out_file_overwrite = True			
			elif o == "-R":
				Shared.options['max_redirects'] = int(v)
			elif o == "-U":
				Shared.options['useragent'] = v			
			elif o == "-s":
				if not v in (CRAWLSCOPE_DOMAIN, CRAWLSCOPE_DIRECTORY, CRAWLSCOPE_URL):					
					self.usage()
					print "* ERROR: wrong scope set '%s'" % v
					sys.exit(1)
				Shared.options['scope'] = v
			elif o == "-m":
				if not v in (CRAWLMODE_PASSIVE, CRAWLMODE_ACTIVE, CRAWLMODE_AGGRESSIVE):
					self.usage()
					print "* ERROR: wrong mode set '%s'" % v					
					sys.exit(1)
				Shared.options['mode'] = v
			elif o == "-S":
				check_starturl = False
			elif o == "-I":
				get_robots_txt = False	
			elif o == "-H":
				save_html = True
			elif o == "-D":
				Shared.options['max_depth'] = int(v)
			elif o == "-P":
				Shared.options['max_post_depth'] = int(v)				
			elif o == "-F":
				Shared.options['crawl_forms'] = False


		if Shared.options['scope'] != CRAWLSCOPE_DOMAIN and len(Shared.allowed_domains) > 0:
			print "* Warinig: option -d is valid only if scope is %s" % CRAWLSCOPE_DOMAIN

		if cookie_string:
			try:
				start_cookies = self.parse_cookie_string(cookie_string)
			except Exception as e:				
				print "error decoding cookie string"		
				sys.exit(1)			

		

		if Shared.options['mode'] != CRAWLMODE_AGGRESSIVE:
			probe_options.append("-f") # dont fill values
		if Shared.options['mode'] == CRAWLMODE_PASSIVE:
			probe_options.append("-t") # dont trigger events

		if Shared.options['proxy']:
			probe_cmd.append("--proxy-type=%s" % Shared.options['proxy']['proto'])
			probe_cmd.append("--proxy=%s:%s" % (Shared.options['proxy']['host'], Shared.options['proxy']['port']))
		
		if len(Shared.excluded_urls) > 0:			
			probe_options.extend(("-X", ",".join(Shared.excluded_urls)))

		if save_html:
			probe_options.append("-H")

		probe_options.extend(("-x", str(Shared.options['process_timeout']) ))
		probe_options.extend(("-A", Shared.options['useragent']))

		probe_cmd.append(self.base_dir + 'probe/analyze.js')
		
		Shared.probe_cmd = probe_cmd + probe_options 


		Shared.starturl = normalize_url(args[0])
		out_file = args[1]
		
		purl = urlsplit(Shared.starturl)
		Shared.allowed_domains.add(purl.hostname)


		for sc in start_cookies:		
			Shared.start_cookies.append(Cookie(sc, Shared.starturl))
		

		start_req = Request(REQTYPE_LINK, "GET", Shared.starturl, set_cookie=Shared.start_cookies, http_auth=http_auth, referer=start_referer)
		Shared.requests.append(start_req)

		stdoutw("Initializing . ")

		try:
			if check_starturl:			
				self.check_startrequest(start_req)
				stdoutw(". ")
							
			if get_robots_txt:			
				rrequests = self.get_requests_from_robots(start_req)
				stdoutw(". ")
				if rrequests:				
					Shared.requests.extend(rrequests)
		except KeyboardInterrupt:
			print "\nAborted"		
			sys.exit(0)

		

		fname = self.generate_filename(out_file, out_file_overwrite)
		try:
			self.init_db(fname, out_file)
		except Exception as e:
			print str(e)
			sys.exit(1)

		Shared.database.save_crawl_info(
			htcap_version = get_program_infos()['version'],
			target = Shared.starturl,
			start_date = self.crawl_start_time,
			commandline = cmd_to_str(argv),
			user_agent = Shared.options['useragent']
		)


		# save initial requests from db (start_url and urls from robots.txt)
		Shared.database.connect()		
		for req in Shared.requests:
			Shared.database.save_request(req)
		Shared.database.close()

		print "done"
		print "Database %s initialized, crawl started with %d threads" % (fname, num_threads)

		for n in range(0, num_threads):	
			thread = CrawlerThread()			
			threads.append(thread)		
			thread.start()
		
		try:
			self.wait_crawler(threads, display_progress)
		except KeyboardInterrupt:
			print "\nTerminated by user"	

		
		
		self.kill_threads(threads)

		self.crawl_end_time = int(time.time())

		print "Crawl finished, %d pages analyzed in %d minutes" % (Shared.requests_index, (self.crawl_end_time - self.crawl_start_time) / 60)

		Shared.database.save_crawl_info(end_date=self.crawl_end_time)


