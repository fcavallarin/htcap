# -*- coding: utf-8 -*- 
import sys
import sqlite3
import json

from core.util.base_util import BaseUtil

class Lsvuln(BaseUtil):

	@staticmethod
	def get_settings():
		return dict(
			descr = "List all vulnerabilities",
			optargs = '',
			minargs = 0,
			use_dbfile = True
		)

	def usage(self):
		return (
			"%s\n"
			"usage: %s <dbfile> [<sql_where_clause>]\n" 
			% (self.get_settings()['descr'], self.utilname)
		)

	def main(self, args, opts, db_file):
		qry = """
			SELECT scanner,start_date,end_date,id_request,type,description FROM assessment a 
			INNER JOIN vulnerability av ON a.id=av.id_assessment
			WHERE
			%s
		"""

		where = args[0] if len(args) > 0 else "1=1"

		conn = sqlite3.connect(db_file)
		conn.row_factory = sqlite3.Row 

		cur = conn.cursor()
		cur.execute(qry % where)
		for vuln in cur.fetchall():
			print(vuln['description'])
			print("- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - ")

