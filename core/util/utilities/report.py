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
import os
import sqlite3
import json
from urlparse import urlsplit
from core.util.base_util import BaseUtil
from core.lib.utils import *
reload(sys)
sys.setdefaultencoding('utf8')



class Report(BaseUtil):

	def dict_from_row(self, row):
		return dict(zip(row.keys(), row))

	@staticmethod
	def get_settings():
		return dict(
			descr = "Generate the html report",
			optargs = '',
			minargs = 1,
			use_dbfile = True
		)

	def usage(self):
		return (
			"%s\n"
			"usage: %s <dbfile> <outfile>\n"
			% (self.get_settings()['descr'], self.utilname)
		)


	def get_report(self, cur):
		report = []
		qry = """
			SELECT r.type,
			 r.id,
			 r.url,
			 r.type,
			 r.method,
			 r.data,
			 r.http_auth,
			 r.referer,
			 r.cookies,
			 r.extra_headers,
			 r.out_of_scope,
			 ri.trigger,
			 r.crawler_errors,
			 (ri.id is not null) AS has_requests,
			 ri.id AS req_id,
			 ri.type AS req_type,
			 ri.method AS req_method,
			 ri.url AS req_url,
			 ri.data AS req_data,
			 ri.cookies AS req_cookies,
			 ri.extra_headers AS req_extra_headers
			FROM request r
			LEFT JOIN request_child rc ON r.id=rc.id_request
			LEFT JOIN request ri ON ri.id = rc.id_child
			WHERE
			r.type IN ('link', 'redirect','form')
			and (has_requests=0 OR req_type IN ('xhr','form','websocket','fetch', 'jsonp'))
		"""

		try:
			cur.execute(qry)
			for r in cur.fetchall():
				report.append(self.dict_from_row(r))
		except Exception as e:
			print str(e)

		return report

	def get_assessment_vulnerabilities(self, cur, id_request):
		report = []
		qry = """
			SELECT type, description FROM vulnerability WHERE id_request IN (
				SELECT id FROM request WHERE (
					id=? AND type IN ('link','redirect')) OR
					(id_parent=? AND type IN ('xhr','jsonp','form','websocket','fetch')
				)
			)
		"""

		try:

			cur.execute(qry, (id_request,id_request))
			for r in cur.fetchall():
				report.append(json.dumps({"type":r['type'], "description":r['description']}))
		except Exception as e:
			print str(e)


		return report


	def get_crawl_info(self, cur):
		crawl = None
		qry = """
			SELECT *,
			 (SELECT htcap_version FROM crawl_info) AS htcap_version,
			 (SELECT COUNT(*) FROM request WHERE crawled=1) AS pages_crawled
			FROM crawl_info
		"""

		try:

			cur.execute(qry)
			crawl = self.dict_from_row(cur.fetchone())
		except Exception as e:
			print str(e)

		return crawl

	def get_request_cmp_tuple(self, row):
		# http_auth in included in the url
		return (row['url'], row['method'], row['data'])

	def add_http_auth(self, url, auth):
		purl = urlsplit(url)
		return purl._replace(netloc="%s@%s" % (auth, purl.netloc)).geturl()

	def get_json(self, cur):
		report = self.get_report(cur)
		infos = self.get_crawl_info(cur)

		ret = dict(
			infos= infos,
			results = []
		)

		for row in report:
			if row['http_auth']:
				row['url'] = self.add_http_auth(row['url'], row['http_auth'])

			if self.get_request_cmp_tuple(row) in [self.get_request_cmp_tuple(r) for r in ret['results']]: continue
			d = dict(
				id = row['id'],
				url = row['url'],
				type = row['type'],
				method = row['method'],
				data = row['data'],
				referer = row['referer'],
				cookies = row['cookies'],
				extra_headers = row['extra_headers'],
				xhr = [],
				fetch = [],
				jsonp = [],
				websocket = [],
				form = [],
				errors = json.loads(row['crawler_errors']) if row['crawler_errors'] else [],
				vulnerabilities =  self.get_assessment_vulnerabilities(cur, row['id'])
			)
			if row['out_of_scope']: d['out_of_scope'] = True

			if row['has_requests']:
				for r in report:
					if r['id'] != row['id']: continue

					if r['req_type'] == "jsonp" and r['req_url'].find("?") == -1:
						continue

					trigger = json.loads(r['trigger']) if 'trigger' in r and r['trigger'] else None # {'event':'ready','element':'[document]'}

					d[r['req_type']].append({
						"id": r['req_id'],
						"type": r['req_type'],
						"method": r['req_method'],
						"url": r['req_url'],
						"data": r['req_data'],
						"cookies": r['req_cookies'],
						"extra_headers": r['req_extra_headers'],
						"trigger": "%s.%s()" % (trigger['element'], trigger['event']) if trigger else ""
					})

			if row['has_requests'] or row['out_of_scope'] or len(d['errors']) > 0 or len(d['vulnerabilities']) > 0:
				ret['results'].append(d)

		return json.dumps(ret)






	def main(self, args, opts, db_file):

		base_dir = os.path.dirname(os.path.realpath(__file__)) + os.sep + "htmlreport" + os.sep

		outfile = args[0]

		if os.path.exists(outfile):
			sys.stdout.write("File %s already exists. Overwrite [y/N]: " % outfile)
			if sys.stdin.read(1) != "y":
				sys.exit(1)
			os.remove(outfile)

		conn = sqlite3.connect(db_file)
		conn.row_factory = sqlite3.Row
		cur = conn.cursor()

		base_html = (
			"<html>\n"
			"<head>\n"
			"<meta http-equiv='Content-Type' content='text/html; charset=utf-8' />\n"
			"<style>\n%s\n</style>\n"
			"<script>\n%s\n%s\n</script>\n"
			"</head>\n"
			"%s\n"
			"</html>\n"
		)


		jsn = "var report = %s;\n" % self.get_json(cur)

		with open("%sreport.html" % base_dir) as html, open("%sreport.js" % base_dir) as js, open("%sstyle.css" % base_dir) as css:
			html = base_html % (css.read(), jsn, js.read(), html.read())

		with open(outfile,'w') as out:
			out.write(html)

		print "Report saved to %s" % outfile

