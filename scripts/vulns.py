#!/usr/bin/env python
# -*- coding: utf-8 -*- 
import sys
import sqlite3
import json

reload(sys)  
sys.setdefaultencoding('utf8')

qry = """
	SELECT scanner,start_date,end_date,id_request,type,description FROM assessment a 
	INNER JOIN vulnerability av ON a.id=av.id_assessment
	WHERE
	%s
"""

if len(sys.argv) < 2:
	print "usage: %s <dbfile> [<final_part_of_query>]\n   base query: %s" % (sys.argv[0], qry)
	sys.exit(1)

dbfile = sys.argv[1]
where = sys.argv[2] if len(sys.argv) > 2 else "1=1"

conn = sqlite3.connect(dbfile)
conn.row_factory = sqlite3.Row 

cur = conn.cursor()
cur.execute(qry % where)
for vuln in cur.fetchall():	
	print vuln['description']
	print "- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - "

