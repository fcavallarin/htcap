# -*- coding: utf-8 -*- 

import sqlite3
import json

class Database:
	def __init__(self,dbname, report_name, infos):
		self.dbname = dbname
		self.infos = infos
		self.report_id = None
		self.report_name = report_name		
		self.conn = None

		
		self.qry_create_report = """
			CREATE TABLE report (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT,
				target TEXT,
				urls_scanned INTEGER,
				scan_time INTEGER,
				scan_date INTEGER,
				commandline TEXT
			)
		"""

		self.qry_create_result = """
			CREATE TABLE result (	
				id INTEGER PRIMARY KEY AUTOINCREMENT, 
				id_report INTEGER, 				
				url TEXT,
				parent TEXT,
				out_of_scope INTEGER,
				errors TEXT,
				ajax TEXT,
				script_tags TEXT,
				websockets TEXT,
				resources TEXT,
				elements TEXT,				
				html TEXT
			)
		"""

		self.qry_insert_report = """
			INSERT INTO report (
				name,
				target,
				urls_scanned,
				scan_time,
				scan_date,
				commandline) 
				VALUES (?,?,?,?,?,?)
		"""

		self.qry_insert_result = """
			INSERT INTO result (
				id_report, 
				url, 
				parent, 
				out_of_scope, 
				errors, 
				ajax, 
				script_tags, 
				websockets, 
				resources, 
				elements, 
				html) 
				VALUES (?,?,?,?,?,?,?,?,?,?,?)
		"""

	def create(self):
		values = (
			self.report_name,
			self.infos['target'],
			self.infos['urls_scanned'],
			self.infos['scan_time'],
			self.infos['scan_date'],
			self.infos['command_line']
		)
		#if exists..
		try:
			self.connect()
		
			cur = self.conn.cursor()
			cur.execute(self.qry_create_report)
			cur.execute(self.qry_create_result)
			cur.execute(self.qry_insert_report, values)
			cur.execute("SELECT last_insert_rowid()")
			self.report_id = cur.fetchone()[0]
			self.conn.commit()	
			self.close()

		except Exception as e:
			print str(e)

	def connect(self):
		self.conn = sqlite3.connect(self.dbname)

	def close(self):
		self.conn.close()


	def save_result(self, result):		
		values = (
			self.report_id, 
			result.url, 
			result.parent,
			1 if result.out_of_scope else 0,
			json.dumps(result.errors) if result.errors else None,
			json.dumps(result.ajax) if result.ajax else None,
			json.dumps(result.script_tags) if result.script_tags else None,
			json.dumps(result.websockets) if result.websockets else None,
			json.dumps(result.resources) if result.resources else None,
			json.dumps(result.elements) if result.elements else None,
			result.html
		)
		
		try:
			cur = self.conn.cursor()			
			cur.execute(self.qry_insert_result, values)
			self.conn.commit()
		except Exception as e:
			print str(e)

