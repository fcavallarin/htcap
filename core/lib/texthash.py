# -*- coding: utf-8 -*- 

"""
HTCAP 
Author: filippo.cavallarin@wearesegment.com

This program is free software; you can redistribute it and/or modify it under 
the terms of the GNU General Public License as published by the Free Software 
Foundation; either version 2 of the License, or (at your option) any later 
version.



"""
from __future__ import division
import sys
import os
import time
import pipes
import re
from zlib import crc32

from core.lib.thirdparty.simhash import Simhash
from core.lib.shingleprint import ShinglePrint
from urlparse import urlsplit, urljoin, parse_qsl
from core.lib.exception import *
from core.constants import *

class TextHash:
	simhash_threshold = 10
	shingleprint_threshold = 0.95

	def __init__(self, text):
		self.text = text

		if len(text) < 32:
			##self.hash = {"type": "textmatch", "value": text}
			self.hash = {"type": "simhash", "value": Simhash(text).value}
		elif len(text) < 256:
			self.hash = {"type": "simhash", "value": Simhash(text).value}
		else:
			self.hash = {"type": "shingleprint", "value": ShinglePrint(text).features}

	@staticmethod
	def simhash_distance(s1, s2):
		x = (s1 ^ s2) & ((1 << 64) - 1)
		ans = 0
		while x:
			ans += 1
			x &= x - 1
		return ans


	@staticmethod
	def compare(h1, h2):
		if not h1 or not h2:
			return False
		if h1['type'] != h2['type']:
			return False
		if h1['type'] == "textmatch":
			return h1['value'] == h2['value']
		elif h1['type'] == "simhash":
			#print "-->%s"%+ TextHash.simhash_distance(h1['value'], h2['value'])
			return TextHash.simhash_distance(h1['value'], h2['value']) <= TextHash.simhash_threshold
		else:
			#print "-->%s"%+ ShinglePrint.score(h1['value'], h2['value'])
			return ShinglePrint.score(h1['value'], h2['value']) >= TextHash.shingleprint_threshold
		return False
