# -*- coding: utf-8 -*- 
import sys
import sqlite3
import json
import os

from core.util.base_util import BaseUtil

reload(sys)
sys.setdefaultencoding('utf8')


class Lsajax(BaseUtil):

	@staticmethod
	def get_settings():
		return dict(
			descr = "List all pages and related ajax calls",
			optargs = 'd',
			minargs = 1
		)

	def usage(self):
		return (
			"usage: %s <dbfile> [<sql_where_clause>]\n"
			"  Options:\n    -d    print POST data\n\n"
			% self.utilname
		)

	def main(self, args, opts, db_file=None):
		qry = """
			SELECT r.id, r.url as page, r.referer, a.method, a.url,a.data,a.trigger
			FROM request r inner join request a on r.id=a.id_parent
			WHERE (a.type='xhr' or a.type='fetch')
			AND
			%s
		"""

		# try:
		# 	opts, args = getopt.getopt(argv[1:], 'd')
		# except getopt.GetoptError as err:
		# 	print str(err)
		# 	sys.exit(1)


		# if len(args) < 1:
		# 	print (
		# 		"usage: %s <dbfile> [<final_part_of_query>]\n"
		# 		"  Options:\n    -d    print POST data\n\n"
		# 		"  Base query: %s" % (argv[0], qry)
		# 	)
		# 	sys.exit(1)


		print_post_data = False

		for o, v in opts:
			if o == '-d':
				print_post_data = True


		dbfile = args[0] if not db_file else db_file

		if not os.path.exists(dbfile):
			print "No such file %s" % dbfile
			sys.exit(1)

		where = args[1] if len(args) > 1 else "1=1"

		conn = sqlite3.connect(dbfile)
		conn.row_factory = sqlite3.Row 

		cur = conn.cursor()
		cur.execute(qry % where)
		pages = {}
		for res in cur.fetchall():
			page = (res['id'], res['page'], res['referer'])
			trigger = json.loads(res['trigger']) if res['trigger'] else None
			trigger_str = "%s.%s() -> " % (trigger['element'], trigger['event']) if trigger else ""
			data = " data: %s" % (res['data']) if print_post_data and res['data'] else ""
			descr = "  %s%s %s%s" % (trigger_str, res['method'], res['url'], data)

			if page in pages: 
				pages[page].append(descr) 
			else: 
				pages[page] = [descr]

		for page,ajax in pages.items():
			print "Request ID: %s\nPage URL:   %s\nReferer:    %s\nAjax requests:" % page 
			for aj in ajax:
				print aj
			print "- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - \n"
