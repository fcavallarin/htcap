# -*- coding: utf-8 -*-

from __future__ import unicode_literals
from urlparse import urljoin, urlsplit, parse_qsl
import getopt
import re
from core.scan.base_scanner import BaseScanner, ScannerThread
from core.scan.fuzzers.sqli_blind import Sqli_blind
from core.scan.fuzzers.sqli_error import Sqli_error
from core.scan.fuzzers.xss_reflected import XssReflected
from core.scan.fuzzers.cmdinjection import Cmdinjection
from core.scan.fuzzers.fileinclude import Fileinclude


class Native(BaseScanner):

	def init(self, argv):
		self.fuzzers = ['sqli_blind', 'sqli_error', 'xss_reflected', 'cmdinjection', 'fileinclude']
		self.enabled_fuzzers = self.fuzzers
		self.vulns = []
		self.tmp =0

		try:
			opts, args = getopt.getopt(argv, 'hf:')
		except getopt.GetoptError as err:
			print str(err)
			self.exit(1)

		for o, v in opts:
			if o == '-h':
				print self.usage()
				self.exit(0)
			elif o == '-f':
				self.enabled_fuzzers = v.split(",")


	def usage(self):
		return (	"Options are:\n"
				"  -h   this help\n"
				"  -f   comma-separated list of enabled fuzzers\n"
			)

	def add_vulns(self, vulns):
		self.lock.acquire()
		self.vulns.extend(vulns)
		self.lock.release()


	def end(self):
		print("\nTot vulnerabilities: %d (not vuln: %d)" % (len(self.vulns), self.tmp))
		pass


	def get_settings(self):
		return dict(
			request_types = "form,link,redirect,xhr,fetch",
			num_threads = 10
		)

	class Scan(ScannerThread):

		def run(self):
			request = self.request
			vulns = []
			if self.is_request_duplicated():
				return False

			self.sprint("Scanning %s %s" % (request.method, request.url))

			if 'sqli_error' in self.scanner.enabled_fuzzers:
				fuzzer = Sqli_error(self)
				vulnerabilities = fuzzer.fuzz()
				self.save_vulnerabilities([{"type":'sqli_error',"description": v} for v in vulnerabilities])

				vulns.extend(vulnerabilities)

			if 'sqli_blind' in self.scanner.enabled_fuzzers:
				fuzzer = Sqli_blind(self)
				vulnerabilities = fuzzer.fuzz()
				self.save_vulnerabilities([{"type":'sqli_blind',"description": v} for v in vulnerabilities])
				vulns.extend(vulnerabilities)

			if 'xss_reflected' in self.scanner.enabled_fuzzers:
				#self.sprint("  check for reflected xss")
				fuzzer = XssReflected(self)
				vulnerabilities = fuzzer.fuzz()
				self.save_vulnerabilities([{"type":'xss_reflected',"description": v} for v in vulnerabilities])
				vulns.extend(vulnerabilities)

			if 'fileinclude' in self.scanner.enabled_fuzzers:
				#self.sprint("  check for fileinclude")
				fuzzer = Fileinclude(self)
				vulnerabilities = fuzzer.fuzz()
				self.save_vulnerabilities([{"type":'fileinclude',"description": v} for v in vulnerabilities])
				vulns.extend(vulnerabilities)

			if len(vulns) > 0:
				parent = self.scanner.db.get_request(request.parent_db_id)
				self.sprint("%s contains vulnerable request: %s"  % (parent.url if parent else "/", request))
				self.sprint("\033[31m%s %s   %s\033[0m" % (request.method, request.url, request.data))
				for v in vulns:
					self.sprint("   %s" % v)
				self.sprint("-"*32)
			else:
				self.scanner.tmp += 1
			self.scanner.add_vulns(vulns)
