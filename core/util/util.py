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
import importlib
from glob import glob
from core.lib.utils import *

class Util:

	def get_mod(self, path, name):
		mod = importlib.import_module("%s.%s" % (path, name))
		return getattr(mod, name.title())


	def __init__(self, argv, db_file=None):
		util = argv[0] if len(argv) >= 1 else ""
		mp = "core.util.utilities"
		fp = "%s%sutilities" % (getrealdir(__file__), os.sep)
		utils = [os.path.basename(m).split(".")[0] for m in glob(os.path.join(fp , '[a-z]*[a-z].py'))]

		if not util in utils:
			utils.sort()
			print("Available utilities are:")
			for u in utils:
				run = self.get_mod(mp, u)
				print("   %s%s%s" % (u, " "*(20 - len(u)), run.get_settings()['descr'].split("\n")[0]))
			sys.exit(1)

		run = self.get_mod(mp, util)
		args = [db_file] if db_file else []
		args.extend(argv[1:])
		run(args, util)