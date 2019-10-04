# -*- coding: utf-8 -*- 
import sys
import sqlite3
import json
import getopt 
import os

from core.util.base_util import BaseUtil

reload(sys)
sys.setdefaultencoding('utf8')

class Updcookie(BaseUtil):

	@staticmethod
	def get_settings():
		return dict(
			descr = "Update the value of a cookie of saved requests",
			optargs = '',
			minargs = 2,
			use_dbfile = True
		)

	def usage(self):
		return (
			"%s\n"
			"usage: %s <dbfile> <cookie_name> <cookie_value> [<sql_where_clause>]\n" 
			% (self.get_settings()['descr'], self.utilname)
		)


	def main(self, args, opts, db_file):
		qry = """
			SELECT id, cookies
			FROM request 
			WHERE %s
		"""

		cname = args[0]
		cvalue = args[1]

		where = args[2] if len(args) > 2 else "1=1"

		conn = sqlite3.connect(db_file)
		conn.row_factory = sqlite3.Row 

		cur = conn.cursor()
		wcur = conn.cursor()
		cur.execute(qry % where)
		pages = {}
		for res in cur.fetchall():
			cookies = res['cookies']
			if cookies:
				#print cookies
				cookies = json.loads(cookies)
				for cookie in cookies:
					if cookie['name'] == cname:
						cookie['value'] = cvalue
						wcur.execute("update request set cookies=? where id=?",(json.dumps(cookies), res['id']))

		conn.commit()
		cur.close()
		wcur.close()
		conn.close()
