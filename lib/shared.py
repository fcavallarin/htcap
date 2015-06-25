# -*- coding: utf-8 -*- 

THSTAT_WAITING = 0
THSTAT_RUNNING = 1


class crawlerData:
	"""
	data shared between threads
	"""
	
	starturl = ""
	results = []
	useragent = 'Mozilla/5.0 (Windows; U; Windows NT 5.1; it; rv:1.8.1.11) Gecko/20071127 Firefox/2.0.0.11'
	pending_urls = set()
	scanned_urls = set()
	valid_urls = set()
	allowed_domains = set()
	excluded_urls = set()	
	urls_data = dict()
	th_lock = None
	th_condition = None
	start_cookies = []
	options = {}
	
	#http_auth = None
	#proxy = None
	#use_urllib_onerror = True
	#group_querystring_parameters = False
	#normalize_url_path = True
	#max_redirects = 10
	#process_timeout = 25
	#set_referer = True
	

