
var system = require('system');
var fs = require('fs');

/*
track:
	ajax 100%	
	load resources: 100%
		form post
		iframe src
		window.open
		location.href BROKEN		
	
	<script> tags insertion (ie jsonp) 100%
	websokets 70% .. missing trigger
	events attached to element 100%
	interesting elemnts in page 100%
		forms
		iframes
	console logs TODO (???)

*/




var options ={
	verbose: false,
	checkAjax: true,
	fillValues: true,
	triggerEvents: true,
	checkAllResources: false,
	checkWebsockets: true,
	searchUrls: false,
	jsonOutput:false,
	maxExecTime: 15000,
	printAjaxPostData: true,
	loadImages: false,
	getCookies:false,
	mapEvents: false,
	checkScriptInsertion: false,
	mapInterestingElements: false,
	httpAuth: false,
	triggerAllMappedEvents: false,
	outputMappedEvents: false,
	overrideTimeoutFunctions: true,
	referer: false,
	userAgent: 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/37.0.2062.120 Safari/537.36',
	allEvents: ['abort', 'autocomplete', 'autocompleteerror', 'beforecopy', 'beforecut', 'beforepaste', 'blur', 'cancel', 'canplay', 'canplaythrough', 'change', 'click', 'close', 'contextmenu', 'copy', 'cuechange', 'cut', 'dblclick', 'drag', 'dragend', 'dragenter', 'dragleave', 'dragover', 'dragstart', 'drop', 'durationchange', 'emptied', 'ended', 'error', 'focus', 'input', 'invalid', 'keydown', 'keypress', 'keyup', 'load', 'loadeddata', 'loadedmetadata', 'loadstart', 'mousedown', 'mouseenter', 'mouseleave', 'mousemove', 'mouseout', 'mouseover', 'mouseup', 'mousewheel', 'paste', 'pause', 'play', 'playing', 'progress', 'ratechange', 'reset', 'resize', 'scroll', 'search', 'seeked', 'seeking', 'select', 'selectstart', 'show', 'stalled', 'submit', 'suspend', 'timeupdate', 'toggle', 'volumechange', 'waiting', 'webkitfullscreenchange', 'webkitfullscreenerror', 'wheel'],
	returnHtml: false,
	pageWait: 50,
	datatypeValues:{
		string: 'g00dD4Yt0d4Y',
		number: '3857395968',
		date: '2015-04-06',
		color: '#ff0000',	
		month:'02',
		week:'2015-W06',
		time:'01:02',
		datetimeLocal:'2017-03-04T02:01',
		email:'random@opopopo.com',
		url:'http://www.opopopo.com',
		humanDate: "05/05/2015"
	},
	inputNameMatchValue:[ // regexps NEED to be string to get passed to phantom page
		{name: "mail", value: "email"},
		{name: "((number)|(phone))|(^tel)", value: "number"},
		{name: "(date)|(birth)", value: "humanDate"},
		{name: "((month)|(day))|(^mon$)", value: "month"},
		{name: "url", value: "url"}		
	],
	/* always trigger these events since event delegation may be "confuse" the triggering of mapped events */
	eventsMap: {
		'button':['click','keyup','keydown'],
		'select':['change','click','keyup','keydown'],
		'input':['change','click','blur','focus','keyup','keydown'],												
		'a':['click','keyup','keydown'],
		'textarea':['change','click','blur','focus','keyup','keydown']				
	} 
};

var site = "";
var set_cookies = [];
var response = null;
showHelp = false;

// @todo error on Unknown option
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



var args = getopt(system.args,"hVaftRUJdICc:MSEp:Tsx:A:r:mH");
if(typeof args == 'string'){
	console.log("Error: " + args);
	phantom.exit(-1);
}


for(var a = 0; a < args.opts.length; a++){			
	switch(args.opts[a][0]){
		case "h": 
			showHelp = true;
			break;
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
		case "R":
			options.checkAllResources = true;
			break;			
		case "U":
			options.searchUrls = true;
			break;			
		case "J":
			options.jsonOutput = true;
			break;
		case "d":
			options.printAjaxPostData = false;
		case "S":
			options.checkScriptInsertion = true;	
			break;				
		case "I":
			options.loadImages = true;
			break;
		case "C":
			options.getCookies = true;
			break;
		case "E":
			options.mapInterestingElements = true;
			break;			
		case "c":
			try{
				cookie_file = fs.read(args.opts[a][1]);
				set_cookies = JSON.parse(cookie_file);
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
			options.mapEvents = true;
			break;		
		case "T":
			options.triggerAllMappedEvents = true;
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
	}

}

site = args.args[1];

if(!site || showHelp){
	var usage = "Usage: hasajax [options] <url>\n" +
					"  -V              verbose\n" +
					"  -a              don't check ajax\n" +
					"  -f              don't fill values\n" +
					"  -t              don't trigger events (onload only)\n" +
					"  -s              don't check websockets\n" +
					"  -T              trigger all discovered events\n" +				
					"  -R              check loaded resources\n" +
					"  -U              search for urls in html (href, script src, window.open)\n" +
					"  -J              format output as json\n" + 
					"  -d              don't print ajax POST data\n" +
					"  -C              get cookies\n" +
					"  -c <path>       cookie file (json)\n" +
					"  -M              map events\n" +
					"  -S              check for <script> insertion\n" +
					"  -p <user:pass>  http auth \n" +
					"  -x <seconds>    maximum execution time \n" +
					"  -A <user agent> set user agent \n" +
					"  -E              map interesing elements (forms and iframes)\n" +
					"  -r <url>        set referer \n" +
					"  -m              output mapped events \n" +
					"  -I              load images";
	console.log(usage);
	phantom.exit(-1);
}


/* maximum execution time */
setTimeout(function(){
	if(!response || response.headers.length == 0){
		if(options.jsonOutput){
			console.log(JSON.stringify({response:response, error:true, timeout: true}));
		} else {
			console.log("Timeout: " + site);
		}
		// always return 0 	
		phantom.exit(0);
	}

	var out = {
		processingTimeout: true,
		error:true,
		response: response
	};
	ret = options.jsonOutput ? JSON.stringify(out) : "Timeout processing: " + site
	console.log(ret);
	phantom.exit(0)
},options.maxExecTime);

if(site.length < 4 || site.substring(0,4).toLowerCase() != "http"){
	site = "http://" + site;
}

var page = require('webpage').create();

for(var a = 0; a < set_cookies.length; a++){		
	// maybe this is wrogn acconding to rfc .. but phantomjs cannot set cookie witout a domain...
	if(!set_cookies[a].domain){		
		var purl = document.createElement("a");
		purl.href=site;
		set_cookies[a].domain = purl.hostname
	}
	if(set_cookies[a].expires)
		set_cookies[a].expires *= 1000;

	phantom.addCookie(set_cookies[a]);	
	
}


var request_cookies = phantom.cookies;

page.onConsoleMessage = function(msg, lineNum, sourceId) {
	if(options.verbose)
		console.log("console: " + msg);
}
page.onError = function(msg, lineNum, sourceId) {
	if(options.verbose)
		console.log(/*lineNum + ": " + */msg);
}
	
page.onAlert = function(msg) {
  //console.log('ALERT: ' + msg);
};

page.settings.userAgent = options.userAgent;
page.settings.loadImages = options.loadImages;

var headers = {};

if(options.httpAuth){
	headers['Authorization'] = 'Basic ' + btoa(options.httpAuth[0] + ":" + options.httpAuth[1]);
}

if(options.referer){
	headers['Referer'] = options.referer;	
}

page.customHeaders = headers;


page.onResourceReceived = function(resource) {
	if(response == null){
		response = resource;

	}
};

// to detect window.location= / document.location.href=
page.onNavigationRequested = function(url, type, willNavigate, main) {	
	// @todo: detection on window.location is broken .. it fals on multiple calls
	if(options.checkAllResources && page.navigationLocked == true){		

		page.evaluate(function(url, type, main){
			if(type == "LinkClicked")
				return;

			var obj = {url:url, type:type};
			if(type == 'Other' && main == false)
				obj.type = 'iframe';
			if(type == "FormSubmitted")
				obj.type = 'form';

			window.__PROBE__.resources.push(obj);
		},url, type, main)
	}	
	page.navigationLocked = true;
}

page.onConfirm = function(msg) {return false;}

// overwrite XMLHttpRequest BEFORE page is loaded to catch ajax onDomReady
page.onInitialized = function() {
	page.evaluate(function(options) {

		function Probe(){			
			this.ajaxTriggers = [];
			this.ajaxRequests = [];
			this.curElement = {};
			this.winOpen = [];	
			this.resources = [];
			this.urls = [];
			this.eventsMap = [];
			this.script_tagsInserted = [];
			this.elements = [];
			this.triggeredEvents = [];
			this.websockets = [];
			this.html = "";
		};

		Probe.prototype.fillInputValues = function(){
			var ret = false;
			var els = document.querySelectorAll("input, select, textarea");
			
			for(var a = 0; a < els.length; a++){
				if(this.setVal(els[a]))
					ret = true;
			}
			return ret;
		};

		Probe.prototype.isEventTriggerable = function(event){

			return ['load','unload','beforeunload'].indexOf(event) == -1;			

		};

		Probe.prototype.triggerAllEvents = function(options, fillValues){
			
			var elements = options.eventsMap;
		
			this.curElement.withVal = fillValues;

			var triggeredEvents = [];

			for(var n in elements){			
				var _inputs = document.getElementsByTagName(n);	
				// convert collection to array to avoid conflicts with elements that will be added during triggering
				var inputs = Array.prototype.slice.call( _inputs, 0 );	
				for(var a = 0; a < inputs.length; a++){			
					for(var b = 0; b < elements[n].length; b++){							
						this.curElement.element = inputs[a];
						this.curElement.event = elements[n][b];								
						triggeredEvents.push({e: inputs[a], ev: elements[n][b]});
						this.trigger(inputs[a], elements[n][b]);
					}
				}
			}

			
			if(options.triggerAllMappedEvents){
				for(var a = 0; a < this.eventsMap.length; a++){
					var element = this.eventsMap[a].element;
					for(var b = 0; b < this.eventsMap[a].events.length; b++){
						var event = this.eventsMap[a].events[b];
						
						if(this.isEventTriggerable(event) && !this.objectInArray(triggeredEvents, {e:element, ev: event})){
							this.curElement.element = element;
							this.curElement.event = event;														
							triggeredEvents.push({e:element, ev: event});
							this.trigger(element, event);						
						}
					}
				}
			}				
			
		};

		Probe.prototype.trigger = function(el,evname){
			
			try{
				if ('createEvent' in document) {
					var evt = document.createEvent('HTMLEvents');
					evt.initEvent(evname, true, false);
					el.dispatchEvent(evt);
					return;
				}
				evname = 'on' + evname;
				if( evname in el && typeof el[evname] == "function"){
					el[evname]();
				}				
			} catch(e){}
		};


		// returns true if the value has been set 
		Probe.prototype.setVal = function(el){				
			var setv = function(name){
				var ret = options.datatypeValues['string'];
				for(var a = 0; a < options.inputNameMatchValue.length; a++){
					var regexp = new RegExp(options.inputNameMatchValue[a].name, "gi");						
					if(name.match(regexp)){
						ret = options.datatypeValues[options.inputNameMatchValue[a].value];
					}
				}
				return ret;
			}

			
			if(el.nodeName.toLowerCase() == 'textarea'){
				el.value = setv(el.name);
				return true;
			}

			if(el.nodeName.toLowerCase() == 'select'){
				var opts = el.getElementsByTagName('option');
				if(opts.length > 1){ // avoid to set the first (already selected) options
					el.value = opts[opts.length-1].value;
				} else {					
					el.value = setv(el.name);
				}
				
				return true;
			}

			switch(el.type.toLowerCase()){
				case 'button':
				case 'hidden':
				case 'submit':
					return false;					
				case '':	
				case 'text':
				case 'password':
				case 'search':
					el.value = setv(el.name);
					break;
				case 'radio':
				case 'checkbox':						
					el.setAttribute('checked',!(el.getAttribute('checked')));
					break;						
				case 'color':
					el.value = options.datatypeValues['color'];
					break;
				case 'date':
					el.value = options.datatypeValues['date'];						
					break;
				case 'datetime-local':
					el.value = options.datatypeValues['datetimeLocal'];
					break;
				case 'email':
					el.value = options.datatypeValues['email'];
					break;
				case 'month':
					el.value = options.datatypeValues['month'];
					break;
				case 'range':
				case 'number':
					if('min' in el){
						el.value = (parseInt(el.min) + parseInt(('step' in el) ? el.step : 1));
					} else{
						el.value = options.datatypeValues['number'];	
					}
					break;													
				case 'tel':
					el.value = options.datatypeValues['number'];
					break;
				case 'time':
					el.value = options.datatypeValues['time'];
					break;
				case 'url':
					el.value = options.datatypeValues['url'];
					break;
				case 'week':
					el.value = options.datatypeValues['week'];
					break;	
				default:
					return false;
			}					
			return true;									
		};


		Probe.prototype.describeElement = function(el){		
			if(!el)
				return "[]";
			var tagName = (el == document ? "document" : (el == window ? "window" :el.tagName));
			var text = el.textContent ? el.textContent.substring(0,20).trim() : null;

			var className = el.className ? (el.className.indexOf(" ") != -1 ? "'" + el.className + "'" : el.className) : "";
			var descr = "[" + 
					(tagName ? tagName +  " " : "") + 
					(el.name && typeof el.name == 'string' ? el.name + " " : "") +
					(className ? "." + className + " " : "")+ 
					(el.id ? "#" + el.id + " " : "") + 
					(el.src ? "src=" + el.src + " " : "") + 
					(el.action ? "action=" + el.action + " " : "") + 
					(el.method ? "method=" + el.method + " " : "") + 
					(el.value ? "v=" + el.value + " ": "") + 
					(text ? "txt=" + text : "") + 
					"]";					

			return descr;
							
		};

		Probe.prototype.describeAjaxTrigger = function(t){
			var el, ev;

			if(!t.element){
				el = "[BODY]";
			} else {
				var className = t.element.className && t.element.className.indexOf(" ") != -1 ? "'" + t.element.className + "'" : t.element.className;
				el =  (t.withVal ? "✎ " : "") + this.describeElement(t.element);					
			}

			ev = t.event || "onload";
			
			return el + "." + ev + "() → " + t.url + (t.data && options.printAjaxPostData ? ' data:' + t.data : '');
		};


		Probe.prototype.describeScriptTrigger = function(t){
			
			return (t.withVal ? "✎ " : "") + this.describeElement(t.trigger) + " → " + this.describeElement(t.element);
			
		};


		Probe.prototype.searchUrls = function(){
			var els = document.getElementsByTagName("a");
			for(var a = 0; a < els.length; a++){
				var prop = els[a].getAttribute('href');
				if(prop){
					prop = prop.split("#")[0];					
					if(!(prop in this.urls)){
						this.urls.push(prop);	
					}						
				}
			}
							
			return this.urls;
		};


		Probe.prototype.mapInterestingElements = function(){
			var ie = ['form','iframe'];
			for(var a = 0; a < ie.length; a++){
				var els = document.getElementsByTagName(ie[a]);
				for(var b = 0; b < els.length; b++){
					this.elements.push(els[b]);
				}
			}
			return this.elements;
		};

		Probe.prototype.objectInArray  = function(arr, el, ignoreProperties){
			ignoreProperties = ignoreProperties || [];
			if(arr.length == 0) return false;
			if(typeof arr[0] != 'object') 
				return arr.indexOf(el) > -1;
			for(var a = 0 ;a < arr.length; a++){	
				var found = true;
				for(var k in arr[a]){							
					if(arr[a][k] != el[k] && ignoreProperties.indexOf(k) == -1){								
						found = false;
					}
				}
				if(found) return true;		
			}
			return false;
		};



		Probe.prototype.arrayUnique = function(arr, ignoreProperties){
			var ret = [];				
			
			for(var a = 0; a < arr.length ; a++){		
				if(!this.objectInArray(ret, arr[a], ignoreProperties))
					ret.push(arr[a]);
			}
			return ret;
		};


		Probe.prototype.addEventToMap = function(element, event){
			
			for(var a = 0; a < this.eventsMap.length; a++){
				if(this.eventsMap[a].element == element){				
					this.eventsMap[a].events.push(event);
					return;
				}
			}
			this.eventsMap.push({
				element: element,
				events: [event]
			});
		};

		Probe.prototype.addScript = function(node){
			var obj = {
				element: node,
				trigger: this.curElement.element,
				withVal: this.curElement.withVal
			};

			if(node.nodeName.toLowerCase() == "script"  && node.getAttribute("src") && obj.trigger){
				this.script_tagsInserted.push(obj);
			}
		};

		window.__PROBE__ = new Probe();

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

		if(options.checkAjax){
			XMLHttpRequest.prototype.originalSend = XMLHttpRequest.prototype.send;
			XMLHttpRequest.prototype.send = function(data){		
								
				var curElement = {
					url: this.__urls.shift()
				};
				//clone element here to let elements with multiple ajax calls attached get the correct url per call
				for(var n in window.__PROBE__.curElement)
					curElement[n] = window.__PROBE__.curElement[n];
				
				if(data){
					curElement.data = data
				}

				window.__PROBE__.ajaxTriggers.push(curElement);
								
				// perform the request to avoid breaking javascript (in some ways)
				return this.originalSend(data);
			}

			XMLHttpRequest.prototype.originalOpen = XMLHttpRequest.prototype.open;
			XMLHttpRequest.prototype.open = function(method, url, async, user, password){		

				if(typeof this.__urls != 'object')
					this.__urls = [];
				this.__urls.push(method.toUpperCase() + " " + url);
				window.__PROBE__.ajaxRequests.push(this);
				
				return this.originalOpen(method, url, async, user, password);
			}
		}

		if(options.checkAllResources){
			window.open = function(url, name, specs, replace){
				// since resources array is populated asyncronously use a separate array to track window.open 
				window.__PROBE__.winOpen.push(url);
				// performing the call is not need (i guess) since (i guess) it wont break js			
			}
		}

		if(options.checkScriptInsertion){			
			Node.prototype.originalappendChild = Node.prototype.appendChild;						
			Node.prototype.appendChild = function(node){
				window.__PROBE__.addScript(node);
				return this.originalappendChild(node);
			}

			Node.prototype.originalinsertBefore = Node.prototype.insertBefore;						
			Node.prototype.insertBefore = function(node, element){
				window.__PROBE__.addScript(node);
				return this.originalinsertBefore(node, element);
			}

			Node.prototype.originalreplaceChild = Node.prototype.replaceChild;						
			Node.prototype.replaceChild = function(node, oldNode){
				window.__PROBE__.addScript(node);
				return this.originalreplaceChild(node, oldNode);
			}						
		}

		if(options.checkWebsockets){
			window.WebSocket = (function(WebSocket){
				return function(url, protocols){
					window.__PROBE__.websockets.push(url);
					return WebSocket.prototype;
				}
			})(window.WebSocket);
		}


		if(options.overrideTimeoutFunctions){

			window.setTimeout = (function(setTimeout){
				return function(func, time){					
					return setTimeout(func,0);
				}
			})(window.setTimeout);

			window.setInterval = (function(setInterval){
				return function(func, time){					
					return setInterval(func,0);
				}
			})(window.setInterval);

		}
		
	}, options);
};




page.open(site, { encoding: "utf8"}, function(status) {
	
	var checkContentType = function(ctype){
		ctype = ctype || ""
		return (ctype.toLowerCase().split(";")[0] == "text/html");
	};	

	var getCookies = function(headers, url){
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

	

	if (status !== 'success'){
		var mess = ""; 
		var out = {response: response};		

		if(!response || response.headers.length == 0){
			out.error = true;
			out.loaderror = true;	
			mess = "Unable to load " + site;
		} else {

			for(var a = 0; a < response.headers.length; a++){
				if(response.headers[a].name.toLowerCase() == 'location'){
					out.redirect = response.headers[a].value;
					out.redirect_has_content = 'bodySize' in response && response.bodySize > 0;
					mess += "Unable to follow redirect: " + out.redirect +"\n";
					if(out.redirect_has_content)
						mess += "HAS CONTENT!\n";
					if(options.getCookies){									
						out.cookies = getCookies(response.headers, site); //page.cookies;						
					}
					break;
				}
			}

			if(!checkContentType(response.contentType) && ! ('redirect' in out)){
				out.contentTypeError = true;
				out.error = true;
				mess += "contentTyper error: " + response.contentType +"\n";
			}
		
		}
		
		if(options.jsonOutput){
			console.log(JSON.stringify(out))
		} else {			
			console.log("Error on " + site + ": " + mess);	
		}

		phantom.exit(0);
	}
	
	
	if(!checkContentType(response.contentType)){
		var out = {
			contentTypeError: true,
			error: true,
			response: response
		}
		if(options.jsonOutput){
			console.log(JSON.stringify(out));
		} else {
			console.log("Content-type error: " + response.contentType);
		}
		phantom.exit(0);
	}
	

	if(options.mapEvents){
		page.evaluate(function(options){
			var els = document.getElementsByTagName("*");
			for(var a = 0; a < els.length; a++){
				for(var b = 0; b < options.allEvents.length; b++){
					var evname = "on" + options.allEvents[b];
					if(evname in els[a] && els[a][evname]){
						window.__PROBE__.addEventToMap(els[a], options.allEvents[b]);						
					}
				}
			}
		}, options);
	}


	if(options.triggerEvents){
		page.evaluate(function(options){		
			window.__PROBE__.triggerAllEvents(options, false);
			if(options.fillValues){
				var valFilled = window.__PROBE__.fillInputValues();				
				if(valFilled)
					window.__PROBE__.triggerAllEvents(options, true);
			}
		}, options);
	}

	if(options.returnHtml){
		page.evaluate(function(options){
			window.__PROBE__.html = document.documentElement.innerHTML;
		}, options);
	}


	// pause just a bit 
	window.setTimeout(function(){
		var output = page.evaluate(function(options){
			var descr = [];
			var out = {};
			
			if(window.__PROBE__.ajaxTriggers.length > 0 ){
				var trigs = window.__PROBE__.arrayUnique(window.__PROBE__.ajaxTriggers,["withVal"]);				
				out.ajax = [];
				descr.push("Ajax:");
				for(var a = 0; a < trigs.length; a++){										
					var d = window.__PROBE__.describeAjaxTrigger(trigs[a]);
					out.ajax.push(d);
					descr.push(" " + d);
				}
			}

			if(options.checkAllResources){								
				var l = [];
				out.resources = window.__PROBE__.resources;
				descr.push("Loaded resources:");					
				for(var a = 0; a < window.__PROBE__.winOpen.length; a++)
					out.resources.push({url: window.__PROBE__.winOpen[a], type: 'window.open'});										
				for(var a = 0; a < out.resources.length; a++)
					l.push(out.resources[a].type + " → " + out.resources[a].url);					
				out.resources = window.__PROBE__.arrayUnique(l);
				descr.push(" " + out.resources.join("\n "));				
			}

			if(options.searchUrls){				
				out.urls = window.__PROBE__.arrayUnique(window.__PROBE__.searchUrls());
				descr.push("Urls found:");
				descr.push(" " + out.urls.join("\n "));
			}
			
			if(options.mapInterestingElements){				
				var els = window.__PROBE__.mapInterestingElements();
				var e = [];
				for(var a = 0; a < els.length; a++)
					e.push(window.__PROBE__.describeElement(els[a]));
				e = window.__PROBE__.arrayUnique(e);
				out.elements = e;
				descr.push("Elements found:");
				descr.push(" " + e.join("\n "));
			}

			if(options.mapEvents && options.outputMappedEvents){		
				window.__PROBE__.eventsMap = window.__PROBE__.arrayUnique(window.__PROBE__.eventsMap);
				out.events = [];
				for(var a = 0; a < window.__PROBE__.eventsMap.length; a++){
					//out.events.push(window.__PROBE__.describeElement(window.__PROBE__.eventsMap[a].element));
					var evd = window.__PROBE__.describeElement(window.__PROBE__.eventsMap[a].element);
					out.events.push(evd+ " " +window.__PROBE__.eventsMap[a].events.join(","));
				}
				
				descr.push("Events found:");
				descr.push(" " + out.events.join("\n "));
			}

			if(options.checkScriptInsertion){
				var s = [];			
				var scripts = window.__PROBE__.arrayUnique(window.__PROBE__.script_tagsInserted);	
				for(var a = 0; a < scripts.length; a++){					
					s.push(window.__PROBE__.describeScriptTrigger(scripts[a]));
				}
				out.script_tags = window.__PROBE__.arrayUnique(s);
				descr.push("Script inserted:");
				descr.push(" " + out.script_tags.join("\n "));	
			}

			if(options.checkWebsockets){
				
				out.websockets = window.__PROBE__.arrayUnique(window.__PROBE__.websockets);
				descr.push("Websockets:");
				descr.push(" " + out.websockets.join("\n "));	
			}
			
			if(options.returnHtml){
				out.html = window.__PROBE__.html;
			}
			
			out.descr = descr.join("\n"); 
			return out;
		}, options);
		
		if(options.getCookies){
			output = output || {descr:""};
			if(options.jsonOutput){
				output.cookies = getCookies(response.headers, site);//page.cookies;
			} else {				
				output.descr +=  "\nCookies:\n " + JSON.stringify(getCookies(response.headers, site));
			}
		}		
				
		if(output){					
			if(options.jsonOutput){		
				delete	output.descr;
				output = JSON.stringify(output);
			} else {
				output = output.descr;
			}
			console.log(output);
			//system.stdout.writeLine(output);
			//console.log(JSON.stringify(response));
		}
		page.close();
		phantom.exit(0);
	},options.pageWait);	
});



