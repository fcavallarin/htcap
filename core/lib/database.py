# -*- coding: utf-8 -*- 

"""
HTCAP - 1.1
http://htcap.org
Author: filippo.cavallarin@wearesegment.com

This program is free software; you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation; either version 2 of the License, or (at your option) any later
version.
"""

import sqlite3
import json
from core.lib.request import Request

class Database:
	def __init__(self,dbname, report_name = "" , infos = ""):
		self.dbname = dbname
		self.report_name = report_name
		self.conn = None


		self.qry_create_crawl_info = """
			CREATE TABLE crawl_info (
				htcap_version TEXT,
				target TEXT,
				start_date INTEGER,
				end_date INTEGER,
				commandline TEXT,
				user_agent TEXT,
				cookies TEXT,
				proxy TEXT,
				extra_headers TEXT
			)
		"""


		self.qry_create_request = """
			CREATE TABLE request (
				id INTEGER PRIMARY KEY AUTOINCREMENT, 
				id_parent INTEGER,
				type TEXT,
				method TEXT,
				url TEXT,
				referer TEXT,
				redirects INTEGER,
				data  TEXT NOT NULL DEFAULT '',
				cookies  TEXT NOT NULL DEFAULT '[]',
				http_auth  TEXT,
				extra_headers TEXT,
				out_of_scope INTEGER NOT NULL DEFAULT 0,
				trigger TEXT,
				crawled INTEGER NOT NULL DEFAULT 0,
				crawler_errors TEXT,
				html TEXT,
				user_output TEXT
			)
		"""

		self.qry_create_request_index ="""
			CREATE INDEX request_index ON request (type, method, url, http_auth, data, trigger)
		"""

		self.qry_create_request_child = """
			CREATE TABLE request_child (
				id INTEGER PRIMARY KEY AUTOINCREMENT, 
				id_request INTEGER NOT NULL,
				id_child INTEGER NOT NULL
			)
		"""

		self.qry_create_request_child_index ="""
			CREATE INDEX request_child_index ON request_child (id_request, id_child)
		"""

		self.qry_create_assessment = """
			CREATE TABLE assessment(
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				scanner TEXT,
				start_date INTEGER,
				end_date INTEGER
			)
		"""

		self.qry_create_vulnerability = """
			CREATE TABLE vulnerability(
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				id_assessment INTEGER,
				id_request INTEGER,
				type TEXT,
				description TEXT,
				error TEXT
			)
		"""



	def connect(self):
		self.conn = sqlite3.connect(self.dbname)
		self.conn.row_factory = sqlite3.Row 


	def close(self):
		self.conn.close()

	def begin(self):
		self.conn.isolation_level = None
		self.conn.execute("BEGIN TRANSACTION")

	def commit(self):
		self.conn.commit()

	def dict_from_row(self, row):
		return dict(zip(row.keys(), row)) 



	def create(self):

		try:
			self.connect()

			cur = self.conn.cursor()
			cur.execute(self.qry_create_crawl_info)
			cur.execute(self.qry_create_request)
			cur.execute(self.qry_create_request_index)
			cur.execute(self.qry_create_request_child)
			cur.execute(self.qry_create_request_child_index)
			cur.execute(self.qry_create_assessment)
			cur.execute(self.qry_create_vulnerability)

			cur.execute("INSERT INTO crawl_info values (NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)")

			self.conn.commit()
			self.close()

		except Exception as e:
			print "%s" % str(e)


	def save_crawl_info(self, htcap_version=None, target=None, start_date=None, end_date=None, commandline=None, user_agent=None, proxy=None, extra_headers=None, cookies=None):
		values = []
		pars = []

		if htcap_version:
			pars.append(" htcap_version=?")
			values.append(htcap_version)


		if target:
			pars.append(" target=?")
			values.append(target)

		if start_date:
			pars.append(" start_date=?")
			values.append(start_date)

		if end_date:
			pars.append(" end_date=?")
			values.append(end_date)

		if commandline:
			pars.append(" commandline=?")
			values.append(commandline)

		if user_agent:
			pars.append(" user_agent=?")
			values.append(user_agent)

		if proxy:
			pars.append(" proxy=?")
			values.append(proxy)

		if extra_headers:
			pars.append(" extra_headers=?")
			values.append(extra_headers)

		if cookies:
			pars.append(" cookies=?")
			values.append(cookies)


		qry = "UPDATE crawl_info SET %s" % ",".join(pars) 

		try:
			self.connect()
			cur = self.conn.cursor()
			cur.execute(qry, values)
			self.conn.commit()
			self.close()

		except Exception as e:
			print "%s" % str(e)


	def get_crawl_info(self):
		info = None
		qry = "SELECT * FROM crawl_info"
		try:
			self.connect()
			cur = self.conn.cursor()
			cur.execute(qry)
			info = self.dict_from_row(cur.fetchone())
			self.close()
		except Exception as e:
			raise

		return info





	def save_request(self, request):

		values = (
			request.parent_db_id,
			request.type,
			request.method,
			request.url, 
			request.referer,
			request.redirects,
			request.data,
			json.dumps([r.get_dict() for r in request.cookies]),
			request.http_auth if request.http_auth else "",
			json.dumps(request.extra_headers),
			1 if request.out_of_scope else 0,
			json.dumps(request.trigger) if request.trigger else "",
			request.html if request.html else "",
			json.dumps(request.user_output) if len(request.user_output) > 0 else ""
		)
		qry = "INSERT INTO request (id_parent, type, method, url, referer, redirects, data, cookies, http_auth, extra_headers, out_of_scope, trigger, html, user_output) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)"

		# ignore referer and cookies.. correct?
		values_select = (
			request.type,
			request.method,
			request.url, 
			request.http_auth if request.http_auth else "",
			request.data,
			json.dumps(request.trigger) if request.trigger else ""
		)

		# include trigger in query to save the same request with different triggers
		# (normally requests are compared using type,method,url and data only) 
		qry_select = "SELECT * FROM request WHERE type=? AND method=? AND url=? AND http_auth=? AND data=? AND trigger=?"


		try:
			cur = self.conn.cursor()
			cur.execute(qry_select, values_select)
			existing_req = cur.fetchone()
			req_id = 0
			if not existing_req:
				cur.execute(qry, values)
				cur.execute("SELECT last_insert_rowid() AS id")
				request.db_id = cur.fetchone()['id']
				req_id = request.db_id
			else:
				req_id = existing_req['id']

			if request.parent_db_id:
				qry_child = "INSERT INTO request_child (id_request, id_child) VALUES (?,?)"
				cur.execute(qry_child, (request.parent_db_id, req_id))

		except Exception as e:
			print "%s" % str(e)



	def save_crawl_result(self, result, crawled):

		if result.request.db_id == 0: # start url has id=0
			return
		qry = "UPDATE request SET crawled=?, crawler_errors=?, html=?, user_output=? WHERE id=?"
		values = (
			1 if crawled else 0,
			json.dumps(result.errors),
			result.request.html if result.request.html else "",
			json.dumps(result.request.user_output) if len(result.request.user_output) > 0 else "",
			result.request.db_id
		)

		try:
			cur = self.conn.cursor()
			cur.execute(qry, values)
		except Exception as e:
			print "%s" % str(e)




	def get_requests(self, types = "xhr", where=None):
		types = types.split(",")
		ret = []
		qry = "SELECT * FROM request WHERE out_of_scope=0 AND type IN (%s) and %s order by id desc" % (",".join("?"*len(types)), "1" if where is None else where)
		try:
			self.connect()
			cur = self.conn.cursor()
			cur.execute(qry, types)
			for r in cur.fetchall():
				# !! parent must be null (or unset)
				req = Request(r['type'], r['method'], r['url'], referer=r['referer'], data=r['data'], json_cookies=r['cookies'], db_id=r['id'], parent_db_id=r['id_parent'], extra_headers=json.loads(r['extra_headers']))
			 	ret.append(req)
			self.close()
		except Exception as e:
			print "114 %s" % str(e)

		return ret



	def get_request(self, id):
		req = None
		qry = "SELECT * FROM request WHERE out_of_scope=0 AND id=?"
		try:
			self.connect()
			cur = self.conn.cursor()
			cur.execute(qry, (str(id),))
			r = cur.fetchone()
			# !! parent must be null (or unset)
			if r:
				req = Request(r['type'], r['method'], r['url'], referer=r['referer'], data=r['data'], json_cookies=r['cookies'], db_id=r['id'], parent_db_id=r['id_parent'], extra_headers=json.loads(r['extra_headers']))
			self.close()
		except Exception as e:
			raise
			print "44 %s" % str(e)

		return req

	def create_assessment(self,scanner, date):

		qry = "INSERT INTO assessment (scanner, start_date) values (?,?)"
		try:
			self.connect()

			cur = self.conn.cursor()

			cur.execute(qry, (scanner, date))
			cur.execute("SELECT last_insert_rowid() as id")
			id = cur.fetchone()['id']
			self.conn.commit()
			self.close()
			return id
		except Exception as e:
			print "33%s" % str(e)



	def save_assessment(self,id_assessment, end_date):

		qry = "UPDATE assessment SET end_date=? WHERE id=?"
		try:
			self.connect()
			cur = self.conn.cursor()
			cur.execute(qry, (end_date, id_assessment))
			self.conn.commit()
			self.close()
		except Exception as e:
			print "2 %s" % str(e)



	def insert_vulnerability(self,id_assessment, id_request, type, description, error = ""):

		qry = "INSERT INTO vulnerability (id_assessment, id_request, type, description, error) values (?,?,?,?,?)"
		try:
			self.connect()

			cur = self.conn.cursor()

			cur.execute(qry, (id_assessment, id_request, type, description, error))
			self.conn.commit()
			self.close()

		except Exception as e:
			print "1 %s" % str(e)


	def insert_vulnerabilities(self, id_assessment, id_request, vulnerabilities):
		error = "" # @TODO
		qry = "INSERT INTO vulnerability (id_assessment, id_request, type, description, error) values (?,?,?,?,?)"
		try:
			self.connect()
			cur = self.conn.cursor()
			for v in vulnerabilities:
				cur.execute(qry, (id_assessment, id_request, v['type'], v['description'], error))
			self.conn.commit()
			self.close()

		except Exception as e:
			print "insert vulns %s" % str(e)
