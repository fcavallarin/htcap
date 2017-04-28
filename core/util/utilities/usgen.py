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
ui Methods:
    ui.pageEval(function) - evaluate function in the context of the webpage (no scope chain available)
    ui.print(message) - save a per-request user message into the request table
    ui.fread(path_to_file) - read from file
    ui.fwrite(path_to_file, content, mode) - write to file
    ui.render(path_to_file) - save a screenshot of the page current state
*/

 US = {
  onInit: function(ui){
    // init local variables
    ui.vars.cnt = 0;

    // override native methods
    ui.pageEval(function(){
        window.prompt = function(){ return "AAA" };
    });
  },

  onStart: function(ui){
    ui.pageEval(function(){});
  }, 

  onTriggerEvent: function(ui){
    var ok = ui.pageEval(function(element, event){
        if(event == "click" && element.className == 'kill'){
            return false;
        }
        return true;
    });
    // cancel triggering of event
    if(!ok) return false;
  },

  onEventTriggered: function(ui){
    ui.pageEval(function(element, event){});
  },

  onXhr: function(ui){
    var url = ui.pageEval(function(request){
        return request.url;
    });
    // cancel XHR request if url matches XXX
    if(url.match(/step=4/)){
        ui.print("Skipped XHR to " + url)
        return false;
    }
  },
  onFillInput: function(ui){
    // here it's possible to force a value or prevent it to be filled
    // WARNING: do NOT set dynamic values! for instance something like
    //  element.value = Math.random()
    // will lead to INFINITE CRAWLING if you crawl forms
    return ui.pageEval(function(element){
        if(element.id == "car_vendor"){
            element.value = "Ferrari";
            // prevent element value to be set
            return false;
        }
    });
  },
  onAllXhrsCompleted: function(ui){
    ui.pageEval(function(){});
  },

  onDomModified: function(ui){
    ui.pageEval(function(rootElements, allElements){});
    // save a screenshot on every DOM change
    ui.render(ui.id + "-screen-" + ui.vars.cnt + ".png");
    ui.vars.cnt++; 
  },

  onEnd: function(ui){
    ui.pageEval(function(){});
  } 
}
"""

