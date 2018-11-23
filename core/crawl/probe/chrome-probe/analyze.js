/*
HTCAP - 1.2
http://htcap.org
Author: filippo.cavallarin@wearesegment.com

This program is free software; you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation; either version 2 of the License, or (at your option) any later
version.
*/


"use strict";

const htcap = require("./htcap");
const utils = require('./utils');
const process = require('process');


var sleep = function(n){
	return new Promise(resolve => {
		setTimeout(resolve, n);
	});
};



var argv = utils.parseArgs(process.argv, "hVaftUJdICc:MSEp:Tsx:A:r:mHX:PD:R:Oi:u:vy:l", {});
var options = argv.opts

var targetUrl = argv.args[0];



if(!targetUrl){
	utils.usage();
	process.exit(-1);
}

targetUrl = targetUrl.trim();
if(targetUrl.length < 4 || targetUrl.substring(0,4).toLowerCase() != "http"){
	targetUrl = "http://" + targetUrl;
}



htcap.launch(targetUrl, options).then( crawler => {
	const page = crawler.page();
	var execTO = null;
	
	console.log("[");
	
	function exit(){
		clearTimeout(execTO);
		crawler.browser().close();		
	}
	
	crawler.on("redirect", async function(e, crawler){
		// console.log(crawler.redirect());
		// console.log(e.params.url);
		// utils.printCookies(crawler);
		// utils.printRequest({type:'link',method:"GET",url:e.params.url});
		// exit();
	});


	crawler.on("domcontentloaded", async function(e, crawler){
		//utils.printCookies(crawler);
		await utils.printLinks("html", crawler.page())
		await utils.printForms("html", crawler.page())
		
		//await sleep(4000)
	});

	crawler.on("start", function(e, crawler){
		//console.log("--->Start");	
	})


	crawler.on("newdom", async function(e, crawler){
		//console.log(e.params)
	})

	crawler.on("xhr", async function(e, crawler){
		utils.printRequest(e.params.request)

		//return false
	});

	crawler.on("xhrCompleted", function(e, crawler){
		//console.log("XHR completed")
	});


	crawler.on("fetch", async function(e, crawler){
		utils.printRequest(e.params.request)
		//await sleep(6000);
		//return false
	});

	crawler.on("fetchCompleted", function(e, crawler){
		//console.log("XHR completed")
	});

	crawler.on("jsonp", function(e, crawler){
		utils.printRequest(e.params.request)
	});

	crawler.on("jsonpCompleted", function(e, crawler){

	});

	crawler.on("websocket", function(e, crawler){
		utils.printRequest(e.params.request)
	});

	crawler.on("websocketMessage", function(e, crawler){
		
	});

	crawler.on("websocketSend", function(e, crawler){

	});

	crawler.on("formSubmit", function(e, crawler){
		utils.printRequest(e.params.request)
	});

	crawler.on("navigation", function(e, crawler){
		e.params.request.type="link";
		utils.printRequest(e.params.request)
	});

	crawler.on("eventtriggered", function(e, crawler){		
		//console.log(e.params)
	});

	crawler.on("triggerevent", function(e, crawler){		
		//console.log(e.params)
	});

	crawler.on("earlydetach", function(e, crawler){	
		//console.log('["warning","earlydetach of element ' + e.params.node + '],')
		//crawler.browser().close();
	});


	async function end(){
		if(!crawler.redirect()){
			const el = await crawler.page().$("html");
			const v = await el.getProperty('innerText');
			const hash = await v.jsonValue();
			var json = '["page_hash",' + JSON.stringify(hash) + '],';
			console.log(json);

			if(options.returnHtml){
				json = '["html",' + JSON.stringify(hash) + '],';
				console.log(json);
			}
		}
		
		utils.printStatus(crawler);
		exit();		
	}

	crawler.on("end", end);

	execTO = setTimeout(function(){ // (very dirty solution)
		crawler.on("end", function(){});
		crawler.errors().push(["probe_timeout", "maximum execution time reached"]);
		end();
	}, options.maxExecTime);


	crawler.start()	

})