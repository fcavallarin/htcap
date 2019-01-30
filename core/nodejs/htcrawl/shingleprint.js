/*
HTCRAWL - 1.0
http://htcrawl.org
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


*/

exports.initTextComparator = function(){

	function ShinglePrint(text){
		//#size = 64
		this.nfeatures = 128;

		this.text = text;
		this.features = null;
	}

	ShinglePrint.prototype.init = function(){
		this.tokens = this._shingle()
		this.heap = new this.HeapMax(this.nfeatures)
		this.hash_queue = new this.HashQueue(this.nfeatures)
		this.hash_queue.init();

		this.features = this._hash_tokens()
	}


	ShinglePrint.prototype.compare = function(features){
		var tfeatures = this.getFeatures();

		return this.score(tfeatures, features);
	}

	ShinglePrint.prototype.getFeatures = function(){
		if(!this.features)
			this.init();
		return this.features;
	}


	ShinglePrint.prototype._shinglet = function(s){
			var w = 4;
			//s = this.text;
			if(typeof s == 'string')
				s =  Array.prototype.slice.call(s, 0);

			var tks = s //.toLowerCase().trim().split(" ");
			if (tks.length < w) return [s];

			var arr = [];
			for(let i = 0; i < tks.length - (w-1); i++){
				arr.push(tks.slice(i, i+w).join(""))
			}
			// for i in range(len(tks)-(w-1)):
			// 	arr.append(" ".join(tks[i:i+w]))
			return arr
	};


	ShinglePrint.prototype._shinglew = function(){
			var w = 4;
			s = this.text;
			if(typeof s == 'string')
				s =  Array.prototype.slice.call(s, 0);

			var tks = s.toLowerCase().trim().split(" ");
			if (tks.length < w) return [s];

			var arr = [];
			for(let i = 0; i < tks.length - (w-1); i++){
				arr.push(tks.slice(i, i+w).join(" "))
			}
			// for i in range(len(tks)-(w-1)):
			// 	arr.append(" ".join(tks[i:i+w]))
			return arr
	};

	ShinglePrint.prototype._shingle = function(){
			var w = 8;
			s = this.text //#.toLowerCase().trim();
			if(typeof s == 'string')
				s =  Array.prototype.slice.call(s, 0);
			var tks = s;
			if (tks.length < w) return [s];

			var arr = [];
			for(let i = 0; i < tks.length - (w-1); i++){
				arr.push(tks.slice(i, i+w).join(""))
			}
			return arr
	};

	ShinglePrint.prototype.crc32 = function(str){
		var a_table = "00000000 77073096 EE0E612C 990951BA 076DC419 706AF48F E963A535 9E6495A3 0EDB8832 79DCB8A4 E0D5E91E 97D2D988 09B64C2B 7EB17CBD E7B82D07 90BF1D91 1DB71064 6AB020F2 F3B97148 84BE41DE 1ADAD47D 6DDDE4EB F4D4B551 83D385C7 136C9856 646BA8C0 FD62F97A 8A65C9EC 14015C4F 63066CD9 FA0F3D63 8D080DF5 3B6E20C8 4C69105E D56041E4 A2677172 3C03E4D1 4B04D447 D20D85FD A50AB56B 35B5A8FA 42B2986C DBBBC9D6 ACBCF940 32D86CE3 45DF5C75 DCD60DCF ABD13D59 26D930AC 51DE003A C8D75180 BFD06116 21B4F4B5 56B3C423 CFBA9599 B8BDA50F 2802B89E 5F058808 C60CD9B2 B10BE924 2F6F7C87 58684C11 C1611DAB B6662D3D 76DC4190 01DB7106 98D220BC EFD5102A 71B18589 06B6B51F 9FBFE4A5 E8B8D433 7807C9A2 0F00F934 9609A88E E10E9818 7F6A0DBB 086D3D2D 91646C97 E6635C01 6B6B51F4 1C6C6162 856530D8 F262004E 6C0695ED 1B01A57B 8208F4C1 F50FC457 65B0D9C6 12B7E950 8BBEB8EA FCB9887C 62DD1DDF 15DA2D49 8CD37CF3 FBD44C65 4DB26158 3AB551CE A3BC0074 D4BB30E2 4ADFA541 3DD895D7 A4D1C46D D3D6F4FB 4369E96A 346ED9FC AD678846 DA60B8D0 44042D73 33031DE5 AA0A4C5F DD0D7CC9 5005713C 270241AA BE0B1010 C90C2086 5768B525 206F85B3 B966D409 CE61E49F 5EDEF90E 29D9C998 B0D09822 C7D7A8B4 59B33D17 2EB40D81 B7BD5C3B C0BA6CAD EDB88320 9ABFB3B6 03B6E20C 74B1D29A EAD54739 9DD277AF 04DB2615 73DC1683 E3630B12 94643B84 0D6D6A3E 7A6A5AA8 E40ECF0B 9309FF9D 0A00AE27 7D079EB1 F00F9344 8708A3D2 1E01F268 6906C2FE F762575D 806567CB 196C3671 6E6B06E7 FED41B76 89D32BE0 10DA7A5A 67DD4ACC F9B9DF6F 8EBEEFF9 17B7BE43 60B08ED5 D6D6A3E8 A1D1937E 38D8C2C4 4FDFF252 D1BB67F1 A6BC5767 3FB506DD 48B2364B D80D2BDA AF0A1B4C 36034AF6 41047A60 DF60EFC3 A867DF55 316E8EEF 4669BE79 CB61B38C BC66831A 256FD2A0 5268E236 CC0C7795 BB0B4703 220216B9 5505262F C5BA3BBE B2BD0B28 2BB45A92 5CB36A04 C2D7FFA7 B5D0CF31 2CD99E8B 5BDEAE1D 9B64C2B0 EC63F226 756AA39C 026D930A 9C0906A9 EB0E363F 72076785 05005713 95BF4A82 E2B87A14 7BB12BAE 0CB61B38 92D28E9B E5D5BE0D 7CDCEFB7 0BDBDF21 86D3D2D4 F1D4E242 68DDB3F8 1FDA836E 81BE16CD F6B9265B 6FB077E1 18B74777 88085AE6 FF0F6A70 66063BCA 11010B5C 8F659EFF F862AE69 616BFFD3 166CCF45 A00AE278 D70DD2EE 4E048354 3903B3C2 A7672661 D06016F7 4969474D 3E6E77DB AED16A4A D9D65ADC 40DF0B66 37D83BF0 A9BCAE53 DEBB9EC5 47B2CF7F 30B5FFE9 BDBDF21C CABAC28A 53B39330 24B4A3A6 BAD03605 CDD70693 54DE5729 23D967BF B3667A2E C4614AB8 5D681B02 2A6F2B94 B40BBE37 C30C8EA1 5A05DF1B 2D02EF8D";
		var b_table = a_table.split(' ').map(function(s){ return parseInt(s,16) });
		function b_crc32 (str) {
			var crc = -1;
			for(var i=0, iTop=str.length; i<iTop; i++) {
				crc = ( crc >>> 8 ) ^ b_table[( crc ^ str.charCodeAt( i ) ) & 0xFF];
			}
			return (crc ^ (-1)) >>> 0;
		};
		return b_crc32(str);
	}

	ShinglePrint.prototype._hash_tokens = function(){
		//for t in this.tokens:
		for(let t of this.tokens){
			let h = this.crc32(t) & 0xffffffff
			//print "got %x %d %d" % ((h&0xffffffff), this.heap.nheap, this.nfeatures)
			if (this.heap.nheap == this.nfeatures && h >= this.heap.heap[0]){
				continue;
			}
			//print "0x%x < 0x%x" % (h, this.heap.heap[0])
			if(this.hash_queue.hash_contains(h)){
				//print "dup"
				continue;
			}

			if(this.heap.nheap == this.nfeatures){
				let m = this.heap.heap_extract_max();
				this.hash_queue.hash_delete(m);
				//print "pop   %x   [%s]" % (m&0xffffffff, " ".join(["%x" % (c & 0xffffffff) for c in this.heap.heap]))
			}

			this.hash_queue.hash_insert(h);
			this.heap.heap_insert(h);
			//print "push %x   [%s]" % (h&0xffffffff, " ".join(["%x" % (c & 0xffffffff) for c in this.heap.heap]))
		}
		//print "END  [%s]" %  " ".join(["%x" % (c & 0xffffffff) for c in this.heap.heap])
		return this.heap.get_features();
	}

		//@staticmethod
	ShinglePrint.prototype.score = function(f1, f2){
		var unionsize = 0.0,
			intersectsize = 0.0,
			i1 = f1.length - 1,
			i2 = f2.length - 1,
			count = 0,
			matchcount = 0;

		while(i1 >= 0 && i2 >= 0){
			//#print "%x %d" % (f1[i1],i1)
			if(f1[i1] < f2[i2]){
				i1 -= 1;
				continue;
			}
			if(f1[i1] > f2[i2]){
				i2 -= 1;
				continue;
			}
			matchcount += 1;
			i1 -= 1;
			i2 -= 1;
		}
		count = Math.min(f1.length, f2.length);
		intersectsize = matchcount;
		unionsize = 2 * count - matchcount;
		return intersectsize / unionsize;
	}

		// @staticmethod
		// def similarity(x, y):
	ShinglePrint.prototype.similarity = function(x, y){
		var i = (x & y),
			u = (x | y);
		//# print "%x %x" % (x, y)
		//# print "%f %f" % (ShinglePrint.hammingWeight(i), ShinglePrint.hammingWeight(u))
		return this.hammingWeight(i) / this.hammingWeight(u);
	}
		// @staticmethod
		// def hammingWeight(l):
	ShinglePrint.prototype.hammingWeight = function(l){
		//#for(c = 0; l; c++) l &= l-1;
		var c = 0;
		while(l){
			l &= l - 1;
			c += 1;
		}
		return c;
	}





	//class HeapMax:
	ShinglePrint.prototype.HeapMax = function(size){
		this.nheap = 0;
		this.maxheap = size;
		this.heap = Array(size).fill(0);
	}

	ShinglePrint.prototype.HeapMax.prototype.downheap = function(){
		var tmp = 0,
			i = 0;
		while(true){
			let left = (i << 1) + 1;
			let right = left + 1;
			if(left >= this.nheap)
				return
			if(right >= this.nheap){
				if(this.heap[i] < this.heap[left]){
					tmp = this.heap[left];
					this.heap[left] = this.heap[i];
					this.heap[i] = tmp;
				}
				return;
			}

			if(this.heap[i] >= this.heap[left] && this.heap[i] >= this.heap[right])
				return

			if(this.heap[left] > this.heap[right]){
				tmp = this.heap[left];
				this.heap[left] = this.heap[i];
				this.heap[i] = tmp;
				i = left;
			}
			else{
				tmp = this.heap[right];
				this.heap[right] = this.heap[i];
				this.heap[i] = tmp;
				i = right;
			}
		}
	}

	ShinglePrint.prototype.HeapMax.prototype.get_features = function(){
		var f = [];
		while (this.nheap > 0)
			f.push(this.heap_extract_max())
		return f;
	}

	ShinglePrint.prototype.HeapMax.prototype.heap_extract_max = function(){
			//assert(this.nheap > 0)
		var m = this.heap[0];
		this.nheap -= 1;
		this.heap[0] = this.heap[this.nheap];
		this.downheap();
		return m;
	}


	ShinglePrint.prototype.HeapMax.prototype.upheap = function(){

		var i = this.nheap - 1;
			//assert(this.nheap > 0)
		while(i > 0){
			let parent = (i - 1) >> 1;
			if(this.heap[parent] >= this.heap[i])
				return;
			let tmp = this.heap[parent];
			this.heap[parent] = this.heap[i];
			this.heap[i] = tmp;
			i = parent;
		}
	}

	ShinglePrint.prototype.HeapMax.prototype.heap_insert = function(v){
			//assert(this.nheap < this.maxheap)
		this.heap[this.nheap] = v;
		this.nheap += 1;
		this.upheap();
	}




	//class HashQueue:
	ShinglePrint.prototype.HashQueue = function(size){
		this.EMPTY = 0
		this.FULL = 1
		this.DELETED = 2
		this.size = size;
	}

	ShinglePrint.prototype.HashQueue.prototype.init = function(){
		function next_pow2(n){
			var m = 1;
			while(n > 0){
				n >>= 1;
				m <<= 1;
			}
			return m;
		}

		this.hash = null;
		this.occ = null;
		this.nhash = 7 * this.size;
		this.nhash = next_pow2(this.nhash);
		this.hash_alloc();
	}

	ShinglePrint.prototype.HashQueue.prototype.hash_alloc = function(){
		// this.hash = [0] * this.nhash
		// this.occ = [0] * this.nhash
		this.hash = Array(this.nhash).fill(0);
		this.occ = Array(this.nhash).fill(0);
		//for i in range(this.nhash):
		for(let i = 0; i < this.hash; i++)
				this.occ[i] = this.EMPTY;
	}

	/*
		# Since the input values are crc's, we don't
		# try to hash them at all!  they're plenty random
		# coming in, in principle.
	*/

	ShinglePrint.prototype.HashQueue.prototype.do_hash_insert = function(crc){
		var h = crc;
		//for count in range(self.nhash):
		for(let count = 0; count < this.nhash; count++){
			let i = parseInt(h) & (this.nhash - 1);
			if(this.occ[i] != this.FULL){
				this.occ[i] = this.FULL;
				this.hash[i] = crc;
				return 1;
			}
			if(this.hash[i] == crc)
				return 1;
			h += 2 * (this.nhash / 4) + 1;
		}
		return 0;
	}


		//# idiot stop-and-copy for deleted references
	ShinglePrint.prototype.HashQueue.prototype.gc = function(){
		var oldhash = this.hash,
			oldocc = this.occ;

		this.hash_alloc();

		//for i in range(this.nhash):
		for(let i = 0; i < this.hash; i++){
			if(oldocc[i] == this.FULL){
				if(!this.do_hash_insert(oldhash[i])){
					//print "internal error: gc failed, table full"
					//sys.exit(1);
					throw "UNexpected ShinglePrint error";
				}
			}
		}
	}

	ShinglePrint.prototype.HashQueue.prototype.hash_insert = function(crc){
		if(this.do_hash_insert(crc))
			return;

		this.gc();
		if(this.do_hash_insert(crc))
			return;
		//print "internal error: insert failed, table full"
	}


	ShinglePrint.prototype.HashQueue.prototype.do_hash_contains = function(crc){
		var h = crc;
		//for count in range(self.nhash):
		for(let count = 0; count < this.nhash; count++){
			let i = parseInt(h) & (this.nhash - 1);
			if(this.occ[i] == this.EMPTY)
				return 0;
			if(this.occ[i] == this.FULL && this.hash[i] == crc)
				return 1;
			h += 2 * (this.nhash / 4) + 1;
		}
		return -1;
	}



	ShinglePrint.prototype.HashQueue.prototype.hash_contains = function(crc){
		var result = this.do_hash_contains(crc);
		if(result >= 0)
			return result;

		this.gc()
		result = this.do_hash_contains(crc);
		if(result >= 0)
			return result;
		//print "internal error: can't find value, table full"
	}


	ShinglePrint.prototype.HashQueue.prototype.do_hash_delete = function(crc){
		var h = crc
			//for count in range(self.nhash):
		for(let count = 0; count < this.nhash; count++){
			let i = parseInt(h) & (this.nhash - 1);
			if(this.occ[i] == this.FULL && this.hash[i] == crc){
				this.occ[i] = this.DELETED;
				return 1;
			}

			if(this.occ[i] == this.EMPTY)
				return 0;
			h += 2 * (this.nhash / 4) + 1
		}
		return -1;
	}


	ShinglePrint.prototype.HashQueue.prototype.hash_delete = function(crc){
		var result = this.do_hash_delete(crc);
		if(result >= 0)
			return result;
		this.gc()
		result = this.do_hash_delete(crc);
		//if(this.result >= 0) /// <-?? wrong
		if(result >= 0)
			return result;
		//print "internal error: delete failed, table full"
	}


	function TextComparator(text){
		this.text = new this.Text(text);
	}

	TextComparator.prototype.getValue = function(){
		return this.text.value;
	}

	TextComparator.prototype.compare = function(other){
		switch(this.text.type){
			case "textmatch":
				return this.text.value === other.value;
			case "simhash":
				return this.text.value === other.value;
			case "shingleprint":
				// return 0;
				//return this.text.value === other.value;
				return this.text.comparator.compare(other.value) >= 0.95 // !!!!!
		}

	}
	TextComparator.prototype.Text = function(text){
		this.type = "textmatch";
		this.value = text;
		this.comparator = null;
		if(text.length >= 32 ){
			this.type = "simhash";
			// @ todo
		}
		if(text.length >= 256){
			this.type = "shingleprint";
			let s = new ShinglePrint(text);
			this.comparator = s;
			this.value = s.getFeatures();
		}
	}

	window.__PROBE__.textComparator = {
		getValue: function(text){
			var tc = new TextComparator(text);
			return tc.text;
		},
		compare(text, ctext){
			var tc = new TextComparator(text);
			return tc.compare(ctext);
		}
	}

} //init