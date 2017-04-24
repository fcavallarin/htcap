/*
HTCAP - beta 1
Author: filippo.cavallarin@wearesegment.com

This program is free software; you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation; either version 2 of the License, or (at your option) any later
version.
*/

// @todo error on Unknown option ds
function getopt(arguments, optstring){
	var args = arguments.slice();
	var ret = {
		opts: [],
		args: args
	};

	var m = optstring.match(/[a-zA-Z]\:*/g);
	for(var a = 0; a < m.length; a++){
		var ai = args.indexOf("-" + m[a][0]);
		if(ai > -1){
			if(m[a][1] == ":"){
				if(args[ai+1]){
					ret.opts.push([m[a][0], args[ai+1]]);
					args.splice(ai,2);
				} else {
					return "missing argumnet for option " + m[a][0];
				}
			} else {
				ret.opts.push([m[a][0]]);
				args.splice(ai,1);
			}
		}
	}

	return ret;
}


function removeHash(url){
	var anchor = document.createElement("a");
	anchor.href = url;

	return anchor.protocol + "//" + anchor.host + anchor.pathname + anchor.search;
}



function compareUrls(url1, url2, includeHash){
	var a1 = document.createElement("a");
	var a2 = document.createElement("a");
	a1.href = url1;
	a2.href = url2;

	var eq = (a1.protocol == a2.protocol && a1.host == a2.host && a1.pathname == a2.pathname && a1.search == a2.search);

	if(includeHash) eq = eq && a1.hash == a2.hash;

	return eq;

}


function printCookies(headers, site){
	var cookies = getCookies(headers, site);
	console.log('["cookies",' + JSON.stringify(cookies) + "],");
}


function printStatus(status, errcode, message, redirect){
	var o = {status:status};
	if(status == "error"){
		o.code = errcode;
		switch(errcode){
			case "load":
				break;
			case "contentType":
				o.message = message;
				break;
			case "requestTimeout":
				break;
			case "probe_timeout":
				break;
		}
	}
	if(redirect) o.redirect = redirect;
	o.time = Math.floor((Date.now() - window.startTime)/1000);
	console.log(JSON.stringify(o));
	console.log("]")
}



function execTimedOut(){
	if(!response || response.headers.length == 0){
		printStatus("error", "requestTimeout");
		phantom.exit(0);
	}
	printStatus("error", "probe_timeout");
	phantom.exit(0);

}



function usage(){
	var usage = "Usage: analyze.js [options] <url>\n" +
				"  -V              verbose\n" +
				"  -a              don't check ajax\n" +
				"  -f              don't fill values\n" +
				"  -t              don't trigger events (onload only)\n" +
				"  -s              don't check websockets\n" +
				"  -M              dont' map events\n" +
				"  -T              don't trigger mapped events\n" +
				"  -S              don't check for <script> insertion\n" +
				"  -P              load page with POST\n" +
				"  -D              POST data\n" +
				"  -R <string>     random string used to generate random values - the same random string will generate the same random values\n" +
				"  -X              comma separated list of excluded urls\n" +
				"  -C              don't get cookies\n" +
				"  -c <path>       set cookies from file (json)\n" +
				"  -p <user:pass>  http auth \n" +
				"  -x <seconds>    maximum execution time \n" +
				"  -A <user agent> set user agent \n" +
				"  -r <url>        set referer \n" +
				"  -H              return generated html \n" +
				"  -I              load images\n" + 
				"  -O              dont't override timeout functions\n" +
				"  -u              path to user script to inject\n" +
				"  -K              keep elements in the DOM (prevent removal)\n" +
				"  -v              verify user script and exit";
	console.log(usage);
}



function parseArgsToOptions(args){

	for(var a = 0; a < args.opts.length; a++){
		switch(args.opts[a][0]){
			// case "h":
			// 	//showHelp = true;
			// 	usage();
			// 	phantom.exit(1);
			// 	break;
			case "V":
				options.verbose = true;
				break;
			case "a":
				options.checkAjax = false;
				break;
			case "f":
				options.fillValues = false;
				break;
			case "t":
				options.triggerEvents = false;
				break;
			case "d":
				options.printAjaxPostData = false;
			case "S":
				options.checkScriptInsertion = false;
				break;
			case "I":
				options.loadImages = true;
				break;
			case "C":
				options.getCookies = false;
				break;

			case "c":
				try{
					var cookie_file = fs.read(args.opts[a][1]);
					options.setCookies = JSON.parse(cookie_file);
				} catch(e){
					console.log(e);
					phantom.exit(1);
				}

				break;
			case "p":
				var arr = args.opts[a][1].split(":");
				options.httpAuth = [arr[0], arr.slice(1).join(":")];
				break;
			case "M":
				options.mapEvents = false;
				break;
			case "T":
				options.triggerAllMappedEvents = false;
				break;
			case "s":
				options.checkWebsockets = false;
				break;
			case "x":
				options.maxExecTime = parseInt(args.opts[a][1]) * 1000;
				break;
			case "A":
				options.userAgent = args.opts[a][1];
				break;
			case "r":
				options.referer = args.opts[a][1];
				break;
			case "m":
				options.outputMappedEvents = true;
				break;
			case "H":
				options.returnHtml = true;
				break;
			case "X":
				options.excludedUrls = args.opts[a][1].split(",");
				break;
			case "O":
				options.overrideTimeoutFunctions = false;
				break;
			case "O":
				options.overrideTimeoutFunctions = false;
				break;
			case "i":
				options.id = args.opts[a][1];
				break;
			case "K":
				options.preventElementRemoval = true;
				break;
		}
	}
};

function onNavigationRequested(url, type) {

	if (page.navigationLocked === true) {
		page.evaluate(function (url, type) {
			if (type === "LinkClicked")
				return;

			if (type === 'Other' && url !== "about:blank") {
				window.__PROBE__.printLink(url);
			}

		}, url, type);
	}


	// allow the navigation if only the hash is changed
	if (page.navigationLocked === true && compareUrls(url, site)) {
		page.navigationLocked = false;
		page.evaluate(function(url){
			document.location.href=url;
		},url);
	}

	page.navigationLocked = true;
}


// generates PSEUDO random values. the same seed will generate the same values
function generateRandomValues(seed){
	var values = {};
	var letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
	var numbers = "0123456789";
	var symbols = "!#&^;.,?%$*";
	var months = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
	var years = ["1982", "1989", "1990", "1994", "1995", "1996"];
	var names = ["james", "john", "robert", "michael", "william", "david", "richard", "charles", "joseph", "thomas", "christopher", "daniel", "paul", "mark", "donald", "george", "kenneth"];
	var surnames = ["anderson", "thomas", "jackson", "white", "harris", "martin", "thompson", "garcia", "martinez", "robinson", "clark", "rodriguez", "lewis", "lee", "walker", "hall"];
	var domains = [".com", ".org", ".net", ".it", ".tv", ".de", ".fr"];

	var randoms = [];
	var randoms_i = 0;

	for(var a = 0; a < seed.length; a++){
		var i = seed[a].charCodeAt(0);
		randoms.push(i);
	}

	var rand = function(max){
		var i = randoms[randoms_i] % max;
		randoms_i = (randoms_i + 1) % randoms.length;
		return i;
	}

	var randarr = function(arr, len){
		var r;
		var ret = "";
		for(var a = 0; a < len; a++){
			r = rand(arr.length - 1) ;
			ret += arr[r];
		}
		return ret;
	};

	var generators = {
		string: function(){
			return randarr(letters, 8);
		},
		number: function(){
			return randarr(numbers, 3);
		},
		month: function(){
			return randarr(months, 1);
		},
		year: function(){
			return randarr(years, 1);
		},
		date: function(){
			return generators.year() + "-" + generators.month() + "-" + generators.month();
		},
		color: function(){
			return "#" + randarr(numbers, 6);
		},
		week: function(){
			return generators.year() + "-W" + randarr(months.slice(0, 6), 1);
		},
		time: function(){
			return generators.month() + ":" + generators.month();
		},
		datetimeLocal: function(){
			return generators.date() + "T" + generators.time();
		},
		domain: function(){
			return randarr(letters, 12).toLowerCase() + randarr(domains ,1);
		},
		email: function(){
			return randarr(names, 1) + "." + generators.surname() + "@" + generators.domain();
		},
		url: function(){
			return "http://www." + generators.domain();
		},
		humandate: function(){
			return  generators.month() + "/" + generators.month() + "/" + generators.year();
		},
		password: function(){
			return randarr(letters, 3) + randarr(symbols, 1) + randarr(letters, 2) + randarr(numbers, 3) + randarr(symbols, 2);
		},
		surname: function(){
			return randarr(surnames, 1);
		},
		lastname: function(){
			return generators.surname();
		},
		firstname: function(){
			return randarr(names, 1);
		},
		tel: function(){
			return "+" + randarr(numbers, 1) + " " + randarr(numbers, 10)
		}
	};


	for(var type in generators){
		values[type] = generators[type]();
	}

	return values;


};







function startProbe(random, injectScript) {
	// generate a static map of random values using a "static" seed for input fields
	// the same seed generates the same values
	// generated values MUST be the same for all analyze.js call othewise the same form will look different
	// for example if a page sends a form to itself with input=random1,
	// the same form on the same page (after first post) will became input=random2
	// => form.data1 != form.data2 => form.data2 is considered a different request and it'll be crawled.
	// this process will lead to and infinite loop!
	var inputValues = generateRandomValues(random);

	// adding constants to page
	page.evaluate(function (__HTCAP) {
		window.__HTCAP = __HTCAP;
	}, window.__HTCAP);

	page.evaluate(initProbe, options, inputValues, injectScript);

	page.evaluate(function(options) {

		if(options.mapEvents){

			Node.prototype.__originalAddEventListener = Node.prototype.addEventListener;
			Node.prototype.addEventListener = function () {
				if (arguments[0] !== "DOMContentLoaded") { // is this ok???
					window.__PROBE__.addEventToMap(this, arguments[0]);
				}
				this.__originalAddEventListener.apply(this, arguments);
			};

			window.__originalAddEventListener = window.addEventListener;
			window.addEventListener = function () {
				if (arguments[0] !== "load") { // is this ok???
					window.__PROBE__.addEventToMap(this, arguments[0]);
				}
				window.__originalAddEventListener.apply(this, arguments);
			};
		}

		if(options.checkAjax){
			XMLHttpRequest.prototype.__originalOpen = XMLHttpRequest.prototype.open;
			XMLHttpRequest.prototype.open = function(method, url, async, user, password){

				var _url = window.__PROBE__.removeUrlParameter(url, "_");
				this.__request = new window.__PROBE__.Request("xhr", method, _url);

				// adding XHR listener
				this.addEventListener('readystatechange', function () {
					// if not finish, it's open
					// https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/readyState
					if (this.readyState >= 1 && this.readyState < 4) {
						window.__PROBE__.eventLoopManager.sentXHR(this);
					} else if (this.readyState === 4) {
						// /!\ DONE means that the XHR finish but could have FAILED
						window.__PROBE__.eventLoopManager.doneXHR(this);
					}
				});
				this.addEventListener('error', function () {
					window.__PROBE__.eventLoopManager.inErrorXHR(this);
				});
				this.addEventListener('abort', function () {
					window.__PROBE__.eventLoopManager.inErrorXHR(this);
				});
				this.addEventListener('timeout', function () {
					window.__PROBE__.eventLoopManager.inErrorXHR(this);
				});

				this.timeout = options.XHRTimeout;

				return this.__originalOpen(method, url, async, user, password);
			};

			XMLHttpRequest.prototype.__originalSend = XMLHttpRequest.prototype.send;
			XMLHttpRequest.prototype.send = function(data){
				this.__request.data = data;
				this.__request.triggerer = window.__PROBE__.getLastTriggerPageEvent();

				var absurl = window.__PROBE__.getAbsoluteUrl(this.__request.url);
				for(var a = 0; a < options.excludedUrls.length; a++){
					if(absurl.match(options.excludedUrls[a])){
						this.__skipped = true;
					}
				}

				// check if request has already been sent
				var requestKey = this.__request.key;
				if (window.__PROBE__.sentXHRs.indexOf(requestKey) !== -1) {
					return;
				}

				var ueRet = window.__PROBE__.triggerUserEvent("onXhr",[this.__request]);
				if(ueRet){
					window.__PROBE__.sentXHRs.push(requestKey);
					window.__PROBE__.addToRequestToPrint(this.__request);

					if(!this.__skipped)
						return this.__originalSend(data);
				}
			};
		}

		if(options.checkScriptInsertion){

			Node.prototype.__originalAppendChild = Node.prototype.appendChild;
			Node.prototype.appendChild = function(node){
				window.__PROBE__.printJSONP(node);
				return this.__originalAppendChild(node);
			}

			Node.prototype.__originalInsertBefore = Node.prototype.insertBefore;
			Node.prototype.insertBefore = function(node, element){
				window.__PROBE__.printJSONP(node);
				return this.__originalInsertBefore(node, element);
			}

			Node.prototype.__originalReplaceChild = Node.prototype.replaceChild;
			Node.prototype.replaceChild = function(node, oldNode){
				window.__PROBE__.printJSONP(node);
				return this.__originalReplaceChild(node, oldNode);
			}
		}

		if(options.checkWebsockets){
			window.WebSocket = (function(WebSocket){
				return function(url, protocols){
					window.__PROBE__.printWebsocket(url); //websockets.push(url);
					return WebSocket.prototype;
				}
			})(window.WebSocket);
		}

		if(options.overrideTimeoutFunctions){
			window.__originalSetTimeout = window.setTimeout;
			window.setTimeout = function () {
				// Forcing a delay of 0
				arguments[1] = 0;
				return window.__originalSetTimeout.apply(this, arguments);
			};

			window.__originalSetInterval = window.setInterval;
			window.setInterval = function () {
				// Forcing a delay of 0
				arguments[1] = 0;
				return window.__originalSetInterval.apply(this, arguments);
			};

		}

		if(options.preventElementRemoval){
			Node.prototype.__originalRemoveChild = Node.prototype.removeChild;
			Node.prototype.removeChild = function(node){
				return node;
			}
		}

		HTMLFormElement.prototype.__originalSubmit = HTMLFormElement.prototype.submit;
		HTMLFormElement.prototype.submit = function(){
			window.__PROBE__.addToRequestToPrint(window.__PROBE__.getFormAsRequest(this));
			return this.__originalSubmit();
		};

		// prevent window.close
		window.close = function () {
		};

		window.open = function(url, name, specs, replace){
			window.__PROBE__.printLink(url);
		};

		// create an observer instance for DOM changes
		var observer = new WebKitMutationObserver(function (mutations) {
			window.__PROBE__.eventLoopManager.nodeMutated(mutations);
		});
		var eventAttributeList = ['src', 'href'];
		window.__HTCAP.mappableEvents.forEach(function (event) {
			eventAttributeList.push('on' + event);
		});
		// observing for any change on document and its children
		observer.observe(document.documentElement, {
			childList: true,
			attributes: true,
			characterData: false,
			subtree: true,
			attributeOldValue: true,
			characterDataOldValue: false,
			attributeFilter: eventAttributeList
		});

		window.__PROBE__.triggerUserEvent("onInit");
	}, options);

}




function checkContentType(ctype){
	ctype = ctype || ""
	return (ctype.toLowerCase().split(";")[0] == "text/html");
};

function assertContentTypeHtml(response){
	if(!checkContentType(response.contentType)){
		printStatus("error", "contentType", "content type is " + response.contentType); // escape response.contentType???
		phantom.exit(0);
	}
}

function getCookies(headers, url){
	var a, b, c, ret = [];
	var purl = document.createElement('a');
	purl.href = url;
	var domain = purl.hostname;

	for(a = 0; a < headers.length; a++){
		if(headers[a].name.toLowerCase() == "set-cookie"){
			var cookies = headers[a].value.split("\n");	 // phantomjs stores multiple cookies in this way ..
			for(b = 0; b < cookies.length; b++){
				var ck = cookies[b].split(/; */);
				var cookie = {domain: domain, path: "/", secure: false, httponly:false};
				for(c = 0; c < ck.length; c++){
					var kv = ck[c].split("=");
					if(c == 0){
						cookie.name = kv[0];
						cookie.value = decodeURIComponent(kv[1]);
						continue;
					}
					switch(kv[0].toLowerCase()){
						case "expires":
							if(!("expires" in cookie))
								cookie.expires = parseInt((new Date(kv[1])).getTime() / 1000);
							break;
						case "max-age":
							cookie.expires = parseInt(((new Date()).getTime() / 1000) + parseInt(kv[1]));
							break;
						case "domain":
						case "path":
							cookie[kv[0]] = kv[1];
							break;
						case "httponly":
						case "secure":
							cookie[kv[0]] = true;
							break;
					}
				}
				ret.push(cookie);
			}
		}
	}
	return ret;
};



function verifyUserScript(script){
	if(!script) return true;
	try{
		eval("var x = " + script.trim() + ";");
	}catch(e){
		return "" + e;
	}

	return true;
}

