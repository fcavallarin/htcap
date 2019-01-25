# -*- coding: utf-8 -*-

"""
HTCAP - 1.1
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
import os
import json
import xml.etree.ElementTree as XML

from core.lib.exception import *
from core.crawl.lib.shared import *


from core.lib.request import Request
from core.lib.cookie import Cookie

from core.lib.utils import *
from core.constants import *
from core.lib.http_get import HttpGet
from urlparse import urljoin, urlsplit, parse_qsl, parse_qs
from urllib import urlencode, quote







class MutationResponse:
	def __init__(self, mutation, response):
		self.code = response['code']
		self.url = response['url']
		self.headers = response['headers']
		self.body = response['body']
		self.time = response['time']



class Mutation:
	def __init__(self, scanner, request): #, parameter, payload):
		self.request = request
		self.parameter = None
		self.payload = None
		self.method = self.request.method
		self.url = None
		self.body = None
		self.cookie = None
		self.header = None
		self._scanner = scanner

	def set_parameter(self, param, value): #it also ulencodes the returned url !
		self.parameter = param
		self.payload = value
		self.method =  self.request.method
		self.url = None
		self.body = None
		self.cookie = None
		self.header = None

		if not isinstance(value, basestring):
			value = value[0] % tuple(value[1:])
		ppath = param.split("/")
		if ppath[0] == "get":
			p = ppath[1]
			nq = []
			purl = urlsplit(self.request.url)
			for k,v in parse_qsl(purl.query, True):
				if k == p:
					v = value
				nq.append((k, v))
			self.url = purl._replace(query=urlencode(nq)).geturl()
		elif ppath[0] == "urlpath": #unused
			p = int(ppath[1]) * -1
			purl = urlsplit(self.request.url)
			urlpath = purl.path.split("/")
			urlpath[p] = quote(value)
			urlpath = "/".join(urlpath)
			self.url = purl._replace(path=quote(urlpath)).geturl()
		elif ppath[0] == "post":
			p = ppath[1]
			nq = []
			for k,v in parse_qsl(self.request.data, True):
				if k == p:
					v = value
				nq.append((k, v))
			self.body = urlencode(nq)
		elif ppath[0] == "post-json":
			self.body = self._set_json_parameter(self.request.data, param, value);
		elif ppath[0] == "post-xml":
			self.body = self._set_xml_parameter(self.request.data, param, value);
		elif ppath[0] == "cookie":
			self.cookie = [{"name": ppath[1], "value": quote(value)}]
		elif ppath[0] == "header":
			self.header = None #@ @TODO

	def send(self, req_timeout=5, ignore_errors=False):
		http = HttpGet(self.request, req_timeout, proxy=self._scanner.proxy, useragent=self._scanner.user_agent, extra_headers=self._scanner.extra_headers)
		cookies = []
		if self.cookie:
			cookies.extend(self.cookie)
		if self._scanner.cookies:
			cookies.extend(self._scanner.cookies)
		#cookies = self.cookie + (self._scanner.cookies if self._scanner.cookies else [])
		resp =  http.send_request(method=self.method, url=self.url, data=self.body, cookies=cookies, ignore_errors=ignore_errors)
		return MutationResponse(self, resp)


	def _set_json_parameter(self, jsn, parameter, value):
		try:
			obj = json.loads(jsn)
		except:
			return None

		cur = obj
		prv = None
		for p in parameter.split("/")[1:]:
			prv = cur
			if isinstance(cur, list):
				p = int(p)
			cur = cur[p]

		prv[p] = value
		return json.dumps(obj)



	def _set_xml_parameter(self, xml, parameter, value):
		node = XML.fromstring(xml)
		par = parameter.split("/")[1:]
		par[0] = "." #xpath syntax
		prop = par[-1].split(".")
		if len(prop) > 1:
			par[-1] = prop[0]
			prop = prop[1]
		else:
			prop = None
		e = node.find("/".join(par))
		if prop:
			if prop in e.attrib.keys():
				e.attrib[prop] = value
			else:
				raise Exception("property not found %s" % prop)
		else:
			e.text = value
		return XML.tostring(node).decode()



	def __str__(self):
		url = self.url if self.url else self.request.url
		#data = self.body if self.body != False else self.request.data
		if self.method == METHOD_GET:
			data = ""
		else:
			data = self.body if self.body else self.request.data
		return "%s %s=%s  %s %s" % (self.method, self.parameter, self.payload, url, data)




class Mutations:
	def __init__(self, request, payloads, scanner):
		self.request = request
		self.payloads = payloads
		self.scanner = scanner
		self.switch_method = True
		self._nextm = None # used to switch method

	def __iter__(self):
		self.curparam = 0
		self.curpayload = 0
		self.params = self._get_params()
		return self

	def next(self):
		if self._nextm:
			mut = self._nextm
			self._nextm = None
			return mut

		if self.curparam >= len(self.params):
			raise StopIteration

		par = self.params[self.curparam]
		payl = self.payloads[self.curpayload]
		mut = Mutation(self.scanner, self.request)
		mut.set_parameter(par, payl)

		if self.curpayload == len(self.payloads) - 1:
			self.curparam += 1
		self.curpayload = (self.curpayload + 1) % len(self.payloads)

		self._nextm = self._switch_mutation_method(mut) if self.switch_method else None

		while self.scanner.pause_requested:
			time.sleep(0.5)

		if self.scanner.exit_requested:
			raise StopIteration

		return mut

	def _switch_mutation_method(self, mutation):
		mut = Mutation(self.scanner, self.request)
		mut.payload = mutation.payload
		par = mutation.parameter.split("/")
		try:
			if self.request.method == METHOD_GET:
				if par[0] != "get":
					return None
				mut.method = METHOD_POST
				mut.url, mut.body = self._get_to_post(mutation.url, mutation.parameter)
				par[0] = "post"
				mut.parameter = "/".join(par)
			else:
				if par[0] != "post":
					return None
				mut.method = METHOD_GET
				par[0] = "get"
				mut.url = self._allpost_to_get(self.request.url, mutation.body)
				mut.body = None
				mut.parameter = "/".join(par)
		except:
			return None
		return mut

	def next_parameter(self):
		if self.curpayload > 0:
			self.curparam += 1
			self.curpayload = 0
		self._nextm = None

	def _get_params(self):
		nq = []
		purl = urlsplit(self.request.url)
		for k,v in parse_qsl(purl.query, True):
			nq.append("get/%s" % k)

		if self.request.data:
			# try xml
			try:
				nq.extend(self._get_xml_parameters(self.request.data))
				#self.pattern[1] = self.get_xml_pattern(root)
			except Exception as e:
				# try json
				try:
					nq.extend(self._get_json_parameters(self.request.data))
				except Exception as e:
					# try url-encoded
					try:
						# parse_qs(qs[, keep_blank_values[, strict_parsing]])
						for k,v in parse_qsl(self.request.data, True):
							nq.append("post/%s" % k)
					except Exception as e:
						#print "! UNKNOWN POST DATA FORMAT"
						raise

		if self.request.cookies and len(self.request.cookies) > 0:
			for c in self.request.cookies:
				nq.append("cookie/%s" % c.name)

		if len(nq) == 0:
			urlpath = purl.query.split("/")
			if urlpath[-1].find(".") == -1:
				nq.append("urlpath/1")

		return nq


	def _get_to_post(self, url, parameter):
		postpar = None
		getpars = []
		par = parameter.split("/")[1]
		purl = urlsplit(url)
		for k,v in parse_qsl(purl.query, True):
			if k == par:
				postpar = urlencode([(k, v)])
			else:
				getpars.append((k, v))

		url = purl._replace(query=urlencode(getpars)).geturl()
		return (url, postpar)



	def _post_to_get(self, url, data, parameter):
		postpars = []

		par = parameter.split("/")[1]
		purl = urlsplit(url)
		getpars = parse_qsl(purl.query, True) if purl.query else []
		for k,v in parse_qsl(data, True):
			if k == par:
				getpars.append((k, v))
			else:
				postpars.append((k, v))


		url = purl._replace(query=urlencode(getpars)).geturl()
		return (url, urlencode(postpars) if len(postpars) > 0 else None)



	def _allpost_to_get(self, url, data):
		postdata = parse_qsl(data, True)
		purl = urlsplit(url)
		query = urlencode(parse_qsl(purl.query, True) + postdata)
		return purl._replace(query=query).geturl()


	def _get_json_parameters(self, obj, path=None):
		pars = []
		if path == None:
			obj = json.loads(obj)

		try:
			for e in obj:
				cp = "%s%s" % (path+"/" if path else "post-json/", e)
				if not obj[e] or isinstance(obj[e], int) or isinstance(obj[e], float) or isinstance(obj[e], basestring):
					pars.append(cp)
				else:
					rp = self._get_json_parameters(obj[e], cp)
					if rp:
						pars.extend(rp)
		except:
			return None
		return pars



	def _get_xml_parameters(self, node, path=None):
		pars = []
		if path == None:
			node = XML.fromstring(node)
		try:
			for e in node:
				cp = "%s%s" % (path+"/" if path else "post-xml/%s/" % node.tag, e.tag)
				if len(e) == 0:
					pars.append(cp)
				for p in e.attrib.keys():
					pars.append("%s.%s" % (cp, p))
				rp = self._get_xml_parameters(e, cp)
				if rp:
					pars.extend(rp)
		except:
			return None
		return pars



class BaseFuzzer:

	def __init__(self, scanner_thread):
		self.thread_uuid = scanner_thread.uuid
		self.scanner = scanner_thread.scanner
		self.request = scanner_thread.request
		self.utils = self.scanner.utils
		self.init()


	def get_mutations(self, request, payload):
		return Mutations(request, payload, self.scanner)

	def sprint(self, str):
		return self.scanner._sprint(self.thread_uuid, str)


