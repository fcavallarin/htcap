#!/usr/bin/env python
# -*- coding: utf-8 -*- 
import sys
import sqlite3
import json

reload(sys)  
sys.setdefaultencoding('utf8')

qry = "SELECT method, url, data, referer, cookies FROM request WHERE %s"


if len(sys.argv) < 2:
	print "usage: %s <dbfile> [<final_part_of_query>]\n   base query: %s" % (sys.argv[0], qry)
	sys.exit(1)

dbfile = sys.argv[1]
where = sys.argv[2] if len(sys.argv) > 2 else "1=1"

conn = sqlite3.connect(dbfile)
conn.row_factory = sqlite3.Row 

cur = conn.cursor()
cur.execute(qry % where)
for req in cur.fetchall():	
	cookies = ["%s=%s" % (c['name'],c['value']) for c in json.loads(req['cookies'])]
	cookies_str = " -H 'Cookie: %s'" % " ;".join(cookies) if len(cookies) > 0 else ""
	method = " -X POST" if req['method'] == "POST" else ""
	referer = " -H 'Referer: %s'" % req['referer'] if req['referer'] else ""
	data = " --data '%s'" % req['data'] if req['data'] else ""
	
	print "%s%s%s%s '%s'" % (method, referer, cookies_str, data,req['url'])
