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
import getopt
import os

class BaseUtil:

	@staticmethod
	def get_settings():
		return dict(
			descr = "",
			optargs = '',
			minargs = 0, # minimum number of arguments (excluding dbfile if used)
			use_dbfile = True # Threat the first argument as dbfile
		)

	def usage(self):
		return (
			"%s\n"
			"usage: %s\n"
			% (self.get_settings()['descr'], self.utilname)
		)

	def __init__(self, argv, utilname):
		self.utilname = utilname
		settings = self.get_settings()

		if len(argv) - (1 if settings['use_dbfile'] else 0) < settings['minargs']:
			print(self.usage())
			sys.exit(1)

		if settings['use_dbfile']:
			db_file = argv[0]
			argv = argv[1:]

			if not os.path.exists(db_file):
				print("No such file: %s" % db_file)
				sys.exit(1)
		else:
			db_file = None

		try:
			opts, args = getopt.getopt(argv, settings['optargs'])
		except getopt.GetoptError as err:
			print(str(err))
			sys.exit(1)


		self.main(args, opts, db_file)
