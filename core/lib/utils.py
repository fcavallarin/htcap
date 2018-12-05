# -*- coding: utf-8 -*- 

"""
HTCAP - beta 1
Author: filippo.cavallarin@wearesegment.com

This program is free software; you can redistribute it and/or modify it under 
the terms of the GNU General Public License as published by the Free Software 
Foundation; either version 2 of the License, or (at your option) any later 
version.
"""

import sys
import os
import time
import pipes
import re
import posixpath
import subprocess

from urlparse import urlsplit, urljoin, parse_qsl
from core.lib.exception import *
from core.constants import *

def get_program_infos():
	infos = {
		"version": "1.1",
		"author_name": "Filippo Cavallarin",
		"author_email": "filippo.cavallarin@wearesegment.com"
	}

	return infos


def generate_filename(name, ext=None, out_file_overwrite=False, ask_out_file_overwrite=False):

	def fname():
		return ".".join([f for f in ft if f])

	ft = name.split(".")

	if not ext and len(ft) > 1:
		ext = ft[-1]

	# remove extension if present in name and equal to ext
	if ft[-1] == ext: ft.pop()

	# always append ext, even if None
	ft.append(ext)

	if ask_out_file_overwrite and os.path.exists(fname()):
		try:
			sys.stdout.write("File %s already exists. Overwrite [y/N]: " % fname())
			out_file_overwrite = sys.stdin.read(1) == "y"
		except KeyboardInterrupt:
			print "\nAborted"
			sys.exit(0)

	if not out_file_overwrite:
		bn = ft[-2]
		i = 1
		while os.path.exists(fname()):
			ft[-2] = "%s-%d" % (bn, i)
			i += 1

	return fname()


def cmd_to_str(cmd):
	ecmd = [pipes.quote(o) for o in cmd]
	return " ".join(ecmd)


def stdoutw(str):
	sys.stdout.write(str)
	sys.stdout.flush()


def getrealdir(path):
	return os.path.dirname(os.path.realpath(path)) + os.sep 


def join_qsl(qs):
	"""
	join a list returned by parse_qsl
	do not use urlencode since it will encode values and not just join tuples
	"""
	return "&".join(["%s=%s" % (k,v) for k,v in qs])


# ?a=1&a=2&a=3 -> ?a=3, ?a[]=1&a[]=2&a[]=3 -> UNCHANGED
def group_qs_params(url):
	purl = urlsplit(url)
	qs = parse_qsl(purl.query)
	nqs = list()

	for t in reversed(qs):
		if t[0].endswith("[]") or t[0] not in [f for f,_ in nqs]:
			nqs.append(t)


	purl = purl._replace(query = join_qsl(reversed(nqs)))

	return purl.geturl();



def normalize_url(url):
	# add http if scheme is not present 
	# if an url like 'test.com:80//path' is passed to urlsplit the result is:
	# (scheme='test.com',  path='80//path', ...)
	if not re.match("^[a-z]+://", url, re.I):
		url = "http://%s" % url

	purl = urlsplit(url)

	# no path and no query_string .. just ensure url ends with /
	if not purl.path:
		return "%s/" % purl.geturl()

	# group multiple / (path//to///file -> path/to/file)
	new_path = re.sub(r"/+","/", purl.path)
	# normalize ../../../
	new_path = posixpath.normpath(new_path)
	if purl.path.endswith('/') and not new_path.endswith('/'):
		new_path += '/'

	purl = purl._replace(path = new_path)

	return purl.geturl()




def extract_http_auth(url):
	"""
	returns a tuple with httpauth string and the original url with http auth removed
	http://foo:bar@example.local -> (foo:bar, http://example.local)
	"""

	purl = urlsplit(url)
	if not purl.netloc:
		return (None, url)
	try:
		auth, netloc = purl.netloc.split("@", 1)
	except:
		return (None, url)


	purl = purl._replace(netloc=netloc)

	return (auth, purl.geturl())




def remove_tokens(query):
	"""
	tries to detect and remove tokens from a query string
	used to compare request ignoring, for example, CSRF tokens
	"""

	qs = parse_qsl(query)
	nqs = []
	for k,v in qs:
		if len(v) < 32 or not re.match(r'^[a-z0-9\-_\.:=]+$', v, re.I):
			nqs.append((k,v))

	return join_qsl(nqs)



def get_cmd_path(exe_name):
	standard_paths = [os.getcwd()]
	envpath = os.environ['PATH'].split(os.pathsep)
	
	if sys.platform != "win32":
		# force check to standard paths in case $PATH is not set (ie crontab)
		standard_paths.extend(["/usr/bin", "/usr/local/bin", "/usr/share/bin"])
	else:
		exe_name = "%s.exe" % exe_name

	exe_paths = ["%s%s%s" % (p, os.sep, exe_name) for p in standard_paths + envpath]

	for exe in exe_paths:
		if os.path.isfile(exe):
			return exe

	return None


def get_phantomjs_cmd():
	return [get_cmd_path("phantomjs"), "--ignore-ssl-errors=yes", "--web-security=false", "--ssl-protocol=any", "--debug=false"]


def get_node_cmd():
	c = get_cmd_path("node")
	if not c:
		c = get_cmd_path("nodejs")
	return [c]


def url_is_valid(url):
	purl = urlsplit(url)

	if not purl.scheme or not purl.netloc:
		return False

	# ensure netloc is in the form "something dot something"
	#if not re.match(r'^[^\.]+\..*(?<!\.)$', purl.netloc, re.I):
	if not re.match(r'^.+\..+$', purl.netloc):
		return False

	return True



def check_dependences(base_dir, usePhantomjs=False):
	errors = []
	if not get_cmd_path("node") and not get_cmd_path("nodejs"):
		errors.append("nodejs")

	npm = get_cmd_path("npm")
	if not npm:
		errors.append("npm")

	probe_dir = os.path.join(base_dir, 'probe', 'chrome-probe')
	node_deps = ""
	try:
		node_deps = subprocess.check_output(get_node_cmd() + [os.path.join(probe_dir, 'ckdeps.js')])
	except:
		pass

	if node_deps != "":
		#errors.append("puppeteer")
		sys.stdout.write("Puppeteer is missing, install it via npm? [Y/n]: ")
		if sys.stdin.read(1) != "n":		
			print "Installing Puppeteer"
			try:
				npm_install = subprocess.call("cd %s && %s install" % (probe_dir, npm), shell=True)
			except Exception as e:
				errors.append("npm_install_exception")
				
			if not npm_install:
				errors.append("npm_install")
		else:
			errors.append("puppeteer")				

	return errors
