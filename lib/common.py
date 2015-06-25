# -*- coding: utf-8 -*- 

import sys
import subprocess as subprocess
import threading
from HTMLParser import HTMLParser


class Result:
	def __init__(self):
		self.errors = []
		self.url = ""
		self.parent = None
		self.redirects = 0
		self.out_of_scope = False #outOfScope
		self.redirect_has_content = False #redirectContent
		self.urlsfound = 0
		self.ajax = None
		self.script_tags = None # scritpTags
		self.websockets = None
		self.resources = None
		self.elements = None #interestingElements
		self.html = None

	def get_dict(self):
		ret = {			
			"url": self.url			
		}

		if len(self.errors) > 0:
			ret["errors"] = self.errors

		if self.parent:
			ret["parent"] = self.parent

		if self.redirects > 0:
			ret["redirects"] = self.redirects
			
		if self.out_of_scope:
			ret["out_of_scope"] = self.out_of_scope

		if self.redirect_has_content:
			ret["redirect_has_content"] = self.redirect_has_content

		if self.ajax:
			ret["ajax"] = self.ajax

		if self.script_tags:
			ret["script_tags"] = self.script_tags

		if self.websockets:
			ret["websockets"] = self.websockets	

		if self.resources:
			ret["resources"] = self.resources

		if self.elements:
			ret["elements"] = self.elements

		return ret


class UrlFinder:
	def __init__(self, html):
		self.html = html

	def get_urls(self):
		urls = []

		class UrlHTMLParser(HTMLParser):			
			def handle_starttag(self, tag, attrs):
				if tag == "a":
					urls.extend([attr[1] for attr in attrs if attr[0] == "href" and attr[1] != ""])
			
		try:
			parser = UrlHTMLParser()
			parser.feed(self.html)
		except:
			raise

		return urls



class CommandExecutor:
	"""
	Executes shell command and returns its output.
	The process is killed afer <timeout> seconds
	"""

	def __init__(self, cmd, stderr):
		self.cmd = cmd
		self.stderr = stderr

		
	def execute(self, timeout):

		def executor():					
			try:
				# close_fds=True is needed in threaded programs
				self.process = subprocess.Popen(self.cmd,stderr=self.stderr, stdout=subprocess.PIPE, bufsize=0, close_fds=sys.platform != "win32")
				self.out = self.process.communicate()[0]
			except Exception as e:
				raise
			
		thread = threading.Thread(target = executor)
		thread.start()
		
		thread.join(int(timeout))
	
		if thread.is_alive():								
			self.process.kill()
			thread.join()
			self.out = None

		return self.out



class UrlData:
	def __init__(self, parent = None, redirects = 0, set_cookie = []):		
		self.parent = parent
		self.redirects = redirects
		self.set_cookie = set_cookie


