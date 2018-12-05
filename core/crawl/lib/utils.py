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


