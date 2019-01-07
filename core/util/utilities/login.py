# -*- coding: utf-8 -*- 

"""
HTCAP - htcap.org
Author: filippo.cavallarin@wearesegment.com

This program is free software; you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation; either version 2 of the License, or (at your option) any later
version.
"""

import sys
import sqlite3
import json
import getopt 
import os
import getpass

from core.lib.utils import *
from core.lib.shell import CommandExecutor
from core.util.base_util import BaseUtil
from core.lib.cookie import Cookie

reload(sys)
sys.setdefaultencoding('utf8')

class Login(BaseUtil):

	@staticmethod
	def get_settings():
		return dict(
			descr = "Login to a webapp to get session cookies and logout urls",
			optargs = 'p:HJhAcl',
			minargs = 2
		)

	def usage(self):
		return (
			"%s\n"
			"usage: %s [options] <url> <username> [<text_of_submit_element>]\n"
			"Options:\n"
			"   -h            This help\n"
			"   -p PASSWD     Set login password\n"
			"   -c            Do not output cookies\n"
			"   -l            Do not output logout urls\n"
			"   -H            Format output as htcap arguments\n"
			"   -J            Format output as json (for cookies only)\n"
			"   -A            Format output as general command line arguments\n"
			% (self.get_settings()['descr'], self.utilname)
		)


	def main(self, args, opts, db_file=None):
		passw = None
		format = None
		out_cookies = True
		out_logouts = True
		for o,v in opts:
			if o == "-h":
				print self.usage()
				sys.exit(0)
			elif o == "-p":
				passw = v
			elif o == "-c":
				out_cookies = False
			elif o == "-l":
				out_logouts = False
			elif o in  ("-H", "-J", "-A"):
				format = o

		if not passw:
			print "The password is hidden here BUT it will be passed to phantomjs via commandline ..."
			try:
				passw = getpass.getpass()
			except KeyboardInterrupt:
				print "\nAbort..."
				sys.exit(0)

		jspath = "%s%s%s%s" % (getrealdir(__file__), "login", os.sep, "login.js")
		cmd = get_phantomjs_cmd() + [jspath, args[0], args[1], passw]
		if len(args) > 2: cmd.append(args[2])
		#print cmd_to_str(cmd)
		exe = CommandExecutor(cmd, True)
		out, err = exe.execute(20)
		if err:
			print "Unable to login"
			sys.exit(1)

		try:
			ret = json.loads(out)
		except ValueError as e:
			print e
			sys.exit(1)
		allcookies, logouts = ret
		cookies = []
		if out_cookies:
			for c in reversed(allcookies):
				cookie = Cookie(c)
				if not cookie in cookies: cookies.append(cookie)
		if not out_logouts:
			logouts = []

		if not format:
			print "Cookies:"
			for c in cookies:
				print " %s=%s" % (c.name, c.value)
			print "Logout urls:"
			for u in logouts:
				print " %s" % u
		elif format == "-A":
			for c in cookies:
				print cmd_to_str([c.name, c.value])
			for u in logouts:
				print cmd_to_str([u])
		elif format == "-H":
			args = []
			if len(cookies) > 0:
				args = ["-c", ";".join(["%s=%s" % (c.name, c.value) for c in cookies])]
			if len(logouts) > 0:
				args.extend(["-x", ",".join(logouts)])
			if len(args) > 0:
				print cmd_to_str(args)
		elif format == "-J":
			cd = []
			for c in cookies:
				cd.append(c.get_dict())
			if out_cookies:
				print json.dumps(cd)


