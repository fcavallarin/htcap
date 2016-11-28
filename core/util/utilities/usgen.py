# -*- coding: utf-8 -*- 

"""
HTCAP - htcap.org
Author: filippo.cavallarin@wearesegment.com

This program is free software; you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation; either version 2 of the License, or (at your option) any later
version.
"""

import sys
import json
import os

from core.lib.utils import *
from core.util.base_util import BaseUtil


class Usgen(BaseUtil):

	@staticmethod
	def get_settings():
		return dict(
			descr = "Generate a sample user script",
			optargs = '',
			minargs = 1
		)

	def usage(self):
		return (
			"%s\n"
			"usage: %s  <file>\n"
			% (self.get_settings()['descr'], self.utilname)
		)


	def main(self, args, opts):
		usfile = generate_filename(args[0], 'js', False, True)
		try:
			with open(usfile,'w') as f:
				f.write(CONTENT)
			print "User Script saved to %s" % usfile
		except Exception as e:
			print "Unable to write file %s" % usfile
			sys.exit(1)


CONTENT = """/*
UI Methods:
	ui.print(message) - save a per-request user message into the request table
	ui.fread(path_to_file) - read from file
	ui.fwrite(path_to_file, content, mode) - write to file
	ui.render(path_to_file) - save a screenshot of the page current state
	ui.triggerEvent(element, event) - trigger an event
*/

{
  onInit: function(ui){
    // override natove methods
    window.prompt = function(){ return "AAA" };
    // init local variables
    ui.vars.cnt = 0; 
  },

  onStart: function(ui){}, 

  onTriggerEvent: function(ui, element, event){
    // cancel trigger if element has class kill-all
    if(element.matches(".kill-all")) return false;
  },

  onEventTriggered: function(ui, element, event){},

  onFillInput: function(ui, element){
    // here it's possible to force a value or prevent it to be filled
    // WARNING: do NOT set dynamic values! for instance something like
    //  element.value = Math.random()
    // will lead to INFINITE CRAWLING if you crawl forms

    if(element.id == "car_vendor"){
      element.value = "Ferrari";
      return false;
    }
  },

  onXhr: function(ui, request){
    // cancel XHR request if url matches XXX
    if(request.url.match(/XXX/))
      return false
  },

  onAllXhrsCompleted: function(ui){},

  onDomModified: function(ui, rootElements, allElements){
    // save a screenshot on every DOM change
    ui.render(ui.id + "-screen-" + ui.vars.cnt + ".png");
    ui.vars.cnt++; 
  },

  onEnd: function(ui){} 
}
"""

