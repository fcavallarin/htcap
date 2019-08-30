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
from shared import *
import posixpath
import json
import re
import tempfile
import uuid
from core.crawl.lib.probe import Probe


def request_in_scope(request):
	url = request.url
	purl = urlsplit(url)
	spurl = urlsplit(Shared.starturl)
	scope = Shared.options['scope']
	in_scope = False

	# check for scopes
	if scope == CRAWLSCOPE_DOMAIN:
		for pattern in Shared.allowed_domains:
			if re.match(pattern, purl.hostname):
				in_scope = True
				break

	elif scope == CRAWLSCOPE_DIRECTORY:
		if purl.hostname != spurl.hostname:
			in_scope = False
		else:
			path  = [p for p in posixpath.dirname(purl.path).split("/") if p]
			spath = [p for p in posixpath.dirname(spurl.path).split("/") if p]
			in_scope = path[:len(spath)] == spath

	elif scope == CRAWLSCOPE_URL:
		in_scope = url == Shared.starturl


	# check for excluded urls
	for pattern in Shared.excluded_urls:
		if re.match(pattern, request.url):
			in_scope = False
			break

	return in_scope



def adjust_requests(requests):
	"""
	adjust an array of requsts according to current status/settings
	 1. sets the out_of_scope property
	 2. normalize url accoding to user settings
	"""

	for request in requests:
		if request.type == REQTYPE_UNKNOWN or not request_in_scope(request):
			request.out_of_scope = True

		if Shared.options['group_qs']:
			request.url = group_qs_params(request.url)

	return requests


def request_depth(request):
	if request.parent == None:
		return 1

	return 1 + request_depth(request.parent)



def request_post_depth(request):
	if request.method != "POST":
		return 0

	if request.parent == None or request.parent.method != "POST":
		return 1

	return 1 + request_post_depth(request.parent)


def request_is_crawlable(request):
	if request.out_of_scope:
		return False

	types = [REQTYPE_LINK, REQTYPE_REDIRECT]
	if Shared.options['mode'] == CRAWLMODE_AGGRESSIVE and Shared.options['crawl_forms']:
		types.append(REQTYPE_FORM)

	return request.type in types and re.match("^https?://", request.url, re.I)




class ProbeExecutor:
	def __init__(self, request, probe_basecmd, cookie_file=None, out_file=None, login_sequence=None):
		self.request = request
		self.probe_basecmd = probe_basecmd
		self.cookie_file = cookie_file
		self.out_file = out_file
		self.login_sequence = login_sequence
		self.errors = []
		self.cmd = None


	def load_probe_json(self, jsn):
		jsn = jsn.strip()
		if not jsn: jsn = "["
		if jsn[-1] != "]":
			jsn += '{"status":"ok", "partialcontent":true}]'
		try:
			return json.loads(jsn)
		except Exception:
			print "-- JSON DECODE ERROR %s" % jsn
			raise

	def terminate(self):
		if self.cmd:
			self.cmd.terminate()

	def execute(self, process_timeout=300, retries=1):
		url = self.request.url
		jsn = None
		probe = None
		#retries = self.process_retries
		params = []
		cookies = []

		if not self.cookie_file:
			self.cookie_file = "%s%shtcap_cookiefile-%s.json" % (tempfile.gettempdir(), os.sep, uuid.uuid4())
		if not self.out_file:
			self.out_file = "%s%shtcap_output-%s.json" % (tempfile.gettempdir(), os.sep, uuid.uuid4())

		if self.login_sequence:
			params.extend(["-L", self.login_sequence['__file__']])

		if self.request.method == "POST":
			params.append("-P")
			if self.request.data:
				params.extend(("-D", self.request.data))


		if len(self.request.cookies) > 0:
			for cookie in self.request.cookies:
				c = cookie.get_dict()
				if not c['domain']:
					purl = urlsplit(self.request.url)
					c['domain'] = purl.netloc.split(":")[0]
				cookies.append(c)

			with open(self.cookie_file,'w') as fil:
				fil.write(json.dumps(cookies))

			params.extend(("-c", self.cookie_file))



		if self.request.http_auth:
			params.extend(("-p" ,self.request.http_auth))

		if self.request.referer:
			params.extend(("-r", self.request.referer))


		params.extend(("-i", str(self.request.db_id)))

		params.extend(("-J", self.out_file))

		params.append(url)


		while retries:
		#while False:

			# print cmd_to_str(self.probe_basecmd + params)
			# print ""
			jsn = None
			self.cmd = CommandExecutor(self.probe_basecmd + params, True)
			out, err = self.cmd.execute(process_timeout + 10)

			if os.path.isfile(self.out_file):
				with open(self.out_file, "r") as f:
					jsn = f.read()
				os.unlink(self.out_file)

			if err or not jsn:
				self.errors.append(ERROR_PROBEKILLED)
				if not jsn:
					break


			# try to decode json also after an exception .. sometimes phantom crashes BUT returns a valid json ..
			try:
				if jsn and type(jsn) is not str:
					jsn = jsn[0]
				probeArray = self.load_probe_json(jsn)
			except Exception as e:
				raise


			if probeArray:
				probe = Probe(probeArray, self.request)

				if probe.status == "ok":
					break

				self.errors.append(probe.errcode)

				if probe.errcode in (ERROR_CONTENTTYPE, ERROR_PROBE_TO):
					break

			time.sleep(0.5)
			retries -= 1

		return probe


