# -*- coding: utf-8 -*- 

import cookielib


class Cookie:
	"""
	RFC 6265  
	"""

	def __init__(self, cookie):		
		self.name = (str(cookie['name']) if 'name' in cookie else None)	
		self.domain = (str(cookie['domain']) if 'domain' in cookie else None)			
		self.path = (str(cookie['path']) if 'path' in cookie else "/")

		# if self.domain[0] != ".":
		# 	self.domain = "." + self.domain
		
		self.update(cookie)
	

	def update(self, cookie):
		self.value = (str(cookie['value']) if 'value' in cookie else None)		
		self.expires = (cookie['expires'] if 'expires' in cookie else None)		
		self.secure = (cookie['secure'] if 'secure' in cookie else False)
		self.httponly = (cookie['httponly'] if 'httponly' in cookie else False)		

	def __eq__(self, other):
		return  (other
				and self.name == other.name				
				and self.path == other.path
				and (self.domain == None or other.domain == None or self.domain == other.domain)
				)
	

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
			domain = self.domain,
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




