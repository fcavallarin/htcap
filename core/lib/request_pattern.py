# -*- coding: utf-8 -*- 

"""
HTCAP - beta 1
Author: filippo.cavallarin@wearesegment.com

This program is free software; you can redistribute it and/or modify it under 
the terms of the GNU General Public License as published by the Free Software 
Foundation; either version 2 of the License, or (at your option) any later 
version.
"""

import time
import cookielib
from urllib import quote
from urlparse import urlparse, urljoin, parse_qs, urlsplit
import xml.etree.ElementTree as ET
import json


class RequestPattern:

	def __init__(self, request):
		self.request = request
		self.pattern = None

		self.set_pattern()


	def set_pattern(self):
		"""
		sets requst pattern for comparision
		"""

		# pattern[0] = url_pattern, pattern[1] = data_pattern
		self.pattern = [self.get_url_pattern(self.request.url), None]

		if self.request.method == "GET" or not self.request.data:
			return

		# try xml
		try:
			root = ET.fromstring(self.request.data)
			self.pattern[1] = self.get_xml_pattern(root)
		except Exception as e:
			# try json
			try:
				self.pattern[1] = self.get_json_pattern(self.request.data)
			except Exception as e:
				# try url-encoded
				try:
					self.pattern[1] = self.get_urlencoded_pattern(self.request.data, False)
				except Exception as e:
					#print "! UNKNOWN POST DATA FORMAT"
					pass



	def get_url_pattern(self, url):
		"""
		returns url pattern for comparision (query and data parameters are sorted and without values)
		"""
		purl = urlsplit(url)
		patt = [purl.scheme, purl.netloc, purl.path, self.get_urlencoded_pattern(purl.query)]

		return patt



	def get_xml_pattern(self, node):
		"""
		returns the xml tree as an array without values, example:

		<root>
			<node foo="bar" bar="foo"/>
			<elements index="1">
				<z>1</z>
				<z>1</z>
				<a type="int">123</a>
			</elements>
		</root> 

		['root', [      <--- child nodes sorted ('elements' comes before 'node')
			['elements', 'index', [
				['a', 'type'], ['z'], ['z']
			]], 
			['node', 'bar', foo']     <--- properties sorted ('bar' comes before 'foo')
		]]
		"""

		# describe a tag as its name plus the name of its properties (sorted)
		patt = [node.tag] + [x for x in sorted(node.attrib.keys())]

		#collect child nodes in the form of "node array" (tagname+props)
		ch = []
		for child in node:
			ch.append(self.get_xml_pattern(child))

		if ch:
			# sort using the tagname as the key
			ch.sort(key=lambda x:x[0])
			patt.append(ch) 

		return patt



	def get_json_pattern(self, data):
		"""
		returns an object with values set to zero (sorting of keys is not needed), example:
		"""

		patt = json.loads(data)
		self.nullify_object_values(patt)

		return patt



	def nullify_object_values(self, obj):
		"""
		sets to 0 all object values
		"""
		keys = obj.keys() if isinstance(obj, dict) else range(0, len(obj))

		for k in keys:
			if not hasattr(obj[k], '__iter__'):
				obj[k] = 0
			else:
				self.nullify_object_values(obj[k])



	def get_urlencoded_pattern(self, data, ignoreErrors = True):
		"""
		returns query parameters sorted and without vaules
		"""
		# parse_qs(qs[, keep_blank_values[, strict_parsing]])
		query = parse_qs(data, True, not ignoreErrors)
		return sorted(query.keys())


