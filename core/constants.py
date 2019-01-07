# -*- coding: utf-8 -*- 

"""
HTCAP - beta 1
Author: filippo.cavallarin@wearesegment.com

This program is free software; you can redistribute it and/or modify it under 
the terms of the GNU General Public License as published by the Free Software 
Foundation; either version 2 of the License, or (at your option) any later 
version.
"""


THSTAT_WAITING = 0
THSTAT_RUNNING = 1

CRAWLSCOPE_DOMAIN = "domain"
CRAWLSCOPE_DIRECTORY = "directory"
CRAWLSCOPE_URL = "url"


CRAWLMODE_PASSIVE = "passive"
CRAWLMODE_ACTIVE = "active"
CRAWLMODE_AGGRESSIVE = "aggressive"

REQTYPE_LINK = "link"
REQTYPE_XHR = "xhr"
REQTYPE_FETCH = "fetch"
REQTYPE_WS = "websocket"
REQTYPE_JSONP = "jsonp"
REQTYPE_FORM = "form"
REQTYPE_REDIRECT = "redirect"
REQTYPE_IMAGE = "image"
REQTYPE_UNKNOWN = "unknown"


ERROR_CONTENTTYPE = "contentType"
ERROR_TIMEOUT = "timeout"
ERROR_PROBE_TO = "probe_timeout"
ERROR_LOAD = "loaderror"
ERROR_PROBEKILLED = "probe_killed"
ERROR_PROBEFAILURE = "probe_failure"
ERROR_MAXREDIRECTS = "too_many_redirects"
ERROR_CRAWLDEPTH = "crawler_depth_limit_reached"
VULNTYPE_SQLI = "sqli"
VULNTYPE_XSS = "xss"

METHOD_GET = "GET"
METHOD_POST = "POST"
