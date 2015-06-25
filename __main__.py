#!/usr/bin/python
# -*- coding: utf-8 -*- 

from __future__ import unicode_literals
import sys
import os
import datetime
import time
import getopt
import json
import re
from urlparse import urlparse
from urllib import urlencode
import threading
import subprocess

from crawler import Crawler

from lib.exception import *
from lib.shared import *

from lib.common import Result, UrlData
from lib.cookie import Cookie

from lib.database import Database

reload(sys)  
sys.setdefaultencoding('utf8')


VERSION = "alpha 1.0"
AUTHOR = "filippo.cavallarin@segment.technology"

base_dir = os.path.dirname(__file__) + os.sep
current_dir = os.path.dirname(os.path.dirname(base_dir)) + os.sep 

defaults = {
	"num_threads": 10,
	"max_redirects": 10,	
	"out_file_overwrite": False,
	"proxy": None,
	"http_auth": None,
	"use_urllib_onerror": True,
	"group_querystring_parameters": False,
	"normalize_url_path": True,
	"process_timeout": 25,
	"set_referer": True
}



def usage():
	print ("htcap ver " + VERSION + " by " + AUTHOR + "\n"
		   "usage: htcap [options] url outfile\n" 
		   "Options: \n"
		   "  -h                   this help\n"
		   "  -j                   save report also as json\n"
		   "  -s                   save report also to SQL lite database\n"
		   "  -w                   overwrite output file(s)\n"
		   "  -F                   don't fill input values, just trigger events\n"
		   "  -c COOKIES           cookies as json or name=value pairs separaded by semicolon\n"
		   "  -d DOMAINS           comma separated list of allowed domains\n"
		   "  -x EXCLUDED          comma separated list of urls to exclude - ie logout urls\n"
		   "  -p PROXY             proxy string protocol:host:port -  protocol can be 'http' or 'socks5'\n"
		   "  -n THREADS           number of parallel threads (default: " + str(defaults['num_threads']) + ")\n"
		   "  -A CREDENTIALS       username and password used for HTTP authentication separated by a colon\n"
		   "  -U USERAGENT         set user agent\n"
		   "  -t TIMEOUT           connection timeout in seconds (default " + str(defaults['process_timeout']) + ")\n"
		   "  -B                   do NOT use urllib2 to fetch html in case of phantomjs error - may break crawling\n"
		   "  -G                   group query_string parameters with the same name ('[]' ending excluded)\n"		   
		   "  -N                   don't normalize URL path (keep ../../)\n"
		  # "  -W                   don't threat www.example.com and example.com as the same\n"
		   "  -R                   maximum number of redirects to follow (default " + str(defaults['max_redirects']) + ")\n"
		   )
	sys.exit(1)


def get_phantomjs_cmd():
	phantom_path = ["/usr/bin/env", "phantomjs"]
	
	if os.path.exists(current_dir + "phantomjs"):
		phantom_path = [current_dir + "phantomjs"]
	elif os.path.exists(current_dir + "phantomjs.exe"):
		phantom_path = [current_dir + "phantomjs.exe"]

	phantom_path.append("--ignore-ssl-errors=yes")
	return phantom_path 


def generate_filename(name, ext, out_file_overwrite):	
	fname = "%s.%s" % (name, ext)
	if out_file_overwrite:
		if os.path.exists(fname):
			os.remove(fname)
		return fname

	i = 1
	while os.path.exists(fname):		
		fname = "%s-%d.%s" % (name ,i, ext)
		i += 1
	return fname


def kill_threads(threads):
	for th in threads:
		if th.isAlive(): th.exit = True
	# start notify() chain
	crawlerData.th_condition.acquire()
	crawlerData.th_condition.notifyAll()
	crawlerData.th_condition.release()	


def get_results():
	results = [res.get_dict() for res in crawlerData.results]
	
	results = sorted(results, key = lambda o: o['url'].lower())
	return results;


def db_save_report(dbname, report, report_name):
	db = Database(dbname, report_name, report['infos'])
	db.create()	
	db.connect()
	for res in report['results']:
		db.save_result(res)
	db.close()


def wait_crawler(threads):
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
			crawlerData.th_condition.acquire()				
			scanned = len(crawlerData.scanned_urls)
			pending = len(crawlerData.pending_urls)				
			crawlerData.th_condition.release()
			tot = (scanned + pending) 
			perc = (scanned * 33) / (tot if tot > 0 else 1)
			sys.stdout.write("\b"*150)
			out = "[%s%s]   %d of %d urls scanned in %d minutes" % ("="*perc, " "*(33-perc), scanned, tot, int(time.time() - crawl_start_time) / 60)
			sys.stdout.write(out)			
			sys.stdout.flush()


def parse_cookie_string(string):
	cookies = []
	try:
		cookies = json.loads(string)
	except ValueError:
		tok = re.split("; *", string)		
		for t in tok:
			t = t.split("=", 1)	
			cookies.append({"name":t[0], "value":t[1]})
	except Exception as e:	
		raise

	return cookies


if __name__ == '__main__':
	probe_options = []
	probe_cmd = get_phantomjs_cmd()
	start_cookies = []
	# search urls, json output, get cookies, get all resources, interesting elements, map events, trigger all mapped events, get html
	probe_default_options = ["-U", "-J", "-C", "-R", "-E", "-M", "-S", "-T", "-H"] 
	num_threads = defaults['num_threads']	
	save_as_json = False
	save_to_db = False
	out_file = ""
	out_file_overwrite = defaults['out_file_overwrite']	
	
	crawlerData.options = defaults

	try:
		opts, args = getopt.getopt(sys.argv[1:], 'hc:t:jn:x:O:A:p:d:BGFNR:U:wDs')
	except getopt.GetoptError as err:
		print str(err)	
		sys.exit(1)
	
	
	if len(args) < 2:
		usage()
	

	for o, v in opts:
		if o == '-h':
			usage()
		elif o == '-c':
			try:
				start_cookies = parse_cookie_string(v)
			except Exception as e:				
				print "error decoding cookie string"		
				sys.exit(1)			
		elif o == '-n':
			num_threads = int(v)
		elif o == '-t':
			crawlerData.options['process_timeout'] = int(v)
		elif o == '-j':
			save_as_json = True			
		elif o == '-A':
			crawlerData.options['http_auth'] = v.split(":",1)					
		elif o == '-p':			
			if v == "tor": v = "socks5:127.0.0.1:9150"

			proxy =  v.split(":")

			if proxy[0] != "http" and proxy[0] != "socks5":
				print "only http and socks5 proxies are supported"
				sys.exit(1)
			crawlerData.options['proxy'] = {"proto":proxy[0], "host":proxy[1], "port":proxy[2]}
		elif o == '-d':			
			for u in v.split(","):
				crawlerData.allowed_domains.add(u)
		elif o == '-x':	
			for u in v.split(","):
				crawlerData.excluded_urls.add(u)
		elif o == '-B':
			crawlerData.options['use_urllib_onerror'] = False		
		elif o == "-G":
			crawlerData.options['group_querystring_parameters'] = True
		elif o == "-F":
			probe_default_options.append("-f")
		elif o == "-w":
			out_file_overwrite = True
		elif o == "-N":
			crawlerData.options['normalize_url_path'] = False
		elif o == "-R":
			crawlerData.options['max_redirects'] = int(v)
		elif o == "-U":
			crawlerData.useragent = v
		# elif o == "-W":
		# 	www_domain = False
		elif o == "-s":
			save_to_db = True

	if crawlerData.options['proxy']:
		probe_cmd.append("--proxy-type=%s" % crawlerData.options['proxy']['proto'])
		probe_cmd.append("--proxy=%s:%s" % (crawlerData.options['proxy']['host'], crawlerData.options['proxy']['port']))
	
	probe_default_options.extend(["-x", str(crawlerData.options['process_timeout'])])
	probe_default_options.extend(["-A", crawlerData.useragent])

	probe_cmd.append(base_dir + 'probe.js')
		
	crawlerData.starturl = args[0]
	out_file = args[1]

	try:
		purl = urlparse(crawlerData.starturl)
	except:
		print "Malformed url: %s" % crawlerData.starturl
		sys.exit(1)

	if(purl.path == ""):
		crawlerData.starturl += "/"
		purl = urlparse(crawlerData.starturl)

	# if www_domain:		
	# 	if re.match("^www\.", purl.hostname, re.I):
	# 		crawlerData.allowed_domains.add(purl.hostname[4:])
	# 	else:
	# 		crawlerData.allowed_domains.add("www." + purl.hostname)

	

	for sc in start_cookies:		
		crawlerData.start_cookies.append(Cookie(sc))
	
	crawlerData.urls_data[crawlerData.starturl] = UrlData()	
	crawlerData.probe_cmd = probe_cmd + probe_default_options + probe_options
	crawlerData.th_lock = threading.Lock()
	crawlerData.th_condition = threading.Condition()
	crawlerData.DEVNULL = open(os.devnull, 'wb')
	
	threads = []
	crawl_start_time = int(time.time())
	
	crawlerData.allowed_domains.add(purl.hostname)
	crawlerData.pending_urls.add(crawlerData.starturl)	

	for n in range(0, num_threads):	
		thread = Crawler()			
		threads.append(thread)		
		thread.start()

	
	try:
		wait_crawler(threads)
	except KeyboardInterrupt:
		print "\nTerminated by user"	

	print ""
	
	
	kill_threads(threads)

	print "Crawl finished, %d urls scanned in %d minutes" % (len(crawlerData.scanned_urls), (int(time.time() - crawl_start_time) / 60))

	infos = {
		"target": crawlerData.starturl,
		"scan_date": crawl_start_time,
		"urls_scanned": len(crawlerData.scanned_urls), 
		"scan_time": str(int(time.time()) - crawl_start_time),
		'command_line': " ".join(sys.argv)
	}

	report = {
		"infos": infos, 
		"results": get_results()
	}


	fname = ""
	base_report = base_dir + "base_report.html"
	fil =open(base_report,'r')		
	html = fil.read()		
	fil.close()
	fname = generate_filename(out_file, "html", out_file_overwrite)		
	fil = open(fname,'w')
	fil.write(html.replace("{{json}}", json.dumps(report)))
	fil.close()
	print "Report saved to %s" % fname


	if save_as_json:
		fname = generate_filename(out_file, "json",out_file_overwrite)
		fil = open(fname,'w')
		fil.write(json.dumps(report))
		fil.close()		
		print "JSON saved to %s" % fname


	if save_to_db:
		db_report = {
			"infos": infos, 
			"results": crawlerData.results
		}
		fname = generate_filename(out_file, "db", out_file_overwrite)			
		db_save_report(fname, db_report, out_file)
		print "Database saved to %s" % fname


	print "Exiting..."
	sys.exit(0)
