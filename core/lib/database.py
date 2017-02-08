# -*- coding: utf-8 -*- 

"""
HTCAP - beta 1
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
	def __init__(self, dbname):
		"""
		constructor

		:param dbname: name of the database
		"""
		self.dbname = dbname
		self.conn = None

	def __str__(self):
		return self.dbname

	def connect(self):
		"""
		open connection
		"""
		self.conn = sqlite3.connect(self.dbname)
		self.conn.row_factory = sqlite3.Row

	def close(self):
		"""
		close connection
		"""
		self.conn.close()

	def begin(self):
		"""
		send a "BEGIN TRANSACTION" command
		"""
		self.conn.isolation_level = None
		self.conn.execute(_BEGIN_TRANSACTION_QUERY)

	def commit(self):
		"""
		commit transaction(s) to the current database
		"""
		self.conn.commit()

	def initialize(self):
		"""
		connect, create the base structure then close connection
		"""

		self.connect()

		cur = self.conn.cursor()
		cur.execute(_CREATE_CRAWL_INFO_TABLE_QUERY)
		cur.execute(_CREATE_REQUEST_TABLE_QUERY)
		cur.execute(_CREATE_REQUEST_INDEX_QUERY)
		cur.execute(_CREATE_REQUEST_CHILD_TABLE_QUERY)
		cur.execute(_CREATE_REQUEST_CHILD_INDEX_QUERY)
		cur.execute(_CREATE_ASSESSMENT_TABLE_QUERY)
		cur.execute(_CREATE_VULNERABILITY_TABLE_QUERY)

		cur.execute("INSERT INTO crawl_info VALUES (NULL, NULL, NULL, NULL, NULL, NULL)")

		self.commit()
		self.close()


	def save_crawl_info(
			self,
			htcap_version=None, target=None, start_date=None, end_date=None, commandline=None, user_agent=None):
		"""
		connect, save the provided crawl info then close the connection

		:param htcap_version: version of the running instance of htcap
		:param target: start url of the crawl
		:param start_date: start date of the crawl
		:param end_date:  end date of the crawl
		:param commandline: parameter given to htcap for the crawl
		:param user_agent: user defined agent
		"""
		values = []
		pars = []

		if htcap_version:
			pars.append("htcap_version=?")
			values.append(htcap_version)

		if target:
			pars.append("target=?")
			values.append(target)

		if start_date:
			pars.append("start_date=?")
			values.append(start_date)

		if end_date:
			pars.append("end_date=?")
			values.append(end_date)

		if commandline:
			pars.append("commandline=?")
			values.append(commandline)

		if user_agent:
			pars.append("user_agent=?")
			values.append(user_agent)

		qry = "UPDATE crawl_info SET %s" % ", ".join(pars)

		try:
			self.connect()
			cur = self.conn.cursor()
			cur.execute(qry, values)
			self.commit()
			self.close()

		except Exception as e:
			print(str(e))

	def save_request(self, request):
		"""
		save the given request (do NOT open or close the connection)

		if it is a new request (do not exist in the db), it is inserted.
		if it has a parent request, it is bound to it

		:param request: request to be saved
		"""

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
			1 if request.out_of_scope else 0,
			json.dumps(request.trigger) if request.trigger else "",
			request.html if request.html else "",
			json.dumps(request.user_output) if len(request.user_output) > 0 else ""
		)
		qry = "INSERT INTO request (id_parent, type, method, url, referer, redirects, data, cookies, http_auth, out_of_scope, trigger, html, user_output) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)"

		# ignore referrer and cookies.. correct?
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
			print(str(e))

	def save_crawl_result(self, result, crawled):
		"""
		save the given result ie. update an existing request with the result (do NOT open or close the connection)

		:param result: result to save
		:param crawled: (boolean) have been crawled
		"""
		if result.request.db_id == 0:  # start url has id=0
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
			print(str(e))

	def get_requests(self, types="xhr"):
		"""
		return a list of request matching the given types

		connect, retrieve the requests list then close the connection

		:param types: string of types (comma separated)
		:return: list of matching request
		"""
		types = types.split(",")
		ret = []
		qry = "SELECT * FROM request WHERE out_of_scope=0 AND type IN (%s)" % ",".join("?" * len(types))
		try:
			self.connect()
			cur = self.conn.cursor()
			cur.execute(qry, types)
			for r in cur.fetchall():
				# !! parent must be null (or unset)
				req = Request(
					r['type'], r['method'], r['url'], referer=r['referer'], data=r['data'],
					json_cookies=r['cookies'], db_id=r['id'], parent_db_id=r['id_parent']
				)
				ret.append(req)
			self.close()
		except Exception as e:
			print(str(e))

		return ret

	def create_assessment(self, scanner, date):
		"""
		connect, create a new assessment then close the connection
		:param scanner:
		:param date:
		:return: id of the newly created assessment
		"""

		qry = "INSERT INTO assessment (scanner, start_date) VALUES (?,?)"
		try:
			self.connect()

			cur = self.conn.cursor()

			cur.execute(qry, (scanner, date))
			cur.execute("SELECT last_insert_rowid() as id")
			id = cur.fetchone()['id']
			self.commit()
			self.close()
			return id
		except Exception as e:
			print(str(e))

	def save_assessment(self, id_assessment, end_date):
		"""
		connect, update the existing assessment with the given end date

		:param id_assessment:
		:param end_date:
		"""
		qry = "UPDATE assessment SET end_date=? WHERE id=?"
		try:
			self.connect()
			cur = self.conn.cursor()
			cur.execute(qry, (end_date, id_assessment))
			self.commit()
			self.close()
		except Exception as e:
			print(str(e))

	def insert_vulnerability(self, id_assessment, id_request, type, description, error=""):
		"""
		connect, create a vulnerability then close the connection

		:param id_assessment:
		:param id_request:
		:param type:
		:param description:
		:param error: default=""
		"""
		qry = "INSERT INTO vulnerability (id_assessment, id_request, type, description, error) VALUES (?,?,?,?,?)"
		try:
			self.connect()

			cur = self.conn.cursor()

			cur.execute(qry, (id_assessment, id_request, type, description, error))
			self.commit()
			self.close()

		except Exception as e:
			print(str(e))


_CREATE_CRAWL_INFO_TABLE_QUERY = """
		CREATE TABLE crawl_info (
			htcap_version TEXT,
			target TEXT,
			start_date INTEGER,
			end_date INTEGER,
			commandline TEXT,
			user_agent TEXT
		)
	"""

_CREATE_REQUEST_TABLE_QUERY = """
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
				out_of_scope INTEGER NOT NULL DEFAULT 0,
				trigger TEXT,
				crawled INTEGER NOT NULL DEFAULT 0,
				crawler_errors TEXT,
				html TEXT,
				user_output TEXT
			)
		"""

_CREATE_REQUEST_INDEX_QUERY = """
		CREATE INDEX request_index ON request (type, method, url, http_auth, data, trigger)
	"""

_CREATE_REQUEST_CHILD_TABLE_QUERY = """
		CREATE TABLE request_child (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			id_request INTEGER NOT NULL,
			id_child INTEGER NOT NULL
		)
	"""

_CREATE_REQUEST_CHILD_INDEX_QUERY = """
		CREATE INDEX request_child_index ON request_child (id_request, id_child)
	"""

_CREATE_ASSESSMENT_TABLE_QUERY = """
		CREATE TABLE assessment(
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			scanner TEXT,
			start_date INTEGER,
			end_date INTEGER
		)
	"""

_CREATE_VULNERABILITY_TABLE_QUERY = """
		CREATE TABLE vulnerability(
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			id_assessment INTEGER,
			id_request INTEGER,
			type TEXT,
			description TEXT,
			error TEXT
		)
	"""

_BEGIN_TRANSACTION_QUERY = """BEGIN TRANSACTION"""
