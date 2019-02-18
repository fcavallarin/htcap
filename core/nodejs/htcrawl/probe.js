/*
HTCRAWL - 1.0
http://htcrawl.org
Author: filippo.cavallarin@wearesegment.com

This program is free software; you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation; either version 2 of the License, or (at your option) any later
version.
*/

"use strict";

module.exports = {
	initProbe: initProbe
};



/*
	this function is passed to page.evaluate. doing so it is possible to avoid that the Probe object
	is inserted into page window scope (only its instance is referred by window.__PROBE__)
*/
function initProbe(options, inputValues){

	function Probe(options, inputValues){
		var _this = this;

		this.options = options;

		this.requestsPrintQueue = [];
		this.sentAjax = [];

		this.curElement = {};
		this.winOpen = [];
		this.resources = [];
		this.eventsMap = [];

		this.triggeredEvents = [];
		this.websockets = [];
		this.html = "";
		this.printedRequests = [];
		this.DOMSnapshot = [];
		this._pendingAjax = [];
		this._pendingJsonp = [];
		this._pendingFetch = [];
		this._pendingWebsocket = [];
		this.inputValues = inputValues;
		this.currentUserScriptParameters = [];
		this.domModifications = [];

		this._lastRequestId = 0;
		this.started_at = null;

		this.textComparator = null;

		this.setTimeout = window.setTimeout.bind(window);
		this.setInterval = window.setInterval.bind(window);

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

	Probe.prototype.compareObjects = function(obj1, obj2){
		var p;
		for(p in obj1)
			if(obj1[p] != obj2[p]) return false;

		for(p in obj2)
			if(obj2[p] != obj1[p]) return false;

		return true;
	}


	/*
		anchor.protocol; // => "http:"
		anchor.host;     // => "example.com:3000"
		anchor.hostname; // => "example.com"
		anchor.port;     // => "3000"
		anchor.pathname; // => "/pathname/"
		anchor.hash;     // => "#hash"
		anchor.search;   // => "?search=test"
	*/

	Probe.prototype.replaceUrlQuery = function(url, qs){
		var anchor = document.createElement("a");
		anchor.href = url;
		return anchor.protocol + "//" + anchor.host + anchor.pathname + (qs ? "?" + qs : "") + anchor.hash;
	};

	Probe.prototype.removeUrlParameter = function(url , par){
		var anchor = document.createElement("a");
		anchor.href = url;

		var pars = anchor.search.substr(1).split(/(?:&amp;|&)+/);

		for(var a = pars.length - 1; a >= 0; a--){
			if(pars[a].split("=")[0] == par)
				pars.splice(a,1);
		}


		return anchor.protocol + "//" + anchor.host + anchor.pathname + (pars.length > 0 ? "?" + pars.join("&") : "") + anchor.hash;
	};


	Probe.prototype.getAbsoluteUrl = function(url){
		var anchor = document.createElement('a');
		anchor.href = url;
		return anchor.href;
	};





	// do NOT use MutationObserver to get added elements .. it is asynchronous and the callback is fired only when DOM is refreshed (graphically)
	Probe.prototype.takeDOMSnapshot = function(){
		this.DOMSnapshot = Array.prototype.slice.call( document.getElementsByTagName("*"), 0 );
		return;
		var els = document.getElementsByTagName("*");
		for(var a = 0; a < els.length; a++){
			if(!els[a].__snapshot)
				els[a].__snapshot = true;
		}
	}


	Probe.prototype.getAddedElements = function(){
		var elements = []
		var rootElements = []
		var ueRet = null;
		var newDom = Array.prototype.slice.call( document.getElementsByTagName("*"), 0 );

		//*/console.log('get added elements start dom len: ' + this.DOMSnapshot.length + ' new dom len: ' + newDom.length);
		// get all added elements
		for(var a = 0;a < newDom.length;a++){
			if(this.DOMSnapshot.indexOf(newDom[a]) == -1) {
			//if(!newDom[a].__snapshot){
				// set __new flag on added elements to avoid checking for elments.indexOf
				// that is very very slow
				newDom[a].__new = true;
				elements.push(newDom[a]);
			}
		}

		///console.log("elements get... (tot "+elements.length+") searching for root nodes")

		for(var a = 0; a < elements.length; a++){
			var p = elements[a];
			var root = null;
			// find the farest parent between added elements
			while(p){
				//if(elements.indexOf(p) != -1){
				if(p.__new){
					root = p;
				}
				p = p.parentNode;
			}
			if(root && rootElements.indexOf(root) == -1){
				rootElements.push(root);
			}
		}

		for(var a = 0; a < elements.length; a++){
			delete elements[a].__new;
		}

		return rootElements;
	}




	/* DO NOT include node as first element.. this is a requirement */
	Probe.prototype.getDOMTreeAsArray = function(node){
		var out = [];
		var children = node.querySelectorAll(":scope > *");

		if(children.length == 0){
			return out;
		}

		for(var a = 0; a < children.length; a++){
			out.push(children[a]);
			out = out.concat(this.getDOMTreeAsArray(children[a]));
		}

		return out;
	}




	// class Request

	Probe.prototype.Request = function(type, method, url, data, trigger, extra_headers){
		this.type = type;
		this.method = method;
		this.url = url;
		this.data = data || null;
		this.trigger = trigger || null;
		this.extra_headers = extra_headers || {};

		//this.username = null; // todo
		//this.password = null;
	}

	// returns a unique string represntation of the request. used for comparision
	// should I also use extra_headers for comparisionn??
	Probe.prototype.Request.prototype.key = function(){
		var key = "" + this.type + this.method + this.url + (this.data ? this.data : "") + (this.trigger ? this.trigger : "")
		return key;
	};


	Probe.prototype.requestToJson = function(req){

		return JSON.stringify(this.requestToObject(req));
	}

	Probe.prototype.requestToObject = function(req){
		var obj ={
			type: req.type,
			method: req.method,
			url: req.url,
			data: req.data || null,
			extra_headers: req.extra_headers
		};

		if(req.trigger) obj.trigger = {element: this.describeElement(req.trigger.element), event:req.trigger.event};

		return obj;
	}

	// END OF class Request..





	// returns true if the value has been set
	Probe.prototype.setVal = async function(el){
		var options = this.options;
		var _this = this;

		var ueRet = await this.dispatchProbeEvent("fillinput", {element: this.getElementSelector(el)});
		if(ueRet === false) return;

		var getv = function(type){
			if(!(type in _this.inputValues))
				type = "string";

			return _this.inputValues[type];
		}

		var setv = function(name){
			var ret = getv('string');
			for(var a = 0; a < options.inputNameMatchValue.length; a++){
				var regexp = new RegExp(options.inputNameMatchValue[a].name, "gi");
				if(name.match(regexp)){
					ret = getv(options.inputNameMatchValue[a].value);
				}
			}
			return ret;
		}

		// needed for example by angularjs
		var triggerChange =  function(){
			// update angular model
			_this.trigger(el, 'input');
		}

		if(el.nodeName.toLowerCase() == 'textarea'){
			el.value = setv(el.name);
			triggerChange();
			return true;
		}

		if(el.nodeName.toLowerCase() == 'select'){
			var opts = el.getElementsByTagName('option');
			if(opts.length > 1){ // avoid to set the first (already selected) options
				el.value = opts[opts.length-1].value;
			} else {
				el.value = setv(el.name);
			}
			triggerChange();
			return true;
		}

		var type = el.type.toLowerCase();

		switch(type){
			case 'button':
			case 'hidden':
			case 'submit':
			case 'file':
				return false;
			case '':
			case 'text':
			case 'search':
				el.value = setv(el.name);
				break;

			case 'radio':
			case 'checkbox':
				el.setAttribute('checked',!(el.getAttribute('checked')));
				break;
			case 'range':
			case 'number':

				if('min' in el && el.min){

					el.value = (parseInt(el.min) + parseInt(('step' in el) ? el.step : 1));
				} else{
					el.value = parseInt(getv('number'));
				}
				break;
			case 'password':
			case 'color':
			case 'date':
			case 'email':
			case 'month':
			case 'time':
			case 'url':
			case 'week':
			case 'tel':
				el.value = getv(type);
				break;
			case 'datetime-local':
				el.value = getv('datetimeLocal');
				break;


			default:
				return false;
		}

		triggerChange();
		return true;
	};


	// Probe.prototype.getRandomValue = function(type){

	// 	if(!(type in this.inputValues))
	// 		type = "string";

	// 	return this.inputValues[type];

	// };


	Probe.prototype.getStaticInputValue = function(input){
		if(!this.options.staticInputValues.length )
			return null;

		for(let val of this.options.staticInputValues){
			if(input.matches(val[0])){
				return val[1];
			}
		}

		return null;

	};

	Probe.prototype.fillInputValues = async function(element){
		element = element || document;
		var ret = false;
		var els = element.querySelectorAll("input, select, textarea");


		for(var a = 0; a < els.length; a++){
			if(await this.setVal(els[a]))
				ret = true;
		}
		return ret;
	};


	Probe.prototype.trigger = function(el,evname){
		/* 	workaround for a phantomjs bug on linux (so maybe not a phantom bug but some linux libs??).
			if you trigger click on input type=color evertything freezes... maybe due to some
			color picker that pops up ...
		*/
		if(el.tagName == "INPUT" && el.type.toLowerCase()=='color' && evname=='click'){
			return;
		}

		var pdh = function(e){
			var el = e.target;
			var urlproto;

			if(el.matches("a")){
				urlproto = el.protocol;
				if(el.target == "_blank") el.target = "_self"; // @workaround prevent new tabs
			} else { // button or submit
				let url = document.createElement("a");
				url.href = el.form.action;
				urlproto = url.protocol;
				if(el.form.target == "_blank") el.form.target = "_self" // @workaround prevent new tabs
			}

			if(urlproto.match(/^https?\:/i) == null){ // @workaround prevent malfomed urls and about:blank to lead to about:blank
				e.preventDefault();
			}

			e.stopPropagation();
		}

		if ('createEvent' in document) {

			if(this.options.mouseEvents.indexOf(evname) != -1){
				var evt = new MouseEvent(evname, {view: window, bubbles: true, cancelable: true});
				if(evname.toLowerCase() == "click" && el.matches('a, button, input[type="submit"]')){
					el.addEventListener(evname, pdh);
				}
			/*} else if(this.options.keyboardEvents.indexOf(evname) != -1){*/

			} else {
				var evt = document.createEvent('HTMLEvents');
				evt.initEvent(evname, true, false);

			}
			el.dispatchEvent(evt);
		} else {
			evname = 'on' + evname;
			if( evname in el && typeof el[evname] == "function"){
				el[evname]();
			}
		}
		try{
			el.removeEventListener(evname, pdh);
		} catch(e){}
		//this.triggerUserEvent("onEventTriggered", [el, evname])
	};


	Probe.prototype.isEventTriggerable = function(event){

		return ['load','unload','beforeunload'].indexOf(event) == -1;

	};

	Probe.prototype.getEventsForElement = function(element){
		var events = [];
		var map;

		if(this.options.triggerAllMappedEvents){
			map = this.eventsMap;
			for(var a = 0; a < map.length; a++){
				if(map[a].element == element){
					events = map[a].events.slice();
					break;
				}
			}
		}

		map = this.options.eventsMap;
		for(var selector in map){
			if(element.webkitMatchesSelector(selector)){
				events = events.concat(map[selector]);
			}
		}
		//if(events.length >0 ) return ['click']
		return events;
	};





	Probe.prototype.triggerElementEvent = function(element, event){
		var teObj = {el: element, ev: event};
		this.curElement = {};
		if(!event)return
		if(!this.isEventTriggerable(event) || this.objectInArray(this.triggeredEvents, teObj))
			return
		this.curElement.element = element;
		this.curElement.event = event;
		this.triggeredEvents.push(teObj);
		this.trigger(element, event);
	}

	Probe.prototype.getTrigger = function(){
		if(!this.curElement || !this.curElement.element)
			return null;

		return {
			element: this.describeElement(this.curElement.element),
			event: this.curElement.event
		};
	};


	Probe.prototype.describeElements = function(els){
		var ret = [];
		for(el of els){
			ret.push(this.describeElement(el));
		}
		return ret;
	}

	Probe.prototype.describeElement = function(el){
		//return this.stringifyElement(el);
		return this.getElementSelector(el);
	};


	Probe.prototype.stringifyElement = function(el){
		if(!el)
			return "[]";
		var tagName = (el == document ? "DOCUMENT" : (el == window ? "WINDOW" :el.tagName));
		var text = null;
		if(el.textContent){
			text =  el.textContent.trim().replace(/\s/," ").substring(0,10)
			if(text.indexOf(" ") > -1) text = "'" + text + "'";
		}


		var className = (el.className && typeof el.className == 'string') ? (el.className.indexOf(" ") != -1 ? "'" + el.className + "'" : el.className) : "";
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

	Probe.prototype.getElementSelector = function(element){
		if(!element || !(element instanceof HTMLElement))
			return "";
		var name = element.nodeName.toLowerCase();
		var ret = [];
		var selector = ""

		if(element.id){
			selector = "#" + element.id;
		} else {
			let p = element;
			let cnt = 1;
			while(p = p.previousSibling){
				if(p instanceof HTMLElement && p.nodeName.toLowerCase() == name){
					cnt++;
				}
			}
			selector = name + (cnt > 1 ? `:nth-of-type(${cnt})` : "");
			if(element != document.documentElement && name != "body" && element.parentNode){
				ret.push(this.getElementSelector(element.parentNode));
			}
		}
		ret.push(selector);
		return ret.join(" > ");
	}


	Probe.prototype.initializeElement = async function(element){
		var options = this.options;

		if(options.mapEvents){
			var els = element.getElementsByTagName("*");
			for(var a = 0; a < els.length; a++){
				for(var b = 0; b < options.allEvents.length; b++){
					var evname = "on" + options.allEvents[b];
					if(evname in els[a] && els[a][evname]){
						this.addEventToMap(els[a], options.allEvents[b]);
					}
				}
			}
		}


		if(options.fillValues){
			await this.fillInputValues(element);
		}
	}






	Probe.prototype.getFormAsRequest = function(form){

		var formObj = {};
		var inputs = null;
		var par;

		formObj.method = form.getAttribute("method");
		if(!formObj.method){
			formObj.method = "GET";
		} else {
			formObj.method = formObj.method.toUpperCase();
		}

		formObj.url = form.getAttribute("action");
		if(!formObj.url) formObj.url = document.location.href;
		formObj.data = [];
		inputs = form.querySelectorAll("input, select, textarea");
		for(var a = 0; a < inputs.length; a++){
			if(!inputs[a].name) continue;
			par = encodeURIComponent(inputs[a].name) + "=" + encodeURIComponent(inputs[a].value);
			if(inputs[a].tagName == "INPUT" && inputs[a].type != null){

				switch(inputs[a].type.toLowerCase()){
					case "button":
					case "submit":
						break;
					case "checkbox":
					case "radio":
						if(inputs[a].checked)
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

		if(formObj.method == "GET"){
			var url = this.replaceUrlQuery(formObj.url, formObj.data);
			req = new this.Request("form", "GET", url);
		} else {
			var req = new this.Request("form", "POST", formObj.url, formObj.data, this.getTrigger());
		}


		return req;

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




	Probe.prototype.dispatchProbeEvent = async function(name, params){
		return await window.__htcrawl_probe_event__(name, params);
	};



	Probe.prototype.startAnalysis = async function(){
		console.log("page initialized ");
		var _this = this;
		this.started_at = (new Date()).getTime();
		await this.crawlDOM(document, 0);
		console.log("DOM analyzed ");
	};



	Probe.prototype.isContentDuplicated = function(cont){
		return this.domModifications.indexOf(cont) != -1;

		// for(let m of this.domModifications){
		// 	if(this.textComparator.compare(cont, m)){
		// 		return true;
		// 	}
		// }
		// return false;

	}

	Probe.prototype.simhashDistance = function(s1, s2){
		var x = (s1 ^ s2) & ((1 << 64) - 1);
		var ans = 0;
		while(x){
			ans += 1;
			x &= x - 1;
		}
		return ans;
	}





	Probe.prototype.jsonpHook = function(node){
		if(!(node instanceof HTMLElement) || !node.matches("script")) return;
		var src = node.getAttribute("src");
		if(!src) return;
		var _this = this;


		var a = document.createElement("a");
		a.href = src;

		// JSONP must have a querystring...
		if(!a.search) return;

		var req  = new this.Request("jsonp", "GET", src, null, this.getTrigger());
		node.__request = req;

		// __skipped requests.. todo

		this._pendingJsonp.push(node);

		var ev = function(){
			var i = _this._pendingJsonp.indexOf(node);
			if(i == -1){
				// ERROR !!
			} else {
				_this._pendingJsonp.splice(i, 1);
			}

			_this.dispatchProbeEvent("jsonpCompleted", {
				request: req,
				script: _this.describeElement(node)
			});
			node.removeEventListener("load", ev);
			node.removeEventListener("error", ev);
		}

		node.addEventListener("load", ev);
		node.addEventListener("error", ev);

		this.dispatchProbeEvent("jsonp", {
			request: req
		});
	};




	Probe.prototype.triggerWebsocketEvent = function(url){

		var req  = new this.Request("websocket", "GET", url, null, this.getTrigger());
		this.dispatchProbeEvent("websocket", { request: req});

	}

	Probe.prototype.triggerWebsocketMessageEvent = function(url, message){

		var req  = new this.Request("websocket", "GET", url, null, null);
		this.dispatchProbeEvent("websocketMessage", { request: req, message: message});

	}

	Probe.prototype.triggerWebsocketSendEvent = async function(url, message){
		var req  = new this.Request("websocket", "GET", url, null, null);
		return await this.dispatchProbeEvent("websocketSend", { request: req, message: message});

	}


	Probe.prototype.triggerFormSubmitEvent = function(form){

		var req = this.getFormAsRequest(form);
		this.dispatchProbeEvent("formSubmit", {
			request: req,
			form: this.describeElement(form)
		});

	}


	Probe.prototype.triggerNavigationEvent = function(url, method, data){
		var req = null;
		method = method || "GET";

		url = url.split("#")[0];

		req = new this.Request("navigation", method, url, data);

		this.dispatchProbeEvent("navigation", {
			request: req
		});

	};



	// returns true if at least one request is performed
	Probe.prototype.waitRequests = async function(requests){
		var _this = this;
		var reqPerformed = false;
		return new Promise( (resolve, reject) => {
			var timeout = _this.options.ajaxTimeout;

			var t = _this.setInterval(function(){
				if(timeout <= 0 || requests.length == 0){
					clearInterval(t);
					//console.log("waitajax reoslve()")
					resolve(reqPerformed);
					return;
				}
				timeout -= 1;
				reqPerformed = true;
			}, 0);
		});
	}


	Probe.prototype.waitAjax = async function(){
		await this.waitRequests(this._pendingAjax);
		if(this._pendingAjax.length > 0) {
			for(let req of this._pendingAjax){
				await this.dispatchProbeEvent("xhrCompleted", {
					request: req.__request,
					response: null,
					timedout: true
				});
			}
		}
		this._pendingAjax = [];
	}

	Probe.prototype.waitJsonp = async function(){
		await this.waitRequests(this._pendingJsonp);
		if(this._pendingJsonp.length > 0) {
			for(let req of this._pendingJsonp){
				await this.dispatchProbeEvent("jsonpCompleted", {
					request: req.__request,
					response: null,
					timedout: true
				});
			}
		}
		this._pendingJsonp = [];
	}

	Probe.prototype.waitFetch = async function(){
		await this.waitRequests(this._pendingFetch);
		if(this._pendingFetch.length > 0) {
			for(let req of this._pendingFetch){
				await this.dispatchProbeEvent("fetchCompleted", {
					request: req,
					response: null,
					timedout: true
				});
			}
		}
		this._pendingFetch = [];
	}

	Probe.prototype.waitWebsocket = async function(){
		await this.waitRequests(this._pendingWebsocket);
		if(this._pendingWebsocket.length > 0) {
			// @TODO handle request timeout
		}
		this._pendingWebsocket = [];
	}

	Probe.prototype.fetchHook = async function(originalFetch, url, options){
		var _this = this;
		var method = options && 'method' in options ? options.method.toUpperCase() : "GET";
		var data = options && 'body' in options ? options.body : null;
		var trigger = this.getTrigger();
		var extra_headers = {};
		if(options  &&  options.headers && 'entries' in options.headers){
			for(let h of options.headers.entries()){
				extra_headers[h[0]] = h[1];
			}
		}
		var request = new this.Request("fetch", method, url, data, trigger, extra_headers);

		var uRet = await this.dispatchProbeEvent("fetch", {
			request: request
		});
		if(!uRet){
			return new Promise( (resolve, reject) => reject(new Error("rejected"))); // @TODO
		}
		this._pendingFetch.push(request);

		return new Promise( (resolve, reject) => {
			originalFetch(url, options).then( resp => {
				_this.dispatchProbeEvent("fetchCompleted", {
					request: request,
					//response: @ TODO
				});
				resolve(resp);
			}).catch( e => {
				_this.dispatchProbeEvent("fetchCompleted", {
					request: request,
					response: null,
					error: "error" // @TODO
				});
				reject(e);
			}).finally( () => {
				var i = _this._pendingFetch.indexOf(request);
				if(i == -1){
					//ERROR!!!
				} else {
					_this._pendingFetch.splice(i, 1);
				}
			});
		})
	}

	Probe.prototype.xhrOpenHook = function(xhr, method, url){
		var _url = this.removeUrlParameter(url, "_");
		xhr.__request = new window.__PROBE__.Request("xhr", method, _url, null, this.getTrigger());
	}


	Probe.prototype.xhrSendHook = async function(xhr, data){
		var _this = this;
		xhr.__request.data = data;

		var absurl = this.getAbsoluteUrl(xhr.__request.url);
		for(var a = 0; a < options.excludedUrls.length; a++){
			if(absurl.match(options.excludedUrls[a])){
				xhr.__skipped = true;
			}
		}

		// check if request has already been sent
		var rk = xhr.__request.key();
		if(this.sentAjax.indexOf(rk) != -1){
			return;
		}


		// add to pending ajax before dispatchProbeEvent. Since dispatchProbeEvent can await for something (and take some time) we need to be sure that the current xhr is awaited from the main loop
		if(!xhr.__skipped){
			this._pendingAjax.push(xhr);
		}

		var uRet = await this.dispatchProbeEvent("xhr", {
			request: xhr.__request
		});

		if(!uRet){
			this._pendingAjax.splice(this._pendingAjax.indexOf(xhr), 1);
			return false;
		}
		xhr.addEventListener("readystatechange", function ev(e){
			if(xhr.readyState != 4) return;
			var i = _this._pendingAjax.indexOf(xhr);
			if(i == -1){
				//ERROR!!!
			} else {
				_this._pendingAjax.splice(i, 1);
			}
			_this.dispatchProbeEvent("xhrCompleted", {
				request: xhr.__request,
				response: xhr.responseText
			});
			xhr.removeEventListener("readystatechange", ev);
		});

		this.sentAjax.push(rk);

		return true;

	}


	Probe.prototype.websocketHook =  function(ws, url){
		var _this = this;
		this.triggerWebsocketEvent(url);

		var delFromPendings = function(){
			const i = _this._pendingWebsocket.indexOf(ws);
			if(i > -1){
				_this._pendingWebsocket.splice(i, 1);
			}
		}
		ws.__originalSend = ws.send;
		this._pendingWebsocket.push(ws);
		ws.send = async function(message){
			var uRet =  await _this.triggerWebsocketSendEvent(url, message);
			if(!uRet){
				delFromPendings();
				return false;
			}
			return ws.__originalSend(message);
		}
		ws.addEventListener("message", function(message){
			_this.triggerWebsocketMessageEvent(url, message.data);
			delFromPendings();
		});
	}


	Probe.prototype.isAttachedToDOM = function(node){
		var p = node;
		while(p) {
			if(p.nodeName.toLowerCase() == "html")
				return true;
			p = p.parentNode;
		}
		return false;
	};

	Probe.prototype.getDetachedRootNode = function(node){
		var p = node;
		while(p.parentNode) {
			if(p.parentNode.nodeName.toLowerCase() == "html")
				return null;
			p = p.parentNode;
		}
		return p;
	};




	Probe.prototype.crawlDOM = async function(node, layer){

		layer = typeof layer != 'undefined' ? layer : 0;
		if(layer == this.options.maximumRecursion){
			console.log(">>>>RECURSON LIMIT REACHED :" + layer)
			return;
		}
		//console.log(">>>>:" + layer)
		var dom = [node == document ? document.documentElement : node].concat(this.getDOMTreeAsArray(node)),
			newEls = [],
			uRet;
		// map propety events and fill input values
		await this.initializeElement(node);

		//let analyzed = 0;
		for(let el of dom){
			let elsel = this.getElementSelector(el);
			if(!this.isAttachedToDOM(el)){
				console.log("!!00>>> " + this.stringifyElement(el) + " detached before analysis !!! results may be incomplete")
				uRet = await this.dispatchProbeEvent("earlydetach", { node: elsel });
				if(!uRet) continue;
			}
			for(let event of this.getEventsForElement(el)){
				//console.log("analyze element " + this.describeElement(el));
				this.takeDOMSnapshot();
				if(options.triggerEvents){
					uRet = await this.dispatchProbeEvent("triggerevent", {node: elsel, event: event});
					if(!uRet) continue;

					this.triggerElementEvent(el, event);
					// if click has been trigered stop mousedown /up !!!

					await this.dispatchProbeEvent("eventtriggered", {node: elsel, event: event});
				}

				if(this._pendingAjax.length > 0) {
					let chainLimit = this.options.maximumAjaxChain;
					do {
						chainLimit--;
						if(chainLimit == 0){
							break;
						}
						await this.sleep(0);
					} while(await this.waitAjax());
				}

				if(this._pendingFetch.length > 0)
					await this.waitFetch();
				if(this._pendingJsonp.length > 0)
					await this.waitJsonp();
				if(this._pendingWebsocket.length > 0)
					await this.waitWebsocket();

				newEls = this.getAddedElements();
				for(var a = newEls.length - 1; a >= 0; a--){
					if(newEls[a].innerText && this.isContentDuplicated(newEls[a].innerText))
						newEls.splice(a,1);
				}
				if(newEls.length > 0){
					for(var a = 0; a < newEls.length; a++){
						if(newEls[a].innerText){
							this.domModifications.push(newEls[a].innerText);
							//this.domModifications.push(this.textComparator.getValue(newEls[a].innerText));
							console.log(this.textComparator.getValue(newEls[a].innerText))
						}
					}

					//console.log("added elements " + newEls.length)
					for(let ne of newEls){
						uRet = await this.dispatchProbeEvent("newdom", {
							rootNode: this.describeElement(ne),
							trigger: this.getTrigger(),
							layer: layer
						});
						if(uRet)
							await this.crawlDOM(ne, layer + 1);
					}

				}
			}

		}
	}

	Probe.prototype.sleep = function(n){
		var _this = this;
		return new Promise(resolve => {
			_this.setTimeout(resolve, n);
		});
	};



	window.__PROBE__ = new Probe(options, inputValues);
};
