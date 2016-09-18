#!/usr/bin/env python
# -*- coding: utf-8 -*- 


"""
HTCAP - beta 1
Author: filippo.cavallarin@wearesegment.com

This program is free software; you can redistribute it and/or modify it under 
the terms of the GNU General Public License as published by the Free Software 
Foundation; either version 2 of the License, or (at your option) any later 
version.
"""

import sys
import os
import sqlite3
import json
from urlparse import urlsplit
import glob
import importlib

reload(sys)
sys.setdefaultencoding('utf8')

sys.path.append(os.path.realpath(os.path.dirname(os.path.realpath(__file__)) + os.sep + ".."))

print "* WARNING: this script is here for back compatibility reasons and will be removed soon!!\n* Use 'htcap util report' instead"

mod = importlib.import_module("core.util.utilities.report")
run = getattr(mod, "Report")
run(['report'] + sys.argv[1::])
