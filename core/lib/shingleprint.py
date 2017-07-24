# -*- coding: utf-8 -*- 

"""
HTCAP 
Author: filippo.cavallarin@wearesegment.com

This program is free software; you can redistribute it and/or modify it under 
the terms of the GNU General Public License as published by the Free Software 
Foundation; either version 2 of the License, or (at your option) any later 
version.



The shingleprint.py code has been converted from the c source code of the simhash linux command
writted by Bart Massey.

The algorithm used by simhash is Manassas' "shingleprinting" algorithm: take a 
hash of every m-byte subsequence of the file, and retain the n of these hashes 
that are numerically smallest. The size of the intersection of the hash sets of
two files gives a statistically good estimate of the similarity of the files as
a whole.

References:
Linux simhash man
http://www.linuxcertif.com/man/1/simhash/

Mark Manasse, Microsoft Research Silicon Valley. Finding similar things quickly 
in large collections. http://research.microsoft.com/research/sv/PageTurner/similarity.htm

Andrei Z. Broder. On the resemblance and containment of documents. 
In Compression and Complexity of Sequences (SEQUENCES'97), pages 21-29. IEEE Computer Society,
1998. ftp://ftp.digital.com/pub/DEC/SRC/publications/broder/positano-final-wpnums.pdf

Andrei Z. Broder. Some applications of Rabin's fingerprinting method. Published in 
R. Capocelli, A. De Santis, U. Vaccaro eds., Sequences II: Methods in Communications,
Security, and Computer Science, Springer-Verlag, 1993. http://athos.rutgers.edu/~muthu/broder.ps

"""
from __future__ import division
import sys
import os
import time
import pipes
import re
from zlib import crc32

#from core.lib.thirdparty.simhash import Simhash

from urlparse import urlsplit, urljoin, parse_qsl
from core.lib.exception import *
from core.constants import *

class ShinglePrint:
	#size = 64
	nfeatures = 128

	def __init__(self, text):
		self.text = text
		self.tokens = self._shingle()
		self.heap = HeapMax(self.nfeatures)
		self.hash_queue = HashQueue(self.nfeatures)

		self.features = self._hash_tokens()

	def _shinglew(self):
		w = 4
		s = self.text.lower().strip()
		tks = s.split()
		if len(tks) < w:
			return [s]
		arr = []
		for i in range(len(tks)-(w-1)):
			arr.append(" ".join(tks[i:i+w]))
		return arr

	def _shingle(self):
		w = 8
		s = self.text #.lower().strip()
		tks = s
		if len(tks) < w:
			return [s]
		arr = []
		for i in range(len(tks)-(w-1)):
			arr.append("".join(tks[i:i+w]))
		return arr


	def _hash_tokens(self):
		for t in self.tokens:
			h = crc32(t) & 0xffffffff
			#print "got %x %d %d" % ((h&0xffffffff), self.heap.nheap, self.nfeatures)
			if self.heap.nheap == self.nfeatures and h >= self.heap.heap[0]:
				continue
			#print "0x%x < 0x%x" % (h, self.heap.heap[0])
			if self.hash_queue.hash_contains(h):
				#print "dup"
				continue

			if self.heap.nheap == self.nfeatures:
				m = self.heap.heap_extract_max()
				self.hash_queue.hash_delete(m)
				#print "pop   %x   [%s]" % (m&0xffffffff, " ".join(["%x" % (c & 0xffffffff) for c in self.heap.heap]))

			self.hash_queue.hash_insert(h)
			self.heap.heap_insert(h)
			#print "push %x   [%s]" % (h&0xffffffff, " ".join(["%x" % (c & 0xffffffff) for c in self.heap.heap]))

		#print "END  [%s]" %  " ".join(["%x" % (c & 0xffffffff) for c in self.heap.heap])
		return self.heap.get_features()

	@staticmethod
	def score(f1, f2):
		unionsize = 0.0
		intersectsize = 0.0
		i1 = len(f1) - 1
		i2 = len(f2) - 1
		count = 0
		matchcount = 0
		while i1 >= 0 and i2 >= 0:
			#print "%x %d" % (f1[i1],i1)
			if f1[i1] < f2[i2]:
				i1 -= 1
				continue
			if f1[i1] > f2[i2]:
				i2 -= 1
				continue
			matchcount += 1
			i1 -= 1
			i2 -= 1
		count = min(len(f1), len(f2))
		intersectsize = matchcount
		unionsize = 2 * count - matchcount
		return intersectsize / unionsize

	@staticmethod
	def similarity(x, y):
		i = (x & y)
		u = (x | y)
		# print "%x %x" % (x, y)
		# print "%f %f" % (ShinglePrint.hammingWeight(i), ShinglePrint.hammingWeight(u))
		return ShinglePrint.hammingWeight(i) / ShinglePrint.hammingWeight(u)

	@staticmethod
	def hammingWeight(l):
		#for(c = 0; l; c++) l &= l-1;
		c = 0
		while l:
			l &= l - 1
			c += 1
		return c





class HeapMax:

	def __init__(self, size):
		self.nheap = 0
		self.maxheap = size
		self.heap = [0] * size

	def downheap(self):
		tmp = 0
		i = 0
		while True:
			left = (i << 1) + 1;
			right = left + 1;
			if left >= self.nheap:
				return
			if right >= self.nheap:
				if self.heap[i] < self.heap[left]:
					tmp = self.heap[left]
					self.heap[left] = self.heap[i]
					self.heap[i] = tmp
				return

			if self.heap[i] >= self.heap[left] and self.heap[i] >= self.heap[right]:
				return

			if self.heap[left] > self.heap[right]:
				tmp = self.heap[left]
				self.heap[left] = self.heap[i]
				self.heap[i] = tmp
				i = left
			else:
				tmp = self.heap[right]
				self.heap[right] = self.heap[i]
				self.heap[i] = tmp
				i = right

	def get_features(self):
		f = []
		while self.nheap > 0:
			f.append(self.heap_extract_max())
		return f

	def heap_extract_max(self):
		assert(self.nheap > 0)
		m = self.heap[0]
		self.nheap -= 1
		self.heap[0] = self.heap[self.nheap]
		self.downheap()
		return m

	def upheap(self):
		i = self.nheap - 1;
		assert(self.nheap > 0)
		while i > 0:
			parent = (i - 1) >> 1
			if self.heap[parent] >= self.heap[i]:
				return
			tmp = self.heap[parent];
			self.heap[parent] = self.heap[i];
			self.heap[i] = tmp;
			i = parent;

	def heap_insert(self, v):
		assert(self.nheap < self.maxheap)
		self.heap[self.nheap] = v
		self.nheap += 1
		self.upheap()




class HashQueue:
	EMPTY = 0
	FULL = 1
	DELETED = 2

	def __init__(self, size):
		def next_pow2(n):
			m = 1;
			while n > 0:
				n >>= 1
				m <<= 1
			return m

		self.hash = None
		self.occ = None
		self.nhash = 7 * size
		self.nhash = next_pow2(self.nhash)
		self.hash_alloc()

	def hash_alloc(self):
		self.hash = [0] * self.nhash
		self.occ = [0] * self.nhash
		for i in range(self.nhash):
			self.occ[i] = self.EMPTY


	# Since the input values are crc's, we don't
	# try to hash them at all!  they're plenty random
	# coming in, in principle. 

	def do_hash_insert(self, crc):
		h = crc
		for count in range(self.nhash):
			i = int(h) & (self.nhash - 1);
			if self.occ[i] != self.FULL:
				self.occ[i] = self.FULL
				self.hash[i] = crc
				return 1
			if self.hash[i] == crc:
				return 1
			h += 2 * (self.nhash / 4) + 1;
		return 0


	# idiot stop-and-copy for deleted references
	def gc(self):
		oldhash = self.hash;
		oldocc = self.occ;
		self.hash_alloc()

		for i in range(self.nhash):
			if oldocc[i] == self.FULL:
				if not self.do_hash_insert(oldhash[i]):
					print "internal error: gc failed, table full"
					sys.exit(1);


	def hash_insert(self, crc):
		if self.do_hash_insert(crc):
			return
		self.gc()
		if self.do_hash_insert(crc):
			return
		print "internal error: insert failed, table full"


	def do_hash_contains(self, crc):
		h = crc
		for count in range(self.nhash):
			i = int(h) & (self.nhash - 1);
			if self.occ[i] == self.EMPTY:
				return 0
			if self.occ[i] == self.FULL and self.hash[i] == crc:
				return 1
			h += 2 * (self.nhash / 4) + 1
		return -1



	def hash_contains(self, crc):
		result = self.do_hash_contains(crc);
		if result >= 0:
			return result
		self.gc()
		result = self.do_hash_contains(crc);
		if result >= 0:
			return result
		print "internal error: can't find value, table full"


	def do_hash_delete(self, crc):
		h = crc
		for count in range(self.nhash):
			i = int(h) & (self.nhash - 1)
			if self.occ[i] == self.FULL and self.hash[i] == crc:
				self.occ[i] = self.DELETED
				return 1

			if self.occ[i] == self.EMPTY:
				return 0
			h += 2 * (self.nhash / 4) + 1

		return -1


	def hash_delete(self, crc):
		result = self.do_hash_delete(crc)
		if result >= 0:
			return result
		self.gc()
		result = self.do_hash_delete(crc)
		if self.result >= 0:
			return result
		print "internal error: delete failed, table full"



