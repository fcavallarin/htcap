/*
HTCAP - www.htcap.org
Author: filippo.cavallarin@wearesegment.com

This program is free software; you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation; either version 2 of the License, or (at your option) any later
version.
*/



/*
	this function is passed to page.evaluate. doing so it is possible to avoid that the Probe object
	is inserted into page window scope (only its instance is referred by window.__PROBE__)
*/
function initProbe(options, inputValues, userCustomScript) {

	/**
	 * Name for the message corresponding of the event to trigger the schedule of the next event in queue
	 * @type {string}
	 */
	var scheduleNextEventMessageName = "schedule-next-event-for-trigger";

	function Probe(options, inputValues, userCustomScript) {
		var _this = this;

		this.options = options;

		this.requestsPrintQueue = [];
		this.sentAjax = [];

		this.curElement = {};
		this.winOpen = [];
		this.resources = [];
		this.eventsMap = [];

		/**
		 * the queue containing all the awaiting events to be triggered
		 * @type {Array}
		 * @private
		 */
		this._toBeTriggeredEventsQueue = [];
		this.isEventWaitingForTriggering = false;
		this.isEventRunningFromTriggering = false;
		// listening for messageEvent to trigger waiting events
		window.addEventListener("message", this._triggerEventFromQueueHandler.bind(this), true);

		this.triggeredEvents = [];
		this.websockets = [];
		this.html = "";
		this.printedRequests = [];
		this.DOMSnapshot = [];
		this.pendingAjax = [];
		this.inputValues = inputValues;

		this.userInterface = {
			id: options.id,
			vars: {},
			log: function(str){
				_this.log(str);
			},
			print: function(str){
				_this.printUserOutput(str)
			},
			fread: function(file){
				return _this.fread(file);
			},
			fwrite: function(file, content, mode){
				return _this.fwrite(file, content, mode);
			},
			render: function(file){
				return _this.render(file);
			},
			triggerEvent: function(element, eventName){
				_this.trigger(element, eventName);
			}
		};
		this.userEvents = {};
		if (userCustomScript) {
			try{
				eval("this.userEvents=" + userCustomScript.trim() + ";");
			} catch(e){}  // @
		}

	}

	Probe.prototype.objectInArray  = function(arr, el, ignoreProperties){
		ignoreProperties = ignoreProperties || [];
		if (arr.length === 0) return false;
		if (typeof arr[0] !== 'object')
			return arr.indexOf(el) > -1;
		for(var a = 0 ;a < arr.length; a++){
			var found = true;
			for(var k in arr[a]){
				if (arr[a][k] !== el[k] && ignoreProperties.indexOf(k) === -1) {
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
			if (obj1[p] !== obj2[p]) return false;

		for(p in obj2)
			if (obj2[p] !== obj1[p]) return false;

		return true;
	};


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
			if (pars[a].split("=")[0] === par)
				pars.splice(a,1);
		}


		return anchor.protocol + "//" + anchor.host + anchor.pathname + (pars.length > 0 ? "?" + pars.join("&") : "") + anchor.hash;
	};


	Probe.prototype.getAbsoluteUrl = function(url){
		var anchor = document.createElement('a');
		anchor.href = url;
		return anchor.href;
	};



	Probe.prototype.isChildOf = function(child, parent){
		var p = child.parentNode;
		var depth = 1;
		while(p){
			if (p === parent) {
				return depth;
			}
			p = p.parentNode;
			depth++;
		}

		return -1;
	};


	// do NOT use MutationObserver to get added elements .. it is asynchronous and the callback is fired only when DOM is refreshed (graphically)
	Probe.prototype.takeDOMSnapshot = function(){
		this.DOMSnapshot = Array.prototype.slice.call( document.getElementsByTagName("*"), 0 );
	};


	Probe.prototype.getAddedElements = function(){
		var a,
			elements = [],
			rootElements = [];

		var newDom = Array.prototype.slice.call( document.getElementsByTagName("*"), 0 );

		console.log('get added elements start dom len: ' + this.DOMSnapshot.length + ' new dom len: ' + newDom.length);
		// get all added elements
		for (a = 0; a < newDom.length; a++) {
			if (this.DOMSnapshot.indexOf(newDom[a]) === -1) {
				// set __new flag on added elements to avoid checking for elements.indexOf
				// that is very very slow
				newDom[a].__new = true;
				elements.push(newDom[a]);
			}
		}

		console.log("elements get... (tot " + elements.length + ") searching for root nodes");

		for (a = 0; a < elements.length; a++) {
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
			if (root && rootElements.indexOf(root) === -1) {
				rootElements.push(root);
			}
		}

		for (a = 0; a < elements.length; a++) {
			delete elements[a].__new;
		}

		if(rootElements.length > 0){
			this.triggerUserEvent("onDomModified", [rootElements, elements]);
		}

		console.log("root elements found: " + rootElements.length);
		return rootElements;
	};




	/* DO NOT include node as first element.. this is a requirement */
	Probe.prototype.getDOMTreeAsArray = function (node) {
		var out = [];
		var children = node.querySelectorAll(":scope > *");

		if (children.length === 0) {
			return out;
		}

		for(var a = 0; a < children.length; a++){
			//if(children[a].style.display != 'none')
				out.push(children[a]);

			out = out.concat(this.getDOMTreeAsArray(children[a]));
		}

		return out;
	};




	// class Request

	Probe.prototype.Request = function(type, method, url, data, trigger){
		this.type = type;
		this.method = method;
		this.url = url;
		this.data = data || null;
		this.trigger = trigger || null;

		//this.username = null; // todo
		//this.password = null;
	};

	// returns a unique string representation of the request. used for comparision
	Probe.prototype.Request.prototype.key = function(){
		return [this.type, this.method, this.url, this.data, this.trigger].join('');
	};


	Probe.prototype.requestToJson = function(req){
		var obj ={
			type: req.type,
			method: req.method,
			url: req.url,
			data: req.data || null
		};

		if(req.trigger) obj.trigger = {element: this.describeElement(req.trigger.element), event:req.trigger.event};

		return JSON.stringify(obj);
	};



	// END OF class Request..

	Probe.prototype.print = function(str){
		window.__callPhantom({cmd:'print', argument: str});
	};

	Probe.prototype.log = function(str){
		window.__callPhantom({cmd:'log', argument: str});
	};

	Probe.prototype.render = function(file){
		return window.__callPhantom({cmd:'render', argument: file});
	};

	Probe.prototype.fread = function(file){
		return window.__callPhantom({cmd:'fread', file: file});
	};

	Probe.prototype.fwrite = function(file, content, mode){
		return window.__callPhantom({cmd:'fwrite', file: file, content:content, mode:mode || 'w'});
	};

	Probe.prototype.printRequest = function(req){
		var k = req.key();
		if (this.printedRequests.indexOf(k) === -1) {
			//var trigger = this.describeElement(this.curElement.element) + "." + this.curElement.event + "()";
			var json = '["request",' + this.requestToJson(req) + "],";
			this.print(json);
			this.printedRequests.push(k);
		}
	};

	Probe.prototype.printRequestQueue = function(){

		for(var a = 0; a < this.requestsPrintQueue.length; a++){
			this.printRequest(this.requestsPrintQueue[a]);
		}
		this.requestsPrintQueue = [];
	};

	Probe.prototype.printJSONP = function(node){
		if (node.nodeName.toLowerCase() !== "script") return;
		var src = node.getAttribute("src");
		if(!src) return;

		var a = document.createElement("a");
		a.href = src;

		// JSONP must have a querystring...
		if(a.search){
			////this.script_tagsInserted.push(obj);
			var req  = new this.Request("jsonp", "GET", src, null, this.getTrigger());
			this.printRequest(req);
		}
	};

	Probe.prototype.printLink = function(url){
		var req = null;

		url = url.split("#")[0];

		if(url.match(/^[a-z0-9\-_]+\:/i) && !url.match(/(^https?)|(^ftps?)\:/i)){
			if(this.options.printUnknownRequests){
				req = new this.Request("unknown", "GET", url);
			}
		} else {
			req = new this.Request("link", "GET", url);
		}

		if(req)
			this.printRequest(req);
	};

	Probe.prototype.printWebsocket = function(url){
		var trigger = this.getTrigger();
		var req  = new this.Request("websocket", "GET", url, null, trigger);
		this.printRequest(req);
	};


	Probe.prototype.printPageHTML = function(){
		var html = document.documentElement.innerHTML;
		var json = '["html",' + JSON.stringify(html) + '],';
		this.print(json);
	};


	Probe.prototype.printUserOutput = function(str){
		var json = '["user",' + JSON.stringify(str) + '],';
		this.print(json);
	};


	Probe.prototype.addRequestToPrintQueue = function(req){
		this.requestsPrintQueue.push(req);
	};


	Probe.prototype.isAjaxCompleted = function (xhrList) {
		var alldone = true;
		for (var a = 0; a < xhrList.length; a++) {
			//console.log("-->"+xhrList[a].readyState + " "+ xhrList[a].__request.url)
			if (xhrList[a].readyState !== 4 && !xhrList[a].__skipped) alldone = false;
		}
		//if(alldone)
		//	console.log("-----------------> alla ajax completed")
		return alldone;
	};

	Probe.prototype.waitAjax = function(callback, chainLimit){
		var xhrList = this.pendingAjax.slice(),	// get a copy of the pending XHRs
			timeout = this.options.ajaxTimeout,
			chainSizeLimit = chainLimit || this.options.maximumAjaxChain;

		this.pendingAjax = []; // clean-up the list

		console.log("Waiting for ajaxs: " + chainSizeLimit);

		var t = window.__originalSetInterval(function(){
			if ((timeout <= 0) || this.isAjaxCompleted(xhrList)) {
				clearInterval(t);
				window.__originalSetTimeout(function () {
					if (chainSizeLimit > 0 && this.pendingAjax.length > 0) {
						this.waitAjax(callback, chainSizeLimit - 1);
					} else {
						callback(xhrList.length > 0);
					}
				}.bind(this), 100);
				return;
			}
			timeout -= 10;
		}.bind(this), 0);

		console.log("Wait ajax return, " + chainSizeLimit);

		return xhrList.length > 0;
	};




	// returns true if the value has been set
	Probe.prototype.setVal = function(el){
		var options = this.options;
		var _this = this;

		var ueRet = this.triggerUserEvent("onFillInput", [el]);
		if(ueRet === false) return;

		var setv = function(name){
			var ret = _this.getRandomValue('string');
			for(var a = 0; a < options.inputNameMatchValue.length; a++){
				var regexp = new RegExp(options.inputNameMatchValue[a].name, "gi");
				if(name.match(regexp)){
					ret = _this.getRandomValue(options.inputNameMatchValue[a].value);
				}
			}
			return ret;
		};

		// needed for example by angularjs
		var triggerChange =  function(){
			// update angular model
			_this.trigger(el, 'input');

			// _this.trigger(el, 'blur');
			// _this.trigger(el, 'keyup');
			// _this.trigger(el, 'keydown');
		};

		if (el.nodeName.toLowerCase() === 'textarea') {
			el.value = setv(el.name);
			triggerChange();
			return true;
		}

		if (el.nodeName.toLowerCase() === 'select') {
			var opts = el.getElementsByTagName('option');
			if(opts.length > 1){ // avoid to set the first (already selected) options
				// @TODO .. qui seleziono l'ultimo val.. ma devo controllare che non fosse "selected"
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
					el.value = parseInt(this.getRandomValue('number'));
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
				el.value = this.getRandomValue(type);
				break;
			case 'datetime-local':
				el.value = this.getRandomValue('datetimeLocal');
				break;


			default:
				return false;
		}

		triggerChange();
		return true;
	};


	Probe.prototype.getRandomValue = function(type){

		if(!(type in this.inputValues))
			type = "string";

		return this.inputValues[type];

	};



	Probe.prototype.fillInputValues = function(element){
		element = element || document;
		var ret = false;
		var els = element.querySelectorAll("input, select, textarea");

		for(var a = 0; a < els.length; a++){
			if(this.setVal(els[a]))
				ret = true;
		}
		return ret;
	};


	Probe.prototype.trigger = function (element, eventName) {
		/* 	workaround for a phantomjs bug on linux (so maybe not a phantom bug but some linux libs??).
		 if you trigger click on input type=color everything freezes... maybe due to some
			color picker that pops up ...
		*/
		if (element.tagName === "INPUT" && element.type.toLowerCase() === 'color' && eventName === 'click') {
			return;
		}
		// trigger the given event only when there is some space in the event stack to avoid collision
		// and give time to things to resolve properly (since we trigger user driven event,
		// it is important to give time to the analysed page to breath between calls)
		this._triggerEventWhenReady(element, eventName);
	};

	/**
	 * Place the given event in a queue and trigger it when the event loop is empty/ready
	 * more info on {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/EventLoop MDN}
	 * @private
	 * @param {Element} element - element on which the event have to be triggered
	 * @param {String} eventName - name of the event to trigger
	 */
	Probe.prototype._triggerEventWhenReady = function (element, eventName) {

		this._toBeTriggeredEventsQueue.push([element, eventName]);
		this.isEventWaitingForTriggering = true;

		window.postMessage(scheduleNextEventMessageName, "*");

	};

	/**
	 * Trigger the first event in the `_toBeTriggeredEventsQueue`
	 * @private
	 */
	Probe.prototype._triggerEventFromQueue = function () {

		if (this._toBeTriggeredEventsQueue.length > 0) {

			// retrieving the next element/event pair
			var event = this._toBeTriggeredEventsQueue.shift();

			var ueRet = this.triggerUserEvent("onTriggerEvent", event);


			if (ueRet !== false) {
				var element = event[0], eventName = event[1];

				// setting the current element
				this.curElement = {element: element, event: eventName};

				// Triggering the event
				if ('createEvent' in document) {
					var evt = document.createEvent('HTMLEvents');
					evt.initEvent(eventName, true, false);
					element.dispatchEvent(evt);
				} else {
					eventName = 'on' + eventName;
					if (eventName in element && typeof element[eventName] === "function") {
						element[eventName]();
					}
				}

				this.triggerUserEvent("onEventTriggered", event);
			}

			// pushing the next event to the next event loop
			window.__originalSetTimeout(function () {
				this.isEventRunningFromTriggering = false;

				// cleaning the current element
				this.curElement = {};

				// requesting the next event
				window.postMessage(scheduleNextEventMessageName, "*");
				}.bind(this)
			);

		} else {
			// nothing left to do, turning flags off
			this.isEventWaitingForTriggering = false;
			this.isEventRunningFromTriggering = false;
		}
	};
	/**
	 * callback for the eventMessage listener
	 * @param message - the eventMessage triggered
	 * @private
	 */
	Probe.prototype._triggerEventFromQueueHandler = function (message) {
		// if it's our message
		if (message.source === window && message.data === scheduleNextEventMessageName) {
			message.stopPropagation();
			// if there's not currently running events (avoiding multiple simultaneous call)
			if (!this.isEventRunningFromTriggering) {
				this.isEventRunningFromTriggering = true;
				this._triggerEventFromQueue();
			}
		}
	};


	Probe.prototype.isEventTriggerable = function(event){

		return ['load', 'unload', 'beforeunload'].indexOf(event) === -1;

	};

	Probe.prototype.getEventsForElement = function(element){
		var events = [];
		var map;

		if(this.options.triggerAllMappedEvents){
			map = this.eventsMap;
			for(var a = 0; a < map.length; a++){
				if (map[a].element === element) {
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

		return events;
	};



	Probe.prototype.triggerElementEvents = function(element){
		//console.log("triggering events for " + this.describeElement(element));
		var events = this.getEventsForElement(element);
		for(var a = 0; a < events.length; a++){

			var teObj = {e:element, ev: events[a]};
			if(!this.isEventTriggerable(event) || this.objectInArray(this.triggeredEvents, teObj))
				continue;

			this.triggeredEvents.push(teObj);
			this.trigger(teObj.e, teObj.ev);

		}
	};



	Probe.prototype.getTrigger = function(){
		if(!this.curElement || !this.curElement.element)
			return null;

		return {element: this.curElement.element, event: this.curElement.event};
	};









	Probe.prototype.describeElement = function(el){
		if(!el)
			return "[]";
		var tagName = (el === document ? "DOCUMENT" : (el === window ? "WINDOW" : el.tagName));
		var text = null;
		if(el.textContent){
			text = el.textContent.trim().replace(/\s/, " ").substring(0, 10);
			if(text.indexOf(" ") > -1) text = "'" + text + "'";
		}

		var className = el.className ? (el.className.indexOf(" ") !== -1 ? "'" + el.className + "'" : el.className) : "";

		return "[" +
			(tagName ? tagName + " " : "") +
			(el.name && typeof el.name === 'string' ? el.name + " " : "") +
			(className ? "." + className + " " : "") +
			(el.id ? "#" + el.id + " " : "") +
			(el.src ? "src=" + el.src + " " : "") +
			(el.action ? "action=" + el.action + " " : "") +
			(el.method ? "method=" + el.method + " " : "") +
			(el.value ? "v=" + el.value + " " : "") +
			(text ? "txt=" + text : "") +
			"]";

	};



	Probe.prototype.initializeElement = function(element){
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
			this.fillInputValues(element);
		}
	};



	Probe.prototype.getUrls = function(element){
		var a;
		var links = element.getElementsByTagName("a");
		var forms = element.getElementsByTagName("form");

		if (element.tagName === "A") {
			links = Array.prototype.slice.call(links, 0).concat(element);
		}

		if (element.tagName === "FORM") {
			forms = Array.prototype.slice.call(forms, 0).concat(element);
		}

		for(a = 0; a < links.length; a++){
			var url = links[a].href;
			if(url){
				this.printLink(url);
			}
		}

		for(a = 0; a < forms.length; a++){
			var req = this.getFormAsRequest(forms[a]);
			this.printRequest(req);
		}
	};



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
			if (inputs[a].tagName === "INPUT" && inputs[a].type !== null) {

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

		if (formObj.method === "GET") {
			var url = this.replaceUrlQuery(formObj.url, formObj.data);
			req = new this.Request("form", "GET", url);
		} else {
			var req = new this.Request("form", "POST", formObj.url, formObj.data);
		}


		return req;

	};



	Probe.prototype.addEventToMap = function(element, event){

		for(var a = 0; a < this.eventsMap.length; a++){
			if (this.eventsMap[a].element === element) {
				this.eventsMap[a].events.push(event);
				return;
			}
		}
		this.eventsMap.push({
			element: element,
			events: [event]
		});
	};


	Probe.prototype.addUserEvent = function(name, fnc){
		if (!(name in this.userEvents) || typeof fnc !== 'function') {
			return false;
		}
		this.userEvents[name].push(fnc);
		return true;
	};



	Probe.prototype.triggerUserEvent = function(name, params){
		params = params || [];
		if (!(name in this.userEvents) || typeof this.userEvents[name] !== 'function') {
			return true;
		}
		params.splice(0, 0, this.userInterface);
		var ret = this.userEvents[name].apply(this.userInterface, params);
		return !(ret === false) 
	};


	Probe.prototype.startAnalysis = function(){

		console.log("page initialized ");
		this._analyzeDOM(document, 0, function () {
			window.__callPhantom({cmd: 'end'})
		});

	};


	/**
	 * analyze the given node DOM
	 * @param {Node} node - the node to analyze
	 * @param {number} counter - counter representing the level of recursion
	 * @param {function=} callback - callback called when finish
	 * @private
	 */
	Probe.prototype._analyzeDOM = function (node, counter, callback) {

		var elements = [node === document ? document.documentElement : node].concat(this.getDOMTreeAsArray(node));

		var isAjaxCompleted = false,
			isAjaxTriggered = true,
			hasXHRs = false,
			isRecursionReturned = false,
			isWaitingRecursion = false;

		var modifiedElementList = [];

		// if no element in the given node
		if (elements.length === 0) {
			if (typeof callback === 'function') callback();
			return;
		}


		//console.log(counter + " layer: "+counter+" initializing " + this.describeElement(node))
		// map property events and fill input values
		this.initializeElement(node);

		if(options.searchUrls){
			this.getUrls(node);
		}


		// starting analyse loop
		var to = window.__originalSetInterval(function () {
			//console.log(counter+" isWaitingRecursion: "+isWaitingRecursion+" isAjaxCompleted: "+isAjaxCompleted+ " isRecursionReturned:"+isRecursionReturned)
			console.log(counter + "#  elements.length: " + elements.length + "\trecursion: " + isWaitingRecursion + "\treturned: " + isRecursionReturned + "\tajax: " + this.pendingAjax.length + "\tcompleted: " + isAjaxCompleted + "\ttriggered: " + isAjaxTriggered + "\tevents: " + (this.isEventWaitingForTriggering) + " " + ( this.isEventRunningFromTriggering));


			// if any event are waiting or running, do nothing
			if (this.isEventWaitingForTriggering || this.isEventRunningFromTriggering || isWaitingRecursion) return;


			// if there is still works to be done and nothing is waiting
			// if(lastIndex < index && !waitingRecursion){
			if (elements.length > 0) {
				// console.log(counter + " analysing " + this.describeElement(elements[index]))

				// TODO: here the element may have been detached, moved, etc ; try to find a logic to handle this.

				this.takeDOMSnapshot();

				if (this.options.triggerEvents) {
					this.triggerElementEvents(elements.shift());
				}

			}


			// treating pending XHR request
			if (this.pendingAjax.length > 0) {
				hasXHRs = this.waitAjax(function () {
					isAjaxCompleted = true;
					isAjaxTriggered = true;
				});
			} else {
				hasXHRs = false;
				isAjaxCompleted = true;
				isAjaxTriggered = false;
			}

			// treating completed ajax
			if (isAjaxCompleted) {
				isAjaxCompleted = false;

				this.printRequestQueue();
				if (isAjaxTriggered) {
					this.triggerUserEvent("onAllXhrsCompleted");
				}

				if (counter < this.options.maximumRecursion) {
					// getAddedElement is slow and can take time if the DOM is big (~25000 nodes)
					// so use it only if ajax
					modifiedElementList = isAjaxTriggered ? this.getAddedElements() : [];

					// if ajax has been triggered and some elements are modified then recurse through the modified elements
					isWaitingRecursion = (modifiedElementList.length > 0 && hasXHRs);

				} else {
					console.log(">>>>RECURSION LIMIT REACHED :" + counter);
				}
			}

			if (isWaitingRecursion) {

				if (modifiedElementList.length > 0) {
					this._analyzeDOM(modifiedElementList.shift(), counter + 1, function () {
						isRecursionReturned = true;
					});
				}

				if (!isRecursionReturned) return;

				isRecursionReturned = false;

				if (modifiedElementList.length <= 0) {
					isWaitingRecursion = false;
				} else {
					return;
				}

			}

			console.log(counter + "## elements.length: " + elements.length + "\trecursion: " + isWaitingRecursion + "\treturned: " + isRecursionReturned + "\tajax: " + this.pendingAjax.length + "\tcompleted: " + isAjaxCompleted + "\ttriggered: " + isAjaxTriggered + "\tevents: " + (this.isEventWaitingForTriggering) + " " + ( this.isEventRunningFromTriggering));

			if (elements.length === 0) {
				console.log("call END");

					// setting the "finish" step to the next event loop to leave some time to the last process/event to finish
				window.__originalSetTimeout(function () {
						clearInterval(to);
					console.log("-------END");
						if (typeof callback === 'function') callback();
				});
			}

		}.bind(this), 0);
	};


	window.__PROBE__ = new Probe(options, inputValues, userCustomScript);
}
