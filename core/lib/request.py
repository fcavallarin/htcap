# -*- coding: utf-8 -*- 

"""
HTCAP - beta 1
Author: filippo.cavallarin@wearesegment.com

This program is free software; you can redistribute it and/or modify it under 
the terms of the GNU General Public License as published by the Free Software 
Foundation; either version 2 of the License, or (at your option) any later 
version.
"""

from urlparse import urljoin
from core.lib.cookie import Cookie
from core.lib.utils import *
import json 
from core.lib.thirdparty.simhash import Simhash

class Request(object):

	def __init__(self, type, method, url, parent = None, referer = None, data = None, trigger=None, json_cookies = None, set_cookie = None, http_auth=None, db_id = None, parent_db_id = None, out_of_scope = None):
		self.type = type
		self.method = method
		self._html = None
		self._html_hash = None
		self.user_output = []
		url = url.strip()

		try:
			url = url.decode("utf-8")
		except:
			try:
				url = url.decode("latin-1")
			except Exception as e:
				raise AssertionError("unable to decode " + url)

		if type != REQTYPE_UNKNOWN:
			# extract http auth if present in url
			# if credentials are present in url, the url IS absolute so we can do this before urljoin
			# (foo:bar@example.local is NOT A VALID URL) 
			auth, nurl = extract_http_auth(url)
			if auth:
				if not http_auth: 
					http_auth = auth
				url = nurl

			self.url = normalize_url( urljoin(parent.url, url) if parent else url )
		else:
			self.url = url

		# if not url_is_valid(self.url):
		# 	raise MalformedUrlException(url)

		# parent is the parent request that can be a redirect, referer is the referer page (ahead of redirects)
		self._parent = parent


		self.data = data if data else ""
		self.trigger = trigger
		self.db_id = db_id
		self.parent_db_id = parent_db_id
		self.out_of_scope = out_of_scope
		self.cookies = []

		self.http_auth = parent.http_auth if not http_auth and parent else http_auth

		self.redirects = parent.redirects + 1 if type == REQTYPE_REDIRECT and parent else 0

		if not referer and parent:
			self.referer = parent.url if type != REQTYPE_REDIRECT else parent.referer
		else:
			self.referer = referer

		# if type == "unknown":
		# 	return

		if json_cookies:
			self.all_cookies = self.cookies_from_json(json_cookies)
		else:
			set_cookie = set_cookie if set_cookie else []
			self.all_cookies = self.merge_cookies(set_cookie, parent.all_cookies) if parent else set_cookie

		self.cookies = [c for c in self.all_cookies if c.is_valid_for_url(self.url)]





	@property
	def parent(self):
		if not self._parent and self.parent_db_id:
			# fetch from db
			pass
		return self._parent

	@parent.setter
	def parent(self, value):
		self._parent = value


	@property
	def html(self):
		return self._html

	@html.setter
	def html(self, value):
		self._html = value
		self._html_hash = Simhash(value)


	def get_dict(self):
		return dict(
			type = self.type,
			method = self.method,
			url = self.url,
			referer = self.referer,
			data = self.data,
			trigger = self.trigger,
			cookies = self.cookies,
			db_id = self.db_id,
			parent_db_id = self.parent_db_id,
			out_of_scope = self.out_of_scope
		)

	def cookies_from_json(self, cookies):
		#return [Cookie(c, self.parent.url) for c in json.loads(cookies)]

		# create Cookie without "setter" because cookies loaded from db are always valid (no domain restrictions)
		# see Cookie.py 
		return [Cookie(c) for c in json.loads(cookies)]


	def get_cookies_as_json(self):
		cookies = [c.get_dict() for c in self.cookies]
		return json.dumps(cookies)



	def merge_cookies(self, cookies1, cookies2):
		cookies = list(cookies2)
		for parent_cookie in cookies1:
			if parent_cookie not in cookies:
				cookies.append(parent_cookie)
			else :
				for cookie in cookies:
					if parent_cookie == cookie:
						cookie.update(parent_cookie.__dict__)

		return cookies


	def get_full_url(self):
		"""
		returns the url with http credentials
		"""
		if not self.http_auth:
			return self.url

		purl = urlsplit(self.url)
		netloc = "%s@%s" % (self.http_auth, purl.netloc)
		purl = purl._replace(netloc=netloc)

		return purl.geturl()


	# UNUSED
	def tokenize_request(self, request):
		"""
		returns an array of url components
		"""
		purl = urlsplit(request.url)

		tokens = [purl.scheme, purl.netloc]

		if purl.path:
			tokens.extend(purl.path.split("/"))

		data = [purl.query] if purl.query else []

		if request.data:
			data.append(request.data)

		for d in data:
			qtokens = re.split(r'(?:&amp;|&)', d)
			for qt in qtokens:
				tokens.extend(qt.split("=",1))

		#print tokens
		return tokens

	# UNUSED
	def compare_html(self, other):
		if not other: return False

		if not self.html and not other.html: return True


		if self.html and other.html:
			return self._html_hash.distance(other._html_hash) <= 2

		return False

	# UNUSED
	def is_similar(self, other):
		# is equal .. so not similar
		if self == other: return False

		ot = self.tokenize_request(other)
		st = self.tokenize_request(self)

		if len(ot) != len(st): return False
		diff = 0
		for i in range(0, len(st)):
			if st[i] != ot[i]: diff += 1

		if diff > 1: return False

		return True




	def __eq__(self, other):
		if other == None: return False
		data = self.data
		odata = other.data
		if self.method == "POST":
			data = remove_tokens(data)
			odata = remove_tokens(odata)

		return (self.method, self.url, self.http_auth, data) == (other.method, other.url, other.http_auth, odata)



	def __repr__(self):
		print "DEBUG" + self.__str__()

	def __str__(self):
		return "%s %s %s %s" % (self.type, self.method, self.get_full_url(), self.data)
