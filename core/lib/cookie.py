# -*- coding: utf-8 -*- 

"""
HTCAP - www.htcap.org
Author: filippo.cavallarin@wearesegment.com

This program is free software; you can redistribute it and/or modify it under 
the terms of the GNU General Public License as published by the Free Software 
Foundation; either version 2 of the License, or (at your option) any later 
version.
"""

import time
import cookielib
from urllib import quote
from urlparse import urlparse, urljoin

class Cookie:
	"""
	RFC 6265
	"""

	def __init__(self, cookie, setter=None):
		self.name = (str(cookie['name']) if 'name' in cookie and cookie['name'] else None)
		self.domain = (str(cookie['domain']) if 'domain' in cookie and cookie['domain'] else None)
		self.path = (str(cookie['path']) if 'path' in cookie and cookie['path'] else "/")

		# setter is the url that set this cookie, it's used to handle cookies with domain=None
		# if both domain and setter are None then no domain restrictions are applied (used when cookied are loaded from db)
		self.setter = urlparse(setter) if setter else None


		# if self.domain[0] != ".":
		# 	self.domain = "." + self.domain

		self.update(cookie)


	def update(self, cookie):
		self.value = (str(cookie['value']) if 'value' in cookie and cookie['value'] else None)
		self.expires = (cookie['expires'] if 'expires' in cookie else None)
		self.secure = (cookie['secure'] if 'secure' in cookie else False)
		self.httponly = (cookie['httponly'] if 'httponly' in cookie else False)



	def __eq__(self, other):
		return  (other
				and self.name == other.name
				and self.path == other.path
				and (self.domain == None or other.domain == None or self.domain == other.domain)
				)

	def get_string(self):
		return "%s=%s; path = %s" % (self.name, self.value, self.path)#self.setter)



	# if domain is set it is valid for all subdomains
	# if domain is not set it is valid only for the setter's domain 
	def is_valid_for_url(self, url):
		purl = urlparse(url)
		# the preceding dot in domain is optional so .foo.com and foo.com are the same
		if self.domain is None:
			# domain is considered the domain of setter
			# the cookie is valid if url's domain is EQUAL to setter's domain
			# if setter is None, no domain restrictions are applied (ie when loading cookies from db)
			if self.setter and purl.hostname != self.setter.hostname: return False
		else:
			if not purl.hostname: return False
			# url is valid ALSO if it is a subdomain of self.domain
			sh = [t for t in self.domain.split(".")[::-1] if t] # skip empty vals (in case of .foo.bar)
			uh = purl.hostname.split(".")[::-1]
			# @TODO DO NOT trust self.domain blindely .. check if = to setter...
			if uh[:len(sh)] != sh: return False

		if self.path:
			# check if url's path is equal or subfolder of self.path
			if not purl.path: return False
			sp = [t for t in self.path.split("/") if t]
			up = [t for t in purl.path.split("/") if t]
			if up[:len(sp)] != sp: return False

		# @TODO!!!
		if self.expires:
			pass

		#print "%s is valid for %s" % (self.get_string(), url)

		return True


	# def get_json(self):
	# 	return json.dumps(self, default=lambda o: o.__dict__, sort_keys=True)

	def get_dict(self):
		return dict(
			name = self.name,
			value = self.value,
			domain = self.domain,
			path = self.path,
			secure = self.secure,
			expires = self.expires, 
			httponly = self.httponly
		)


	def get_cookielib_cookie(self):
		return cookielib.Cookie(
			version = 0, 
			name = self.name,
			value = self.value,
			port = None, 
			port_specified = False, 
			domain =  self.domain if self.domain else "" , # is this ok?
			domain_specified = True, 
			domain_initial_dot = False, 
			path = self.path,
			path_specified = True, 
			secure = self.secure,
			expires = self.expires, 
			discard = True, 
			comment = None, 
			comment_url = None, 
			rest = None
		)


	def get_as_netscape(self):
		"""
		7 tab delimited properties:
			domain - The domain that created AND that can read the variable. 
			flag - A TRUE/FALSE value indicating if all machines within a given domain can access 
				the variable. This value is set automatically by the browser, depending on the value you set for domain. 
			path - The path within the domain that the variable is valid for. 
			secure - A TRUE/FALSE value indicating if a secure connection with the domain is needed      to access the variable. 
			expiration - The UNIX time that the variable will expire on. UNIX time is defined as   the number of seconds since Jan 1, 1970 00:00:00 GMT. 
			name - The name of the variable. 
			value - The value of the variable.
		"""

		domain = self.domain
		if domain:
			if not domain.startswith("."): domain = ".%s" % domain
		else:
			domain = self.setter.hostname if self.setter else "."

		# @TODO capire come e se settare 'flag'
		flag = "TRUE"
		# @TODO non è chiaro cosa setto se il cookie non ha expire date .. per ora lo setto nel futuro e pace
		expiry = self.expires if self.expires else (time.time() + (3600 * 24 * 7))
		values = (domain, flag, self.path, ("TRUE" if self.secure else "FALSE"), expiry, self.name, self.value)
		return "%s\t%s\t%s\t%s\t%d\t%s\t%s" % values

	def __str__(self):
		return "Cookie: %s=%s" % (self.name, self.value)

