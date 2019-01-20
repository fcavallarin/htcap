/*
HTCAP - 1.2
http://htcap.org
Author: filippo.cavallarin@wearesegment.com

This program is free software; you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation; either version 2 of the License, or (at your option) any later
version.
*/

//"use strict";

//const urlparser = require('url').parse
const { URL } = require('url');
const fs = require('fs');

var outfile = null;

exports.parseArgs = function(args, optstring, defaults){
	var g = getopt(args, optstring);
	g.args.splice(0,2);
	return {opts:parseArgsToOptions(g, defaults), args:g.args};
}

exports.usage = usage;
exports.printRequest = printRequest;
exports.printLinks = printLinks;
exports.printForms = printForms;
exports.printStatus = printStatus;
exports.print_out = print_out;


var printedRequests = [];

function printRequest(req){
	if(!("method" in req))
		req.method = "GET";
	if(!("data" in req))
		req.data = null;
	req.url = filterUrl(req.url);
	if(!req.url)
		return;
	let jr = JSON.stringify(req);
	if(printedRequests.indexOf(jr) != -1)
		return;
	printedRequests.push(jr);
	print_out('["request",' + jr + "],");

}


function filterUrl(url){
	url = url.split("#")[0];
	if(url.match(/^[a-z0-9\-_]+\:/i) && !url.match(/(^https?)|(^ftps?)\:/i)){
		return null;
	}

	return url;
}

async function printLinks(rootNode, page){
	var el = await page.$(rootNode);
	var req, t;
	if(!el)return;
	var links = await el.$$("a");
	for(let l of links){
		t = await (await l.getProperty('href')).jsonValue();
		req = { type: "link", url: t};
		printRequest(req);
	}
	var metas = await el.$$('meta[http-equiv="refresh"]');
	for(let m of metas){
		t = await (await m.getProperty('content')).jsonValue();
		t = t.split(";");
		if(t.length > 1 && t[1] && t[1].toLowerCase().startsWith("url=")){
			var purl = new URL(page.url());
			var absurl = new URL(t[1].substr(4), purl.protocol + "//" + purl.hostname);
			req = { type: "link", url: absurl.href};
			printRequest(req);
		}
	}
}

async function printForms(rootNode, page){
	var el = await page.$(rootNode);//.then(el => {
	//page.evaluate(e => console.log(e.innerText), el)
	if(!el)return;
	var forms = await el.$$("form");//.then(forms => {
	for(let f of forms){
		var req = await getFormAsRequest(f, page); //.then(req => {
		printRequest(req);
	}
}



async function printStatus(crawler){
	var o = {
		status: "ok"
	};
	if(crawler.errors().length > 0 && !crawler.redirect()){
		o.errors = JSON.stringify(crawler.errors());
		o.status = "error";
		o.code = crawler.errors()[0][0];
		o.message = crawler.errors()[0][1];
	}
	if(crawler.redirect()){
		o.redirect = crawler.redirect();
	}

	await printCookies(crawler);
	print_out(JSON.stringify(o) + '\n]');
}

async function getFormAsRequest(frm, page){

	var formObj = {type:"form"};
	var inputs = null;

	formObj.method = await (await frm.getProperty("method")).jsonValue();

	if(!formObj.method){
		formObj.method = "GET";
	} else {
		formObj.method = formObj.method.toUpperCase();
	}

	formObj.url = await (await frm.getProperty("action")).jsonValue();
	formObj.data = [];
	inputs = await frm.$$("input, select, textarea");
	for(let input of inputs){
		let name = await (await input.getProperty("name")).jsonValue();
		if(!name) continue;
		let value = await (await input.getProperty("value")).jsonValue();
		let tagName = await (await input.getProperty("tagName")).jsonValue();
		let type = await (await input.getProperty("type")).jsonValue();

		let par = encodeURIComponent(name) + "=" + encodeURIComponent(value);
		if(tagName == "INPUT" && type != null){

			switch(type.toLowerCase()){
				case "button":
				case "submit":
					break;
				case "checkbox":
				case "radio":
					let checked = await (await input.getProperty("checked")).jsonValue();
					if(checked)
						formObj.data.push(par);
					break;
				default:
					formObj.data.push(par);
			}

		} else {
			formObj.data.push(par);
		}
	}

	formObj.data = formObj.data.join("&");

	return formObj;

};


async function printCookies(crawler){
	print_out('["cookies",' + JSON.stringify(await crawler.cookies()) + "],")
}


function parseArgsToOptions(args, defaults){
	let options = {};
	for(var a in defaults){
		options[a] = defaults[a];
	}
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
			case "d": // unused
				options.printAjaxPostData = false;
			case "S": // unused
				options.checkScriptInsertion = false;
				break;
			case "I": // unused
				options.loadImages = true;
				break;
			case "C": // unused
				options.getCookies = false;
				break;

			case "c":
				try{
					var cookie_file = fs.readFileSync(args.opts[a][1]);
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
			case "M": // unused
				options.mapEvents = false;
				break;
			case "T": // unused
				options.triggerAllMappedEvents = false;
				break;
			case "s": // unused
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
			case "X": // @TODO to be reviewed
				options.excludedUrls = args.opts[a][1].split(",");
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
			case "R":
				options.randomSeed = args.opts[a][1];
				break;
			case "P":
				options.loadWithPost = true;
				break;
			case "D":
				options.postData = args.opts[a][1];
				break;
			case "y":
				var tmp = args.opts[a][1].split(":");
				if(tmp.length > 2){
					options.proxy = tmp[0] + "://" + tmp[1] + ":" + tmp[2];
				} else {
					options.proxy = args.opts[a][1];
				}
				break;
			case "l":
				options.headlessChrome = false;
				break;
			case "E":
				options.extraHeaders = JSON.parse(args.opts[a][1]);
				break;
			case "J":
				outfile = args.opts[a][1];
				fs.writeFileSync(outfile, "", (err) => {
					console.log("Error writing to outfile");
				});
				break;

		}
	}
	return options;
};






// @todo error on Unknown option ds
function getopt(args, optstring){
	var args = args.slice();
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



function print_out(str){
	if(outfile){
		fs.appendFileSync(outfile, str + "\n", (err) => {});
	} else {
		console.log(str);
	}
}


function usage(){
	var usage = "Usage: analyze.js [options] <url>\n" +
				"  -V              verbose\n" +
				"  -a              don't check ajax\n" +
				"  -f              don't fill values\n" +
				"  -t              don't trigger events (onload only)\n" +
				"  -s              don't check websockets\n" +
				"  -M              don't map events\n" +
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
				"  -y <host:port>  use http proxY\n" +
				"  -l              do not run chrome in headless mode\n" +
				"  -v              exit after parsing options, used to verify user script\n" +
				"  -E              set extra http headers (json encoded {name:value}\n" +
				"  -J <path>       print json to file instead of stdout";
	console.log(usage);
}








