/*
HTCAP - htcap.org
Author: filippo.cavallarin@wearesegment.com

This program is free software; you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation; either version 2 of the License, or (at your option) any later
version.
*/

var system = require('system');
var fs = require('fs');

// ctrl-c from probe/function.js .. maybe I should create some common.js and put it somewhere .. but where?.. really.. where??
function getCookies(headers, url){
	var a, b, c, ret = [];
	var purl = document.createElement('a');
	purl.href = url;
	var domain = purl.hostname;

	for(a = 0; a < headers.length; a++){
		//console.log(JSON.stringify(headers[a]))
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



function print(mess){
	output.push(mess)
}

if(system.args.length < 4){
	console.log("usage: login.js <url> <login> <password> [<button_text>]");
	phantom.exit(0);
}


var step = 0;
var allCookies = [];
var output = []

var url = system.args[1];
var login = system.args[2];
var password = system.args[3];
var buttonTxt = system.args[4] || null;


var page = require('webpage').create();

page.onConsoleMessage = function(msg, lineNum, sourceId) {
	//console.log("console: " + msg);
}

page.onResourceReceived = function(response) {
		var cookies = getCookies(response.headers, url)
		for(var a = 0; a < cookies.length; a++){
			allCookies.push(cookies[a])
		}
};

phantom.onError = function(msg, trace) {}
page.onError = function(msg, trace) {
	//console.log("console err: " + msg);
}

page.onCallback = function(data) {
	switch(data.cmd){
		case "next":
			step = 2;
			return;
		case "end":
			console.log(JSON.stringify(output))
			phantom.exit(0);
		case "print":
			print(JSON.parse(data.par))
			return;
	}
}

page.onLoadFinished = function(status) {
	if(status != 'success'){
		console.log("error loading page " + url);
		phantom.exit(1);
	}

	if(step < 2)return;

	if(allCookies.length > 0){
		print(allCookies);
	} else {
		print([]);
	}

	page.evaluate(function(){
		var els = document.getElementsByTagName("a");
		var lu = [];
		var re = /.*(log|sign)(_|\-| )?(out|off).*/gi;
		for(var a = 0; a < els.length; a++){
			if(els[a].href.match(re) || els[a].innerText.match(re)){
				lu.push(els[a].href)
			}
		}
		if(lu.length > 0){
			callPhantom({cmd:"print",par:JSON.stringify(lu)});
		} else {
			callPhantom({cmd:"print",par:'[]'});
		}

		callPhantom({cmd:"end"});
	})
}



page.settings.loadImages = false;

page.open(url, {}, function(status){
	page.evaluate(function(login, password,buttonTxt){
		function trigger(el, evname){
			if ('createEvent' in document) {
				var evt = document.createEvent('HTMLEvents');
				evt.initEvent(evname, true, false);
				el.dispatchEvent(evt);
			} else {
				evname = 'on' + evname;
				if( evname in el && typeof el[evname] == "function"){
					el[evname]();
				}
			}
		};

		function getAdiacent(cont, selector){
			var ad = null;

			while(!ad && cont){
				ad = cont.querySelector(selector)
				cont = cont.parentNode
			}
			return ad
		}
		setTimeout(function(){
			var passw_el = document.querySelector("input[type=password]");
			var login_el = getAdiacent(passw_el, "input[type=text],input[type=email],input:not([type])");
			var button_el = null;
			if(buttonTxt){
				var els = document.getElementsByTagName("*");
				for(var a = 0; a < els.length; a++){
					for(var ch = els[a].firstChild; ch; ch = ch.nextSibling){
						if(ch.nodeType != 3)continue; // skip non textNodes
						if(ch.nodeValue.trim().toLowerCase().trim() == buttonTxt.toLowerCase()){
							button_el = els[a];
							break;
						}
					}
				}
			} else {
				button_el = getAdiacent(passw_el, "input[type=submit],button");
				if(!button_el){
					button_el = getAdiacent(passw_el, "a");
				}
			}

			if(!login_el || ! button_el){
				console.log("error")
				console.log(button_el)
			}
			var events = ["click","change","blur","keyup","keydown","keypress","input"];

			login_el.value = login;
			for(var a = 0; a < events.length; a++)
				trigger(login_el, events[a]);

			passw_el.value = password;
			for(var a = 0; a < events.length; a++)
				trigger(passw_el, events[a]);

			setTimeout(function(){
				trigger(button_el, "click");
				callPhantom({cmd:"next"});
			},50);
		}, 500);

	},login, password, buttonTxt);
});
