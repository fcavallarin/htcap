# -*- coding: utf-8 -*- 
import sys
import sqlite3
import json

from core.util.base_util import BaseUtil

reload(sys)
sys.setdefaultencoding('utf8')

class Lsvuln(BaseUtil):

	@staticmethod
	def get_settings():
		return dict(
			descr = "List all vulnerabilities",
			optargs = '',
			minargs = 1
		)

	def usage(self):
		return (
			"%s\n"
			"usage: %s <dbfile> [<sql_where_clause>]\n" 
			% (self.get_settings()['descr'], self.utilname)
		)

	def main(self, args, opts, db_file=None):
		qry = """
			SELECT scanner,start_date,end_date,id_request,type,description FROM assessment a 
			INNER JOIN vulnerability av ON a.id=av.id_assessment
			WHERE
			%s
		"""

		dbfile = args[0] if not db_file else db_file
		where = args[1] if len(args) > 1 else "1=1"

		conn = sqlite3.connect(dbfile)
		conn.row_factory = sqlite3.Row 

		cur = conn.cursor()
		cur.execute(qry % where)
		for vuln in cur.fetchall():
			print vuln['description']
			print "- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - "

