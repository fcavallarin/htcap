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
	var scheduleNextEventMessageName = "htcap-schedule-next-event-for-trigger";

	/**
	 *
	 * @param options
	 * @param inputValues
	 * @param userCustomScript
	 * @constructor
	 */
	function Probe(options, inputValues, userCustomScript) {
		var currentProbe = this;

		this._options = options;

		this._requestsPrintQueue = [];
		this.sentAjax = [];

		this._currentPageEvent = undefined;
		this._eventsMap = [];

		/**
		 * the queue containing all the awaiting events to be triggered
		 * @type {Array}
		 * @private
		 */
		this._toBeTriggeredEventsQueue = [];
		this.isEventWaitingForTriggering = false;
		this.isEventRunningFromTriggering = false;

		this.triggeredEvents = [];
		this.websockets = [];
		this.html = "";
		this.DOMSnapshot = [];
		this.pendingAjax = [];
		this.inputValues = inputValues;

		this.userInterface = {
			id: options.id,
			vars: {},
			log: function(str){
				_log(str);
			},
			print: function(str){
				_printUserOutput(str)
			},
			fread: function(file){
				return _fread(file);
			},
			fwrite: function(file, content, mode){
				return _fwrite(file, content, mode);
			},
			render: function(file){
				return _render(file);
			},
			triggerEvent: function(element, eventName){
				currentProbe._trigger(new currentProbe.PageEvent(element, eventName));
			}
		};
		this.userEvents = {};
		if (userCustomScript) {
			try{
				eval("this.userEvents=" + userCustomScript.trim() + ";");
			} catch(e){}  // @
		}

	}

	/**
	 * Class Request
	 *
	 * @param {String}  type
	 * @param {String} method
	 * @param {String} url
	 * @param {Object=} data
	 * @param {PageEvent=} triggerer - the PageEvent triggered to generate the request
	 * @constructor
	 */
	Probe.prototype.Request = function (type, method, url, data, triggerer) {
		this.type = type;
		this.method = method;
		this.url = url;
		this.data = data || null;
		this.triggerer = triggerer;
		this.isPrinted = false;

		//this.username = null; // todo
		//this.password = null;
	};

	Object.defineProperties(Probe.prototype.Request.prototype, {
		/**
		 *  returns a unique string representation of the request. used for comparision.
		 */
		key: {
			get: function () {
				return JSON.stringify(this);
			}
		}
	});

	Probe.prototype.Request.prototype.toJSON = function () {
		var obj ={
			type: this.type,
			method: this.method,
			url: this.url,
			data: this.data || null
		};

		if (this.triggerer) {
			obj.trigger = {element: _elementToString(this.triggerer.element), event: this.triggerer.eventName};
		}

		return obj;
	};

	Probe.prototype.Request.prototype.print = function () {
		if (!this.isPrinted) {
			_print('["request",' + JSON.stringify(this) + "],");
			this.isPrinted = true;
		}
	};

	// END OF class Request..

	/**
	 * Class PageEvent
	 * Element's event found in the page
	 *
	 * @param {Element} element
	 * @param {String} eventName
	 * @constructor
	 */
	Probe.prototype.PageEvent = function (element, eventName) {
		this.element = element;
		this.eventName = eventName;
	};

	/**
	 * Trigger the page event
	 */
	Probe.prototype.PageEvent.prototype.trigger = function () {

		if ('createEvent' in document) {
			var evt = document.createEvent('HTMLEvents');
			evt.initEvent(this.eventName, true, false);
			this.element.dispatchEvent(evt);
		} else {
			var eventName = 'on' + this.eventName;
			if (eventName in this.element && typeof this.element[eventName] === "function") {
				this.element[eventName]();
			}
		}
	};


	Probe.prototype.printRequestQueue = function(){
		for (var a = 0; a < this._requestsPrintQueue.length; a++) {
			this._requestsPrintQueue[a].print();
		}
		this._requestsPrintQueue = [];
	};

	Probe.prototype.addRequestToPrintQueue = function (req) {
		this._requestsPrintQueue.push(req);
	};

	Probe.prototype.printJSONP = function(node){

		if (node.nodeName.toLowerCase() === "script" && node.hasAttribute("src")) {
			var a = document.createElement("a"),
				src = node.getAttribute("src");

			a.href = src;

			// JSONP must have a querystring...
			if (a.search) {
				var req = new this.Request("jsonp", "GET", src, null, this.getLastTriggerPageEvent());
				req.print();
			}
		}
	};

	Probe.prototype.printLink = function(url){
		var req;

		url = url.split("#")[0];

		if(url.match(/^[a-z0-9\-_]+\:/i) && !url.match(/(^https?)|(^ftps?)\:/i)){
			if (this._options.printUnknownRequests) {
				req = new this.Request("unknown", "GET", url, undefined, this.getLastTriggerPageEvent());
			}
		} else {
			req = new this.Request("link", "GET", url, undefined, this.getLastTriggerPageEvent());
		}

		if (req) {
			req.print();
		}
	};

	Probe.prototype.printWebsocket = function(url){
		var req = new this.Request("websocket", "GET", url, null, this.getLastTriggerPageEvent());
		req.print();
	};

	Probe.prototype.printPageHTML = function(){
		var html = document.documentElement.innerHTML;
		var json = '["html",' + JSON.stringify(html) + '],';
		_print(json);
	};


	Probe.prototype.waitAjax = function(callback, chainLimit){
		var xhrList = this.pendingAjax.slice(),	// get a copy of the pending XHRs
			timeout = this._options.ajaxTimeout,
			chainSizeLimit = chainLimit || this._options.maximumAjaxChain;

		this.pendingAjax = []; // clean-up the list

		console.log("Waiting for ajaxs: " + chainSizeLimit);

		var t = window.__originalSetInterval(function(){
			if ((timeout <= 0) || _isXHRsInListCompleted(xhrList)) {
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


	Probe.prototype.getRandomValue = function (type) {

		if (!(type in this.inputValues))
			type = "string";

		return this.inputValues[type];

	};

	/**
	 * return the last element/event name pair triggered
	 * @returns {PageEvent}
	 */
	Probe.prototype.getLastTriggerPageEvent = function () {
		return this._currentPageEvent;
	};

	/**
	 * get request from the given FORM element
	 * @param {Element} form
	 * @returns {Probe.Request}
	 */
	Probe.prototype.getFormAsRequest = function (form) {
		var par, req,
			formObj = {};

		formObj.method = form.getAttribute("method");
		if (!formObj.method) {
			formObj.method = "GET";
		} else {
			formObj.method = formObj.method.toUpperCase();
		}

		formObj.url = form.getAttribute("action");
		if (!formObj.url) {
			formObj.url = document.location.href;
		}
		formObj.data = [];
		var inputs = form.querySelectorAll("input, select, textarea");
		for (var a = 0; a < inputs.length; a++) {
			if (!inputs[a].name) continue;
			par = encodeURIComponent(inputs[a].name) + "=" + encodeURIComponent(inputs[a].value);
			if (inputs[a].tagName === "INPUT" && inputs[a].type !== null) {

				switch (inputs[a].type.toLowerCase()) {
					case "button":
					case "submit":
						break;
					case "checkbox":
					case "radio":
						if (inputs[a].checked)
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
			var url = _replaceUrlQuery(formObj.url, formObj.data);
			req = new this.Request("form", "GET", url);
		} else {
			req = new this.Request("form", "POST", formObj.url, formObj.data);
		}

		return req;
	};


	/**
	 * add the given element/event pair to map
	 * @param {Element} element
	 * @param {String} eventName
	 */
	Probe.prototype.addEventToMap = function (element, eventName) {

		for (var a = 0; a < this._eventsMap.length; a++) {
			if (this._eventsMap[a].element === element) {
				this._eventsMap[a].events.push(eventName);
				return;
			}
		}

		this._eventsMap.push({
			element: element,
			events: [eventName]
		});
	};

	Probe.prototype.triggerUserEvent = function (name, params) {
		params = params || [];
		if (!(name in this.userEvents) || typeof this.userEvents[name] !== 'function') {
			return true;
		}
		params.splice(0, 0, this.userInterface);
		var ret = this.userEvents[name].apply(this.userInterface, params);
		return !(ret === false)
	};

	/**
	 * Start the analysis of the current Document
	 */
	Probe.prototype.startAnalysis = function () {
		console.log("page initialized ");
		// listening for messageEvent to trigger waiting events
		window.__originalAddEventListener("message", this._triggerEventFromQueueHandler.bind(this), true);

		this._analyzeDOM(document, 0, function () {
			window.__callPhantom({cmd: 'end'})
		});
	};


	Probe.prototype.removeUrlParameter = function (url, par) {
		var anchor = document.createElement("a");
		anchor.href = url;

		var pars = anchor.search.substr(1).split(/(?:&amp;|&)+/);

		for (var a = pars.length - 1; a >= 0; a--) {
			if (pars[a].split("=")[0] === par)
				pars.splice(a, 1);
		}

		return anchor.protocol + "//" + anchor.host + anchor.pathname + (pars.length > 0 ? "?" + pars.join("&") : "") + anchor.hash;
	};

	Probe.prototype.getAbsoluteUrl = function (url) {
		var anchor = document.createElement('a');
		anchor.href = url;
		return anchor.href;
	};


	/**
	 * returns true if the value has been set
	 * @param el
	 * @returns {boolean}
	 * @private
	 */
	Probe.prototype._setVal = function (el) {
		var options = this._options;
		var _this = this;

		var ueRet = this.triggerUserEvent("onFillInput", [el]);
		if(ueRet === false) return;

		var setv = function(name){
			var ret = _this.getRandomValue('string');
			options.inputNameMatchValue.forEach(function (matchValue) {
				var regexp = new RegExp(matchValue.name, "gi");
				if (name.match(regexp)) {
					ret = _this.getRandomValue(matchValue.value);
				}
			});
			return ret;
		};

		// needed for example by angularjs
		var triggerChange =  function(){
			// update angular model
			_this._trigger(new _this.PageEvent(el, 'input'));

			// _this._trigger(new _this.PageEvent(el, 'blur'));
			// _this._trigger(new _this.PageEvent(el, 'keyup'));
			// _this._trigger(new _this.PageEvent(el, 'keydown'));
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

	/**
	 * @param element
	 * @returns {boolean}
	 * @private
	 */
	Probe.prototype._fillInputValues = function (element) {
		element = element || document;
		var ret = false;
		var els = element.querySelectorAll("input, select, textarea");

		for(var a = 0; a < els.length; a++){
			if (this._setVal(els[a]))
				ret = true;
		}
		return ret;
	};

	/**
	 * add the trigger of the given event on the given element to the trigger queue to be triggered
	 *
	 * it place the given event in a queue and trigger it when the event loop is empty/ready
	 * trigger the given event only when there is some space in the event stack to avoid collision
	 * and give time to things to resolve properly (since we trigger user driven event,
	 * it is important to give time to the analysed page to breath between calls)
	 *
	 * more info on {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/EventLoop MDN}
	 *
	 * @param {Probe.PageEvent} pageEvent which have to be triggered
	 * @private
	 */
	Probe.prototype._trigger = function (pageEvent) {
		// workaround for a phantomjs bug on linux (so maybe not a phantom bug but some linux libs??).
		// if you trigger click on input type=color everything freezes... maybe due to some
		// color picker that pops up ...
		if (!(pageEvent.element.tagName === "INPUT" && pageEvent.element.type.toLowerCase() === 'color' && pageEvent.eventName === 'click')) {

			// trigger the given event only when there is some space in the event stack to avoid collision
			// and give time to things to resolve properly (since we trigger user driven event,
			// it is important to give time to the analysed page to breath between calls)
			this._toBeTriggeredEventsQueue.push(pageEvent);
			this.isEventWaitingForTriggering = true;

			window.postMessage(scheduleNextEventMessageName, "*");
		}
	};

	/**
	 * Trigger the first event in the `_toBeTriggeredEventsQueue`
	 * @private
	 */
	Probe.prototype._triggerEventFromQueue = function () {

		if (this._toBeTriggeredEventsQueue.length > 0) {

			// retrieving the next pageEvent
			var pageEvent = this._toBeTriggeredEventsQueue.shift();

			var ueRet = this.triggerUserEvent("onTriggerEvent", [pageEvent.element, pageEvent.eventName]);


			if (ueRet !== false) {

				// setting the current element
				this._currentPageEvent = pageEvent;

				// Triggering the event
				pageEvent.trigger();

				this.triggerUserEvent("onEventTriggered", [pageEvent.element, pageEvent.eventName]);
			}

			// pushing the next event to the next event loop
			window.__originalSetTimeout(function () {
				this.isEventRunningFromTriggering = false;

				// cleaning the current element
				this._currentPageEvent = undefined;

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


	/**
	 * @param  {Element} element
	 * @returns {Array}
	 * @private
	 */
	Probe.prototype._getEventsForElement = function (element) {
		var events = [];
		var map;

		if (this._options.triggerAllMappedEvents) {
			map = this._eventsMap;
			for(var a = 0; a < map.length; a++){
				if (map[a].element === element) {
					events = map[a].events.slice();
					break;
				}
			}
		}

		map = this._options.eventsMap;
		for(var selector in map){
			if(element.webkitMatchesSelector(selector)){
				events = events.concat(map[selector]);
			}
		}

		return events;
	};


	/**
	 * Trigger all event for a given element
	 * @param {Element} element
	 * @private
	 */
	Probe.prototype._triggerElementEvents = function (element) {
		var events = this._getEventsForElement(element);

		events.forEach(function (eventName) {
			var pageEvent = new this.PageEvent(element, eventName);

			// console.log("triggering events for : " + _elementToString(element) + " " + eventName);

			if (_isEventTriggerable(eventName) && !_objectInArray(this.triggeredEvents, pageEvent)) {
				this.triggeredEvents.push(pageEvent);
				this._trigger(pageEvent);
			}
		}.bind(this));
	};

	/**
	 * @param {Element} node
	 * @private
	 */
	Probe.prototype._initializeElement = function (node) {
		var options = this._options;

		if(options.mapEvents){
			var elements = node.getElementsByTagName("*");
			for (var a = 0; a < elements.length; a++) {
				var element = elements[a];
				for(var b = 0; b < options.allEvents.length; b++){
					var eventName = options.allEvents[b],
						onEventName = "on" + eventName;

					if (onEventName in element && element[onEventName]) {
						this.addEventToMap(element, eventName);
					}
				}
			}
		}

		if(options.fillValues){
			this._fillInputValues(node);
		}
	};

	/**
	 * print out url found in the given element
	 * @param {Element} element
	 * @private
	 */
	Probe.prototype._printUrlsFromElement = function (element) {
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
			req.print();
		}
	};


	/**
	 * analyze the given node DOM
	 * @param {Node} node - the node to analyze
	 * @param {number} counter - counter representing the level of recursion
	 * @param {function=} callback - callback called when finish
	 * @private
	 */
	Probe.prototype._analyzeDOM = function (node, counter, callback) {

		var elements = [node === document ? document.documentElement : node].concat(_getDOMTreeAsArray(node));

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


		//console.log(counter + " layer: "+counter+" initializing " + _elementToString(node))
		// map property events and fill input values
		this._initializeElement(node);

		if(options.searchUrls){
			this._printUrlsFromElement(node);
		}

		// starting analyse loop
		var to = window.__originalSetInterval(function () {
			//console.log(counter+" isWaitingRecursion: "+isWaitingRecursion+" isAjaxCompleted: "+isAjaxCompleted+ " isRecursionReturned:"+isRecursionReturned)
			// console.log(counter + "#  elements.length: " + elements.length + "\trecursion: " + isWaitingRecursion + "\treturned: " + isRecursionReturned + "\tajax: " + this.pendingAjax.length + "\tcompleted: " + isAjaxCompleted + "\ttriggered: " + isAjaxTriggered + "\tevents: " + (this.isEventWaitingForTriggering) + " " + ( this.isEventRunningFromTriggering));

			if (elements.length > 0 && !isWaitingRecursion && !this.isEventWaitingForTriggering) {
				// console.log(counter + " analysing " + this.describeElement(elements[index]))

				// TODO: here the element may have been detached, moved, etc ; try to find a logic to handle this.

				this.DOMSnapshot = _getDOMSnapshot();

				if (this._options.triggerEvents) {
					this._triggerElementEvents(elements.shift());
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
			}

			if (!this.isEventWaitingForTriggering && !this.isEventRunningFromTriggering && (isAjaxCompleted || isWaitingRecursion)) {

				// treating completed ajax
				if (isAjaxCompleted) {
					isAjaxCompleted = false;

					this.printRequestQueue();
					if (isAjaxTriggered) {
						this.triggerUserEvent("onAllXhrsCompleted");
					}

					if (counter < this._options.maximumRecursion) {
					// getAddedElement is slow and can take time if the DOM is big (~25000 nodes)
					// so use it only if ajax
					modifiedElementList = isAjaxTriggered ? _getAddedElements(this.DOMSnapshot) : [];

					if (modifiedElementList.length > 0) {
						this.triggerUserEvent("onDomModified", [modifiedElementList, elements]);
					}
					// if ajax has been triggered and some elements are modified then recurse through the modified elements
					isWaitingRecursion = (modifiedElementList.length > 0 && hasXHRs);

				} else {
					console.log(">>>>RECURSION LIMIT REACHED :" + counter);
				}
				}

				if (isWaitingRecursion) {

					if (modifiedElementList.length > 0) {
						// DEBUG:
						console.log('modified');
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

				// console.log(counter + "## elements.length: " + elements.length + "\trecursion: " + isWaitingRecursion + "\treturned: " + isRecursionReturned + "\tajax: " + this.pendingAjax.length + "\tcompleted: " + isAjaxCompleted + "\ttriggered: " + isAjaxTriggered + "\tevents: " + (this.isEventWaitingForTriggering) + " " + ( this.isEventRunningFromTriggering));

				if (elements.length === 0) {
					console.log("call END");
					// setting the "finish" step to the next event loop to leave some time to the last process/event to finish
					window.__originalSetTimeout(function () {
						clearInterval(to);
						console.log("-------END");
						if (typeof callback === 'function') callback();
					});
				}
			}
		}.bind(this), 0);
	};


	/**
	 * return a snapshot of the current DOM
	 * NOTE: do NOT use MutationObserver to get added elements .. it is asynchronous and the callback is fired only when DOM is refreshed (graphically)
	 * @returns {Array}
	 * @private
	 */
	function _getDOMSnapshot() {
		return Array.prototype.slice.call(document.getElementsByTagName("*"), 0);
	}

	/**
	 * Get an array of all the DOM elements added to the DOM
	 * @param DOMSnapshot - the initial DOM to compare with
	 * @returns {Array}
	 * @private
	 * @static
	 */
	function _getAddedElements(DOMSnapshot) {
		var a,
			elements = [],
			rootElements = [];

		var newDom = Array.prototype.slice.call(document.getElementsByTagName("*"), 0);

		console.log('get added elements start dom len: ' + DOMSnapshot.length + ' new dom len: ' + newDom.length);
		// get all added elements
		for (a = 0; a < newDom.length; a++) {
			if (DOMSnapshot.indexOf(newDom[a]) === -1) {
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
			while (p) {
				//if(elements.indexOf(p) != -1){
				if (p.__new) {
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

		console.log("root elements found: " + rootElements.length);
		return rootElements;
	}


	/**
	 * convert a DOM tree to an array
	 *
	 * WARNING: DO NOT include node as first element. this is a requirement
	 *
	 * @param node
	 * @returns {Array} array of the given DOM node
	 * @private
	 * @static
	 */
	function _getDOMTreeAsArray(node) {
		var out = [],
			children = node.querySelectorAll(":scope > *");

		for (var a = 0; a < children.length; a++) {
			var child = children[a];
			out.push(child);
			out = out.concat(_getDOMTreeAsArray(child));
		}
		return out;
	}


	function _print(str) {
		window.__callPhantom({cmd: 'print', argument: str});
	}

	function _log(str) {
		window.__callPhantom({cmd: 'log', argument: str});
	}

	function _fread(file) {
		return window.__callPhantom({cmd: 'fread', file: file});
	}

	function _fwrite(file, content, mode) {
		return window.__callPhantom({cmd: 'fwrite', file: file, content: content, mode: mode || 'w'});
	}

	function _render(file) {
		return window.__callPhantom({cmd: 'render', argument: file});
	}

	/**
	 * convert an element to a string
	 * @param {Element=} element - element to convert
	 * @returns {string}
	 * @private
	 * @static
	 */
	function _elementToString(element) {
		if (!element) {
			return "[]";
		}
		var tagName = (element === document ? "DOCUMENT" : (element === window ? "WINDOW" : element.tagName));
		var text = undefined;
		if (element.textContent) {
			text = element.textContent.trim().replace(/\s/, " ").substring(0, 10);
			if (text.indexOf(" ") > -1) text = "'" + text + "'";
		}

		var className = element.className ? (element.className.indexOf(" ") !== -1 ? "'" + element.className + "'" : element.className) : "";

		return "[" +
			(tagName ? tagName + " " : "") +
			(element.name && typeof element.name === 'string' ? element.name + " " : "") +
			(className ? "." + className + " " : "") +
			(element.id ? "#" + element.id + " " : "") +
			(element.src ? "src=" + element.src + " " : "") +
			(element.action ? "action=" + element.action + " " : "") +
			(element.method ? "method=" + element.method + " " : "") +
			(element.value ? "v=" + element.value + " " : "") +
			(text ? "txt=" + text : "") +
			"]";
	}

	function _printUserOutput(str) {
		var json = '["user",' + JSON.stringify(str) + '],';
		_print(json);
	}

	/**
	 * @param xhrList
	 * @returns {boolean}
	 * @private
	 * @static
	 */
	function _isXHRsInListCompleted(xhrList) {
		var allDone = true;
		for (var a = 0; a < xhrList.length; a++) {
			//console.log("-->"+xhrList[a].readyState + " "+ xhrList[a].__request.url)
			if (xhrList[a].readyState !== 4 && !xhrList[a].__skipped) allDone = false;
		}
		//if(allDone)
		//	console.log("-----------------> alla ajax completed")
		return allDone;
	}


	/**
	 * @param eventName
	 * @returns {boolean}
	 * @private
	 * @static
	 */
	function _isEventTriggerable(eventName) {
		return ['load', 'unload', 'beforeunload'].indexOf(eventName) === -1;
	}


	/**
	 *
	 * @param arr
	 * @param el
	 * @param ignoreProperties
	 * @returns {boolean}
	 * @private
	 * @static
	 */
	function _objectInArray(arr, el, ignoreProperties) {
		ignoreProperties = ignoreProperties || [];
		if (arr.length === 0) return false;
		if (typeof arr[0] !== 'object')
			return arr.indexOf(el) > -1;
		for (var a = 0; a < arr.length; a++) {
			var found = true;
			for (var k in arr[a]) {
				if (arr[a][k] !== el[k] && ignoreProperties.indexOf(k) === -1) {
					found = false;
				}
			}
			if (found) return true;
		}
		return false;
	}

	function _replaceUrlQuery(url, qs) {
		var anchor = document.createElement("a");
		anchor.href = url;
		/*
		 Example of content:
		 anchor.protocol; // => "http:"
		 anchor.host;     // => "example.com:3000"
		 anchor.hostname; // => "example.com"
		 anchor.port;     // => "3000"
		 anchor.pathname; // => "/pathname/"
		 anchor.hash;     // => "#hash"
		 anchor.search;   // => "?search=test"
		 */
		return anchor.protocol + "//" + anchor.host + anchor.pathname + (qs ? "?" + qs : "") + anchor.hash;
	}

	window.__PROBE__ = new Probe(options, inputValues, userCustomScript);
}
