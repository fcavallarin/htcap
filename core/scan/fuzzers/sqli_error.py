# -*- coding: utf-8 -*-

"""
HTCAP - 1.1
Author: filippo.cavallarin@wearesegment.com

This program is free software; you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation; either version 2 of the License, or (at your option) any later
version.
"""

from __future__ import unicode_literals
import sys
import time
import re
import os
import urllib2


from core.lib.exception import *
from core.crawl.lib.shared import *


from core.lib.request import Request
from core.lib.cookie import Cookie

from core.lib.utils import *
from core.constants import *

from core.scan.base_fuzzer import BaseFuzzer


import ssl
import socket

payloads =  [
		"'",
		")"
]


# taken from sqlmap
responses = {

	"mysql": [
		r'SQL syntax.*?MySQL',
		r'Warning.*?mysql_',
		r'MySqlException \(0x',
		r'MySQLSyntaxErrorException',
		r'valid MySQL result',
		r'check the manual that corresponds to your (MySQL|MariaDB) server version',
		r'Unknown column \'[^ ]+\' in \'field list\'',
		r'MySqlClient\.',
		r'com\.mysql\.jdbc\.exceptions',
		r'Zend_Db_Statement_Mysqli_Exception',
		r'Fatal error\:[ ]* Uncaught Error\:'
	],

    "postgresql": [
        r'PostgreSQL.*?ERROR',
        r'Warning.*?\Wpg_',
        r'valid PostgreSQL result',
        r'Npgsql\.',
        r'PG::SyntaxError:',
        r'org\.postgresql\.util\.PSQLException',
        r'ERROR:\s\ssyntax error at or near',
        r'ERROR: parser: parse error at or near',
        r'PostgreSQL query failed',
        r'org\.postgresql\.jdbc',
    ],

    "mssql": [
        r'Driver.*? SQL[\-\_\ ]*Server',
        r'OLE DB.*? SQL Server',
        r'\bSQL Server[^&lt;&quot;]+Driver',
        r'Warning.*?(mssql|sqlsrv)_',
        r'\bSQL Server[^&lt;&quot;]+[0-9a-fA-F]{8}',
        r'System\.Data\.SqlClient\.SqlException',
        r'(?s)Exception.*?\WRoadhouse\.Cms\.',
        r'Microsoft SQL Native Client error \'[0-9a-fA-F]{8}',
        r'\[SQL Server\]',
        r'ODBC SQL Server Driver',
        r'ODBC Driver \d+ for SQL Server',
        r'SQLServer JDBC Driver',
        r'com\.jnetdirect\.jsql',
        r'SQLSrvException',
        r'macromedia\.jdbc\.sqlserver',
        r'com\.microsoft\.sqlserver\.jdbc',
    ],


    "sqlite": [
        r'SQLite/JDBCDriver',
        r'SQLite\.Exception',
        r'(Microsoft|System)\.Data\.SQLite\.SQLiteException',
        r'Warning.*?sqlite_',
        r'Warning.*?SQLite3::',
        r'\[SQLITE_ERROR\]',
        r'SQLite error \d+:',
        r'sqlite3.OperationalError:',
        r'SQLite3::SQLException',
        r'org\.sqlite\.JDBC',
    ]



}


class Sqli_error(BaseFuzzer):

	def init(self):
		self.vulnerabilities = []

	def check_response(self, body):
		body = self.utils.strip_html_tags(body)
		for rtype in responses:
			for regex in responses[rtype]:
			#print regex
				if re.search(regex, body, re.M):
					return True
		return False


	def fuzz(self):
		mutations = self.get_mutations(self.request, payloads)
		for m in mutations:
			try:
				resp = m.send(ignore_errors=True)
			except Exception as e:
				self.sprint("Error: %s" % e)
				continue

			if not resp or not resp.body:
				continue

			if self.check_response(resp.body):
				#self.sprint("\n   \033[31mFound: %s\n  %s %s\033[0m" % (m.payload, m.url, m.body))
				self.vulnerabilities.append("%s=%s  %s" %  (m.parameter, m.payload,  m.body))
				mutations.next_parameter()
				continue
		return self.vulnerabilities
