/*
htcrawl - 1.1
http://htcrawl.org
Author: filippo.cavallarin@wearesegment.com

This program is free software; you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation; either version 2 of the License, or (at your option) any later
version.
*/

//"use strict";

const urlparser = require('url').parse;
const fs = require('fs');


exports.parseCookiesFromHeaders = parseCookiesFromHeaders;
exports.hookNativeFunctions = hookNativeFunctions;
exports.generateRandomValues = generateRandomValues;


 function hookNativeFunctions(options) {
	//alert(window.__PROBE__)

	if(options.mapEvents){

		Node.prototype.originaladdEventListener = Node.prototype.addEventListener;
		Node.prototype.addEventListener = function(event, func, useCapture){
			if(event != "DOMContentLoaded"){ // is this ok???
				window.__PROBE__.addEventToMap(this, event);
			}
			this.originaladdEventListener(event, func, useCapture);
		};

		window.addEventListener = (function(originalAddEventListener){
			return function(event, func, useCapture){
				if(event != "load"){ // is this ok???
					window.__PROBE__.addEventToMap(this, event);
				}
				originalAddEventListener.apply(this,[event, func, useCapture]);
			}
		})(window.addEventListener);
	}


	if(options.checkFetch){
		window.fetch = ((_fetch) => async (url, options) => {
			return await window.__PROBE__.fetchHook(_fetch, url, options);
		})(window.fetch);
	}

	if(options.checkAjax){
		XMLHttpRequest.prototype.originalOpen = XMLHttpRequest.prototype.open;
		XMLHttpRequest.prototype.open = function(method, url, async, user, password){
			window.__PROBE__.xhrOpenHook(this, method, url);
			return this.originalOpen(method, url, async, user, password);
		}

		XMLHttpRequest.prototype.originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
		XMLHttpRequest.prototype.setRequestHeader = async function(header, value){
			this.__request.extra_headers[header] = value;
			return this.originalSetRequestHeader(header, value);
		};


		XMLHttpRequest.prototype.originalSend = XMLHttpRequest.prototype.send;
		XMLHttpRequest.prototype.send = async function(data){
			var uRet = await window.__PROBE__.xhrSendHook(this, data);
			if(!this.__skipped && uRet)
				return this.originalSend(data);

			return;
		}

	}


	if(options.checkScriptInsertion){

		Node.prototype.originalappendChild = Node.prototype.appendChild;
		Node.prototype.appendChild = function(node){
			//window.__PROBE__.printJSONP(node);

			window.__PROBE__.jsonpHook(node);
			return this.originalappendChild(node);
		}

		Node.prototype.originalinsertBefore = Node.prototype.insertBefore;
		Node.prototype.insertBefore = function(node, element){
			//window.__PROBE__.printJSONP(node);
			window.__PROBE__.jsonpHook(node);
			return this.originalinsertBefore(node, element);
		}

		Node.prototype.originalreplaceChild = Node.prototype.replaceChild;
		Node.prototype.replaceChild = function(node, oldNode){
			//window.__PROBE__.printJSONP(node);
			window.__PROBE__.jsonpHook(node);
			return this.originalreplaceChild(node, oldNode);
		}
	}

	if(options.checkWebsockets){
		window.WebSocket = (function(WebSocket){
			return function(url, protocols){
				var ws = new WebSocket(url, protocols);
				window.__PROBE__.websocketHook(ws, url);
				return ws;
			}
		})(window.WebSocket);
	}


	if(options.overrideTimeoutFunctions){
		window.setTimeout = (function(setTimeout){
			return function(func, time){
				return setTimeout(func, 0, ...Array.from(arguments).slice(2));
			}
		})(window.setTimeout);

		window.setInterval = (function(setInterval){
			return function(func, time){
				return setInterval(func, 0, ...Array.from(arguments).slice(2));
			}
		})(window.setInterval);

	}



	// Node.prototype.originalRemoveEventListener = Node.prototype.removeEventListener;
	// Node.prototype.removeEventListener = function(type, listener, options){
	// };

	Node.prototype.originalRemoveChild = Node.prototype.removeChild;
	Node.prototype.removeChild = function(node){
		if(!node.__analyzed){
			//console.log("elem not analyzed "+ window.__PROBE__.stringifyElement(node) )
			//console.log(window.__PROBE__.getTrigger());
		}
		this.__removed = true;
		if(this instanceof HTMLElement){
			for (let c of this.getElementsByTagName("*"))
				c.__removed = true;
		}
		return this.originalRemoveChild(node);
	}



	HTMLFormElement.prototype.originalSubmit = HTMLFormElement.prototype.submit;
	HTMLFormElement.prototype.submit = function(){
		//console.log("=-->"+this.action)
		// var req = window.__PROBE__.getFormAsRequest(this);
		// window.__PROBE__.printRequest(req);
		window.__PROBE__.triggerFormSubmitEvent(this);
		return this.originalSubmit();
	}

	// prevent window.close
	window.close = function(){ return };
	window.print = function(){ return };

	window.open = function(url, name, specs, replace){
		//window.__PROBE__.printLink(url);
		window.__PROBE__.triggerNavigationEvent(url);
	}

	//window.__PROBE__.triggerUserEvent("onInit");
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
			return "+" + randarr(numbers, 1) + " " + randarr(numbers, 10);
		}
	};


	for(var type in generators){
		values[type] = generators[type]();
	}

	return values;


};




function parseCookiesFromHeaders(headers, url){
	var a, b, c, ret = [];
	var purl = urlparser(url);
	var domain = purl.hostname;

	for(header in headers){
		//console.log(JSON.stringify(header))
		if(header.toLowerCase() == "set-cookie"){
			var cookies = headers[header].split("\n");	 // no multiple cookies due to a chrome bug (??)
			for(b = 0; b < cookies.length; b++){
				var ck = cookies[b].split(/; */);
				var cookie = {domain: domain, path: "/", secure: false, httponly:false};
				for(c = 0; c < ck.length; c++){
					var kv = ck[c].split(/=(.+)/);
					if(c == 0){
						cookie.name = kv[0];
						cookie.value = kv[1];
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

				if(!cookie.expires) // expires MUST be in seconds ..
					cookie.expires = parseInt((new Date()).getTime() / 1000) + (60*60*24*365);
				ret.push(cookie);
			}
		}
	}
	return ret;
};


