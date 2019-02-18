/*
htcrawl - 1.1
http://htcrawl.org
Author: filippo.cavallarin@wearesegment.com

This program is free software; you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation; either version 2 of the License, or (at your option) any later
version.
*/

"use strict";

const puppeteer = require('puppeteer');
const defaults = require('./options').options;
const probe = require("./probe");
const probeTextComparator = require("./shingleprint");

const utils = require('./utils');
const process = require('process');

exports.launch = async function(url, options){
	options = options || {};
	const chromeArgs = [
		'--no-sandbox',
		'--disable-setuid-sandbox',
		'--disable-gpu',
		'--hide-scrollbars',
		'--mute-audio',
		'--ignore-certificate-errors',
		'--ignore-certificate-errors-spki-list',
		'--ssl-version-max=tls1.3',
		'--ssl-version-min=tls1',
		'--disable-web-security',
		'--allow-running-insecure-content'
	];
	for(let a in defaults){
		if(!(a in options)) options[a] = defaults[a];
	}
	if(options.proxy){
		chromeArgs.push("--proxy-server=" + options.proxy);
	}

	if(options.openChromeDevtoos){
		chromeArgs.push('--auto-open-devtools-for-tabs');
	}

	var browser = await puppeteer.launch({headless: options.headlessChrome, ignoreHTTPSErrors: true, args:chromeArgs});
	var c = new Crawler(url, options, browser);
	await c.loadPage(browser);
	return c;
};






function Crawler(targetUrl, options, browser){

	targetUrl = targetUrl.trim();
	if(targetUrl.length < 4 || targetUrl.substring(0,4).toLowerCase() != "http"){
		targetUrl = "http://" + targetUrl;
	}
	this.targetUrl = targetUrl;

	this.publicProbeMethods = [''];
	this._cookies = [];
	this._redirect = null;
	this._errors = [];

	this.error_codes = ["contentType","navigation","response"];

	this.probeEvents = {
		start: function(){},
		xhr: function(){},
		xhrcompleted: function(){},
		fetch: function(){},
		fetchcompleted: function(){},
		jsonp: function(){},
		jsonpcompleted: function(){},
		websocket: function(){},
		websocketmessage: function(){},
		websocketsend: function(){},
		formsubmit: function(){},
		fillinput: function(){},
		//requestscompleted: function(){},
		//dommodified: function(){},
		newdom: function(){},
		navigation: function(){},
		domcontentloaded: function(){},
		//blockedrequest: function(){},
		redirect: function(){},
		earlydetach: function(){},
		triggerevent: function(){},
		eventtriggered: function(){},
		//end: function(){}
	}


	this.options = options;

	this._browser = browser;
	this._page = null;
}



Crawler.prototype.browser = function(){
	return this._browser;
}

Crawler.prototype.page = function(){
	return this._page;
}

Crawler.prototype.cookies = async function(){
	var pcookies = [];
	if(this._page){
		let cookies = await this._page.cookies();
		for(let c of cookies){
			pcookies.push({
				name: c.name,
				value: c.value,
				domain: c.domain,
				path: c.path,
				expires: c.expires,
				httponly: c.httpOnly,
				secure: c.secure
			});
			this._cookies = this._cookies.filter( (el) => {
				if(el.name != c.name){
					return el;
				}
			})
		}
	}
	return this._cookies.concat(pcookies);
}

Crawler.prototype.redirect = function(){
	return this._redirect;
}

Crawler.prototype.errors = function(){
	return this._errors;
}

Crawler.prototype.start = async function(){
	var _this = this;

	if(this.options.verbose)console.log("LOAD")

	var assertContentType = function(hdrs){
		let ctype = 'content-type' in hdrs ? hdrs['content-type'] : "";

		if(ctype.toLowerCase().split(";")[0] != "text/html"){
			_this._errors.push(["contentType", `content type is ${ctype}`]);
			//_this.dispatchProbeEvent("end", {});
			return false;
		}
		return true;
	}

	if(this.options.httpAuth){
		await this._page.authenticate({username:this.options.httpAuth[0], password:this.options.httpAuth[1]});
	}

	if(this.options.userAgent){
		await this._page.setUserAgent(this.options.userAgent);
	}

	await this._page.setDefaultNavigationTimeout(500000);

	//this._page.goto(this.targetUrl, {waitUntil:'load'}).then(async resp => {
	try{
		var resp = await this._page.goto(this.targetUrl, {waitUntil:'load'});

		if(!resp.ok()){
			_this._errors.push(["response", resp.request().url() + " status: " + resp.status()]);
			throw resp.status();
			//_this.dispatchProbeEvent("end", {});
			//return;
		}
		var hdrs = resp.headers();
		_this._cookies = utils.parseCookiesFromHeaders(hdrs, resp.url())


		if(!assertContentType(hdrs)){
			//return;
			throw "Content type is not text/html";
		}


		await this._page.evaluate(async function(){
			window.__PROBE__.takeDOMSnapshot();
		});


		await _this.dispatchProbeEvent("domcontentloaded", {});

		await _this._page.evaluate(async function(){
			await window.__PROBE__.waitAjax();
			await window.__PROBE__.waitJsonp();
			await window.__PROBE__.waitFetch();

			await window.__PROBE__.dispatchProbeEvent("start");
			console.log("startAnalysis")
			await window.__PROBE__.startAnalysis();
		});

		return _this;
	}catch(e){
		_this._errors.push(["navigation","navigation aborted"]);
		//_this.dispatchProbeEvent("end", {});
		throw e;
	};

}

Crawler.prototype.on = function(eventName, handler){
	eventName = eventName.toLowerCase();
	if(!(eventName in this.probeEvents)){
		throw("unknown event name");
	}
	this.probeEvents[eventName] = handler;
};


Crawler.prototype.probe = function(method, args){
	var _this = this;

	return new Promise( (resolve, reject) => {
		_this._page.evaluate( async (method, args) => {
			var r = await window.__PROBE__[method](...args);
			return r;
		}, [method, args]).then( ret => resolve(ret));
	})
}


Crawler.prototype.dispatchProbeEvent = async function(name, params) {
	name = name.toLowerCase();
	var ret, evt = {
		name: name,
		params: params || {}
	};

	ret = await this.probeEvents[name](evt, this);
	if(ret === false){
		return false;
	}

	return true;
}


Crawler.prototype.loadPage = async function(browser){
	var options = this.options,
		targetUrl = this.targetUrl,
		pageCookies = this.pageCookies;

	var crawler = this;

	// generate a static map of random values using a "static" seed for input fields
	// the same seed generates the same values
	// generated values MUST be the same for all analyze.js call othewise the same form will look different
	// for example if a page sends a form to itself with input=random1,
	// the same form on the same page (after first post) will became input=random2
	// => form.data1 != form.data2 => form.data2 is considered a different request and it'll be crawled.
	// this process will lead to and infinite loop!
	var inputValues = utils.generateRandomValues(this.options.randomSeed);

	var firstRun = true;
	const page = await browser.newPage();
	crawler._page = page;
	//if(options.verbose)console.log("new page")
	await page.setRequestInterception(true);

	page.on('request', async req => {
		const overrides = {};
		if(req.isNavigationRequest() && req.frame() == page.mainFrame()){
			if(req.redirectChain().length > 0){
				crawler._redirect = req.url();
				var uRet = await crawler.dispatchProbeEvent("redirect", {url: crawler._redirect});
				if(!uRet){
					req.abort('aborted'); // die silently
					return;
				}
				if(options.exceptionOnRedirect){
					req.abort('failed'); // throws exception
					return;
				}
				req.continue();
				return;
			}

			if(!firstRun){
				page.evaluate(function(r){
					window.__PROBE__.triggerNavigationEvent(r.url, r.method, r.data);
				}, {method:req.method(), url:req.url(), data:req.postData()});
				req.abort('aborted');
				return;
			} else {
				if(options.loadWithPost){
					overrides.method = 'POST';
					if(options.postData){
						overrides.postData = options.postData;
					}
				}
			}

			firstRun = false;
		}

		req.continue(overrides);
	});


	page.on("dialog", function(dialog){
		dialog.accept();
	});


	page.exposeFunction("__htcrawl_probe_event__",   (name, params) =>  {return this.dispatchProbeEvent(name, params)}); // <- automatically awaited.."If the puppeteerFunction returns a Promise, it will be awaited."

	 await page.setViewport({
		width: 1366,
		height: 768,
	});

	page.evaluateOnNewDocument(probe.initProbe, this.options, inputValues);
	page.evaluateOnNewDocument(probeTextComparator.initTextComparator);
	page.evaluateOnNewDocument(utils.hookNativeFunctions, this.options);

	try{
		if(options.referer){
			await page.setExtraHTTPHeaders({
				'Referer': options.referer
			});
		}
		if(options.extraHeaders){
			await page.setExtraHTTPHeaders(options.extraHeaders);
		}
    	for(let i=0; i < options.setCookies.length; i++){
    		if(!options.setCookies[i].expires)
    			options.setCookies[i].expires = parseInt((new Date()).getTime() / 1000) + (60*60*24*365);
	    	//console.log(options.setCookies[i]);
    		await page.setCookie(options.setCookies[i]);
    	}

		//if(options.verbose)console.log("goto returned")

	}catch(e) {
		// do something  . . .
		console.log(e)
	}

};


