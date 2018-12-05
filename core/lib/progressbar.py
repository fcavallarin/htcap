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

import time
import sys
from core.lib.utils import *


class Progressbar:
	def __init__(self, start_time, label, width=33):
		self.start_time = start_time
		self.label = label
		self.width = width
		self.prc = "="
		self.pdc = " "
		self.head = "["
		self.tail = "]"
		self._lastlen = 0


	def out(self, tot, scanned):
		perc = (scanned * self.width) / (tot if tot > 0 else 1)
		pad = self.width - perc
		tm = int(time.time() - self.start_time) / 60
		bar = "%s%s%s%s" % (self.head, self.prc*perc, self.pdc*pad, self.tail)
		s = "%s   %d of %d %s in %d minutes" % (bar, scanned, tot, self.label, tm)

		if self._lastlen:
			sys.stdout.write("\b"*self._lastlen)
		self._lastlen = len(s)
		stdoutw(s)