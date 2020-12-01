# -*- coding: utf-8 -*-

"""
HTCAP - 1.1
Author: filippo.cavallarin@wearesegment.com

This program is free software; you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation; either version 2 of the License, or (at your option) any later
version.
"""


import sys
import time
import re
import os
import urllib.request, urllib.error, urllib.parse
from html.parser import HTMLParser

from core.lib.exception import *
from core.crawl.lib.shared import *


from core.lib.request import Request
from core.lib.cookie import Cookie

from core.lib.utils import *
from core.constants import *

from core.scan.base_fuzzer import BaseFuzzer

KF = "alert(42354364574)"

payloads = [
	"<htcap-scan-tag>%s</htcap-scan-tag>" % KF,
	"'><htcap-scan-tag>%s</htcap-scan-tag>" % KF,
	'"><htcap-scan-tag>%s</htcap-scan-tag>' % KF,
	"1 --><htcap-scan-tag>%s</htcap-scan-tag>" % KF,
	"]]><htcap-scan-tag>%s</htcap-scan-tag>" % KF,
	" onerror=%s" % KF,
	"' onerror=%s a='" % KF,
	'" onerror=%s a="' % KF,
	# not needed
	#"</textarea><htcap-scan-tag>%s</htcap-scan-tag>" % KF,
	#"</pre><htcap-scan-tag>%s</htcap-scan-tag>" % KF,
	KF
]



class XssHTMLParser(HTMLParser):
	def __init__(self):
		HTMLParser.__init__(self)
		self.text = []
		self.vulnerable = False

	def handle_starttag(self, tag, attrs):
		if tag == "htcap-scan-tag":
			self.vulnerable = True
			return
		elif tag in ("img", "input", "object", "link", "script", "body", "frame", "frameset", "iframe", "style"): #@TODO continue list
			for key, val in attrs:
				if key == "onerror" and val == KF:
					self.vulnerable = True
					return

		for key, val in attrs:
			if key[0:2] == "on" or (key == "src" and tag in ("script", "img", "frame", "frameset", "iframe", "object")) or (key == "href" and tag in ("a", "base", "link")) or (key == "action" and tag == "form"):
				if re.search(re.escape(KF), val, re.M):
					self.vulnerable = True


	def handle_data(self, d):
		self.text.append(d)

	def handle_endtag(self, tag):
		if tag in ("script", "style"):
			if re.search(re.escape(KF), "".join(self.text), re.M):
				self.vulnerable = True
		self.text = []



class XssReflected(BaseFuzzer):

	def init(self):
		pass

	# @TODO @FIX ignore content type != html, javascritp ecc..
	def fuzz(self):
		mutations = self.get_mutations(self.request, payloads)
		vulnerabilities = []
		for m in mutations:
			try:
				resp = m.send(ignore_errors=True)
			except RedirectException as e:
				self.sprint("Redirect IGNORED (%s): %s" % (self.__class__.__name__, e))
				continue
			except Exception as e:
				self.sprint("Error (%s): %s" % (self.__class__.__name__, e))
				continue
			parser = None
			if not resp.body:
				continue
			try:
				parser = XssHTMLParser()
				parser.feed(resp.body)
			except:
				pass

			if parser and parser.vulnerable:
				#self.sprint("\n   \033[31mFound: %s\033[0m\n     %s %s = %s" % (self.request.url, resp.method, resp.parameter, resp.payload))
				vulnerabilities.append(str(m))
				mutations.next_parameter()
				continue
		return vulnerabilities


