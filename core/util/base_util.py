# -*- coding: utf-8 -*- 

"""
HTCAP - beta 1
Author: filippo.cavallarin@wearesegment.com

This program is free software; you can redistribute it and/or modify it under 
the terms of the GNU General Public License as published by the Free Software 
Foundation; either version 2 of the License, or (at your option) any later 
version.
"""

from __future__ import unicode_literals
import sys
import getopt 

class BaseUtil:

	@staticmethod
	def get_settings():
		return dict(
			descr = "",
			optargs = '',
			minargs = 0
		)

	def usage(self):
		return (
			"%s\n"
			"usage: %s\n"
			% (self.get_settings()['descr'], self.utilname)
		)

	def __init__(self, argv, db_file=None):
		self.utilname = argv[0]
		settings = self.get_settings()

		if len(argv) < (settings['minargs'] + 1):
			print self.usage()
			sys.exit(1)

		try:
			opts, args = getopt.getopt(argv[1:], settings['optargs'])
		except getopt.GetoptError as err:
			print str(err)
			sys.exit(1)

		self.main(args, opts, db_file)
