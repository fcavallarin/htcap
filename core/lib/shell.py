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
import subprocess
import threading


class CommandExecutor:
	"""
	Executes shell command and returns its output.
	The process is killed afer <timeout> seconds
	"""

	def __init__(self, cmd, stderr = False):
		#self.cmd = cmd
		self.cmd = [c.encode("utf-8") for c in cmd]
		self.stderr = stderr		
		self.out = None
		self.err = None
		self.process = None
		self.thread = None
		

	def kill(self):
			self.process.kill()
			self.thread.join()
			

	def execute(self, timeout):
		
		def executor():					
			try:
				# close_fds=True is needed in threaded programs				
				self.process = subprocess.Popen(self.cmd,stderr=subprocess.PIPE, stdout=subprocess.PIPE, bufsize=0, close_fds=sys.platform != "win32")
				self.out, self.err = self.process.communicate()
				
			except Exception as e:
				raise
			
		self.thread = threading.Thread(target = executor)
		self.thread.start()
		
		self.thread.join(int(timeout))
	
		if self.thread.is_alive():
			self.kill()											
			self.out = None
			self.err = "Executor: execution timeout"

		return self.out if not self.stderr else (self.out, self.err)