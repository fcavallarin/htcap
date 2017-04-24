/*
HTCAP - beta 1
Author: filippo.cavallarin@wearesegment.com

This program is free software; you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation; either version 2 of the License, or (at your option) any later
version.
*/

var system = require('system');
var fs = require('fs');
var page = require('webpage').create();

window.page = page;
window.fs = fs;


phantom.injectJs("functions.js");
phantom.injectJs("options.js");
phantom.injectJs("constants.js");
phantom.injectJs("probe.js");


var startTime = Date.now();


var site = "";
var response = null;
//var showHelp = false;

var headers = {};

var args = getopt(system.args,"hVaftUJdICc:MSEp:Tsx:A:r:mHX:PD:R:Oi:u:v");

var page_settings = {encoding: "utf8"};
var random = "IsHOulDb34RaNd0MsTR1ngbUt1mN0t";
var injectScript = null;


if(typeof args == 'string'){
	console.log("Error: " + args);
	phantom.exit(-1);
}

for(var a = 0; a < args.opts.length; a++){
	switch(args.opts[a][0]){
		case "h":
			usage();
			phantom.exit(1);
			break;
		case "P":
			page_settings.operation = "POST";
			break;
		case "D":
			page_settings.data = args.opts[a][1];
			break;
		case "R":
			random = args.opts[a][1];
			break;
		case "u":
			injectScript = fs.read(args.opts[a][1]);
			break;
		case "v":
			var vs = verifyUserScript(injectScript);
			if(vs !== true) console.log(vs);
			phantom.exit(0);
			break;
	}
}


parseArgsToOptions(args);

site = args.args[1];

if(!site){
	usage();
	phantom.exit(-1);
}

if(site.length < 4 || site.substring(0,4).toLowerCase() != "http"){
	site = "http://" + site;
}

console.log("[");

/* maximum execution time */
setTimeout(execTimedOut,options.maxExecTime);



phantom.onError = function(msg, trace) {
  var msgStack = ['PHANTOM ERROR: ' + msg];
  if (trace && trace.length) {
    msgStack.push('TRACE:');
    trace.forEach(function(t) {
      msgStack.push(' -> ' + (t.file || t.sourceURL) + ': ' + t.line + (t.function ? ' (in function ' + t.function +')' : ''));
    });
  }
  console.error(msgStack.join('\n'));
  phantom.exit(1);
};



page.onConsoleMessage = function(msg, lineNum, sourceId) {
	if(options.verbose)
		console.log("console: " + msg);
}
page.onError = function(msg, lineNum, sourceId) {
	if(options.verbose)
		console.log("console error: on   " + JSON.stringify(lineNum) + " " + msg);
}

page.onAlert = function(msg) {
	if(options.verbose)
  		console.log('ALERT: ' + msg);
};

page.settings.userAgent = options.userAgent;
page.settings.loadImages = options.loadImages;



page.onResourceReceived = function(resource) {
	if(window.response == null){
		window.response = resource;
		// @TODO sanytize response.contentType

	}
};


page.onResourceRequested = function(requestData, networkRequest) {
	//console.log(JSON.stringify(requestData))
};

// to detect window.location= / document.location.href=
page.onNavigationRequested = onNavigationRequested;

page.onConfirm = function(msg) {return true;} // recently changed

/*
 phantomjs issue #11684 workaround
 https://github.com/ariya/phantomjs/issues/11684
 */
var isPageInitialized = false;
page.onInitialized = function(){
	if(isPageInitialized) return;
	isPageInitialized = true;

	// try to hide phantomjs
	page.evaluate(function(){
		window.__callPhantom = window.callPhantom;
		delete window.callPhantom;
	});

	startProbe(random, injectScript);

};


page.onCallback = function(data) {
	switch(data.cmd){
		case "print":
			console.log(data.argument);
			break;
		case "log":
			try{
				fs.write("htcap_log-" + options.id + ".txt", data.argument + "\n", 'a');
			} catch(e) {} // @
			break;
		case "die": // @TMP
			console.log(data.argument);
			phantom.exit(0);
		case "render":
			try {
				page.render(data.argument);
				return true;
			} catch(e){
				return false;
			}
			break;
		case "fwrite":
			try {
				fs.write(data.file, data.content, data.mode || 'w');
				return true;
			} catch(e) {
				console.log(e)
				return false;
			}
			break;
		case "fread":
			try{
				return "" + fs.read(data.file);
			} catch(e){
				return false;
			}
			break;
		case "end":

			page.evaluate(function () {
				window.__PROBE__.printRequests();
			});

			if(options.returnHtml){
				page.evaluate(function(options){
					window.__PROBE__.printPageHTML();
				}, options);
			}

			page.evaluate(function () {
				window.__PROBE__.triggerUserEvent("onEnd");
			});

			printStatus("ok", window.response.contentType);
			phantom.exit(0);
			break;

	}

}



if(options.httpAuth){
	headers['Authorization'] = 'Basic ' + btoa(options.httpAuth[0] + ":" + options.httpAuth[1]);
}

if(options.referer){
	headers['Referer'] = options.referer;
}

page.customHeaders = headers;


for(var a = 0; a < options.setCookies.length; a++){
	// maybe this is wrogn acconding to rfc .. but phantomjs cannot set cookie witout a domain...
	if(!options.setCookies[a].domain){
		var purl = document.createElement("a");
		purl.href=site;
		options.setCookies[a].domain = purl.hostname
	}
	if(options.setCookies[a].expires)
		options.setCookies[a].expires *= 1000;

	phantom.addCookie(options.setCookies[a]);

}

page.viewportSize = {
  width: 1920,
  height: 1080
};




page.open(site, page_settings, function(status) {
	var response = window.response; // just to be clear
	if (status !== 'success'){
		var mess = "";
		var out = {response: response};
		if(!response || response.headers.length == 0){
			printStatus("error", "load");
			phantom.exit(1);
		}

		// check for redirect first
		for(var a = 0; a < response.headers.length; a++){
			if(response.headers[a].name.toLowerCase() == 'location'){

				if(options.getCookies){
					printCookies(response.headers, site);
				}
				printStatus("ok", null, null, response.headers[a].value);
				phantom.exit(0);
			}
		}

		assertContentTypeHtml(response);

		phantom.exit(1);
	}


	if(options.getCookies){
		printCookies(response.headers, site);
	}

	assertContentTypeHtml(response);

	page.evaluate(function(){
		console.log("startAnalysis");
		// starting page analysis
		window.__PROBE__.startAnalysis();
	})


});
