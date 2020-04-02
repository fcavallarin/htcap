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

const htcrawl = require("htcrawl");
const utils = require('./utils');
const process = require('process');
const os = require('os');
const fs = require('fs');
const path = require('path');


var sleep = function(n){
	return new Promise(resolve => {
		setTimeout(resolve, n);
	});
};


var argv = utils.parseArgs(process.argv, "hVaftUdICc:MSp:Tsx:A:r:mHX:PD:R:Oi:u:vy:E:lJ:L:zM", {});
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


//options.openChromeDevtoos = true;
(async () => {
	const crawler = await htcrawl.launch(targetUrl, options);
	const page = crawler.page();
	var execTO = null;
	var domLoaded = false;
	var endRequested = false;
	var loginSeq = 'loginSequence' in options ? options.loginSequence : false;
	const pidfile = path.join(os.tmpdir(), "htcap-pids-" + process.pid);

	async function exit(){
		//await sleep(1000000)
		clearTimeout(execTO);
		await crawler.browser().close();
		fs.unlink(pidfile, (err) => {});
		process.exit();
	}

	async function getPageText(page){
		const el = await crawler.page().$("html");
		const v = await el.getProperty('innerText');
		return await v.jsonValue();
	}

	async function end(){
		if(endRequested) return;
		endRequested = true;
		if(domLoaded && !crawler.redirect()){
			const hash = await getPageText(crawler.page());
			var json = '["page_hash",' + JSON.stringify(hash) + '],';
			utils.print_out(json);

			if(options.returnHtml){
				json = '["html",' + JSON.stringify(hash) + '],';
				utils.print_out(json);
			}
		}

		await utils.printStatus(crawler);
		await exit();
	}

	async function loginErr(message, seqline){
		if(seqline){
			message = "action " + seqline + ": " + message;
		}
		crawler.errors().push(["login_sequence", message]);
		await end();
	}

	async function isLogged(page, condition){
		const text = await page.content();
		const regexp = new RegExp(condition, "gi");
		return text.match(regexp) != null;
	}

	async function getElement(selector, page){
		selector = selector.trim();
		if(selector.startsWith("$")){
			let e = await page.$x(selector.substring(1));
			return e.length > 0 ? e[0] : null;
		}

		return await page.$(selector);
	}

	fs.writeFileSync(pidfile, crawler.browser().process().pid);
	utils.print_out("[");

	crawler.on("redirect", async function(e, crawler){

	});


	crawler.on("domcontentloaded", async function(e, crawler){
		//utils.printCookies(crawler);
		domLoaded = true;
		await utils.printLinks("html", crawler.page());
	});

	crawler.on("start", async function(e, crawler){
		//console.log("--->Start");
		await utils.printForms("html", crawler.page());
	})


	crawler.on("newdom", async function(e, crawler){
		await utils.printLinks(e.params.rootNode, crawler.page())
		await utils.printForms(e.params.rootNode, crawler.page())
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

	execTO = setTimeout(function(){
		crawler.errors().push(["probe_timeout", "maximum execution time reached"]);
		end();
	}, options.maxExecTime);


	try {
		await crawler.load();
	} catch(err){
		await end();
	}

	if(loginSeq) {
		if(await isLogged(crawler.page(), loginSeq.loggedinCondition) == false){
			if(loginSeq.url && loginSeq.url != targetUrl && !options.loadWithPost){
				try{
					await crawler.navigate(loginSeq.url);
				} catch(err){
					await loginErr("navigating to login page");
				}
			}
			let seqline = 1;
			for(let seq of loginSeq.sequence){
				switch(seq[0]){
					case "sleep":
						await sleep(seq[1]);
						break;
					case "write":
						try{
							let e = await getElement(seq[1], crawler.page());
							await e.type(seq[2]);
						} catch(e){
							await loginErr("element not found ", seqline);
						}
						break;
					case "set":
						try{
							let e = await getElement(seq[1], crawler.page());
							await crawler.page().evaluate((el, u) => {el.value = u}, e, seq[2])
						} catch(e){
							await loginErr("element not found", seqline);
						}
						break;
					case "click":
						try{
							let e = await getElement(seq[1], crawler.page());
							await e.click();
						} catch(e){
							await loginErr("element not found", seqline);
						}
						await crawler.waitForRequestsCompletion();
						break;
					case "clickToNavigate":
						let e = await getElement(seq[1], crawler.page());
						if(e == null){
							await loginErr("element not found", seqline);
						}
						try{
							await crawler.clickToNavigate(e, seq[2]);
						} catch(err){
							await loginErr(err, seqline);
						}
						break;
					case "assertLoggedin":
						if(await isLogged(crawler.page(), loginSeq.loggedinCondition) == false){
							await loginErr("login sequence faild", seqline);
						}
						break;
					default:
						await loginErr("action not found", seqline);
				}
				seqline++;
			}
		}
	}

	try {
		if(!options.doNotCrawl){
			options.exceptionOnRedirect = true;
			await crawler.start();
		}
		await end();
	} catch(err){
		await end();
	}

})();

