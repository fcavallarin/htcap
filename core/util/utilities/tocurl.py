# -*- coding: utf-8 -*- 
import sys
import sqlite3
import json

from core.lib.utils import *
from core.util.base_util import BaseUtil

reload(sys)
sys.setdefaultencoding('utf8')


class Tocurl(BaseUtil):

	@staticmethod
	def get_settings():
		return dict(
			descr = "Export saved requests to curl arguments",
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
		qry = "SELECT method, url, data, referer, cookies FROM request WHERE %s"

		dbfile = args[0]
		where = args[1] if len(args) > 1 else "1=1"

		conn = sqlite3.connect(dbfile)
		conn.row_factory = sqlite3.Row 

		cur = conn.cursor()
		cur.execute(qry % where)
		for req in cur.fetchall():
			cookies = ["%s=%s" % (c['name'],c['value']) for c in json.loads(req['cookies'])]
			cookies_str = "Cookie: %s" % ";".join(cookies) if len(cookies) > 0 else ""
			method = "POST" if req['method'] == "POST" else "GET"
			referer = "Referer: %s" % req['referer'] if req['referer'] else ""
			cmd = [ "-k", '-H',cookies_str, '-X', method, '-H', referer, req['url']]
			if req['data']:
				cmd.extend(['--data', req['data']])

			print cmd_to_str(cmd)
