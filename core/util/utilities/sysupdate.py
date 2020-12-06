# -*- coding: utf-8 -*- 
import sys
import sqlite3
import json
import os
from pipes import quote
from core.util.base_util import BaseUtil
from core.lib.utils import get_cmd_path, getrealdir

class Sysupdate(BaseUtil):

	@staticmethod
	def get_settings():
		return dict(
			descr = "Updates htcap and node pakages",
			optargs = 'D',
			minargs = 0,
			use_dbfile = False
		)

	def usage(self):
		return (
			"usage: %s [-D]\n"
			"  Options:\n    -D    use development version\n\n"
			% self.utilname
		)

	def main(self, args, opts, db_file):
		base_dir = getrealdir(os.path.join(getrealdir(__file__), "..", ".."))
		node_dir = os.path.join(base_dir, "core", "nodejs")
		dev = False
		for o, v in opts:
			if o == '-D':
				dev = True

		git = get_cmd_path("git")
		if not git:
			print("Error: git command not found")

		npm = get_cmd_path("npm")
		if not npm:
			print("Error: npm command not found")

		rc = os.system("cd %s && %s pull" % (quote(base_dir), git))
		if rc is not 0:
			print("Update error (git)")
			return rc
		if dev:
			os.system("cd %s && %s checkout developer" % (quote(base_dir), git))

		rc = os.system("cd %s && %s update --no-save" % (quote(node_dir), npm))
		if rc is not 0:
			print("Update error (npm)")
			return rc
		print("\nUpdate completed")


