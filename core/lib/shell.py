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
import tempfile
import os
import signal

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
		self.returncode = -1

	# @TODO implement locking (this method is called by other threads)
	def kill(self):
		self.terminate(True)
		pidfile = os.path.join(tempfile.gettempdir(), "htcap-pids-%s" % self.process.pid)
		if os.path.isfile(pidfile):
			try:
				with open(pidfile, "r") as f:
					for p in f.read().split("\n"):
						os.kill(int(p), signal.SIGKILL)
				os.remove(pidfile)
			except:
				pass
		self.thread.join()

	# @TODO implement locking (this method is called by other threads)
	def terminate(self, kill=False):
		if not self.process:
			return
		if sys.platform != "win32":
			try:
				os.killpg(self.process.pid, signal.SIGINT if not kill else signal.SIGKILL)
			except:
				pass
		else:
			if not kill:
				self.process.terminate()
			else:
				self.process.kill()


	def execute(self, timeout):

		def executor():
			try:
				kwargs = {
					"stderr": subprocess.PIPE,
					"stdout": subprocess.PIPE,
					"bufsize": 0
				}
				if sys.platform != "win32":
					# close_fds=True is needed in threaded programs
					kwargs['close_fds'] = True
					kwargs['preexec_fn'] = os.setsid
				else:
					kwargs['close_fds'] = False
					kwargs['creationflags'] = subprocess.CREATE_NEW_PROCESS_GROUP

				self.process = subprocess.Popen(self.cmd, **kwargs)
				self.out, self.err = self.process.communicate()

			except Exception as e:
				print e
				raise

		self.thread = threading.Thread(target = executor)
		self.thread.start()

		self.thread.join(int(timeout) if timeout is not None else None)

		if self.thread.is_alive():
			self.kill()
			self.out = None
			self.err = "Executor: execution timeout"
		self.returncode = self.process.returncode
		return self.out if not self.stderr else (self.out, self.err)