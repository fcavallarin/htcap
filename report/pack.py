#!/usr/bin/python
# -*- coding: utf-8 -*- 
from __future__ import unicode_literals
import sys
import os
import re


reload(sys)  
sys.setdefaultencoding('utf8')

def fcont(file):
	try:
		f = open(os.path.dirname(os.path.realpath(__file__)) + os.sep + file,'r')
	except Exception as e:
		print str(e)
		return

	cont = f.read()#.encode('unicode-escape')
	f.close
	return cont


if __name__ == '__main__':
	devel = False
	if len(sys.argv) > 1:		
		devel = True
		jsonfile = sys.argv[1]

	
	base = fcont("report.html")
	style = fcont("style.css")
	report = fcont("report.js")
	json = "var report = %s;" % (fcont(jsonfile) if devel == True else "{{json}}")	

	base = base.replace("<link rel='stylesheet' href='style.css' type='text/css' />", "<style>\n%s\n</style>" % style)
	base = base.replace("<script src='json.js' type='text/javascript'></script>", "<script>\n%s\n</script>" % json)
	base = base.replace("<script src='report.js' type='text/javascript'></script>", "<script>\n"+report+"\n</script>" )
	
	
	fname = ("devel_report" if devel == True else "../base_report") + ".html"
	fil = open(fname,'w')

	fil.write(base)
	fil.close()
