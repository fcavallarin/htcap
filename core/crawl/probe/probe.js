/*
HTCAP - www.htcap.org
Author: filippo.cavallarin@wearesegment.com

This program is free software; you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation; either version 2 of the License, or (at your option) any later
version.
*/


(function () {
/*
	this function is passed to page.evaluate. doing so it is possible to avoid that the Probe object
	is inserted into page window scope (only its instance is referred by window.__PROBE__)
*/
	window.initProbe = function initProbe(options, inputValues, userCustomScript) {

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

			this.sentXHRs = [];

			this.eventLoopManager = new this.EventLoopManager(this);

			this._currentPageEvent = undefined;
			this._eventsMap = [];
			this._triggeredPageEvents = [];
			this._inputValues = inputValues;

			this._userInterface = {
				id: options.id,
				vars: {},
				log: function (str) {
					_log(str);
				},
				print: function (str) {
					_printUserOutput(str)
				},
				fread: function (file) {
					return _fread(file);
				},
				fwrite: function (file, content, mode) {
					return _fwrite(file, content, mode);
				},
				render: function (file) {
					return _render(file);
				},
				triggerEvent: function (element, eventName) {
					currentProbe._trigger(new currentProbe.PageEvent(element, eventName));
				}
			};
			this.userEvents = {};
			if (userCustomScript) {
				try {
					eval("this.userEvents=" + userCustomScript.trim() + ";");
				} catch (e) {
				}
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

			/** @type {PageEvent} */
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

		/**
		 * the standard toJSON for JSON.stringify() call
		 * @returns {{type: *, method: *, url: *, data: null}}
		 */
		Probe.prototype.Request.prototype.toJSON = function () {
			var obj = {
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

			// DEBUG:
			// console.log('PageEvent triggering events for : ', _elementToString(this.element), this.eventName);
			var ueRet = window.__PROBE__.triggerUserEvent("onTriggerEvent", [this.element, this.eventName]);


			if (ueRet !== false) {
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
				window.__PROBE__.triggerUserEvent("onEventTriggered", [this.element, this.eventName]);
			}
		};

		/**
		 * EventLoop Manager
		 * Responsibility:
		 * Managing the eventLoop to ensure that every code execution (from the page or from the probe)
		 * is completely done before launching anything else.
		 * Since the possible actions on the page are _user triggered_, the executed code is design to be triggered by
		 * a _normal_ interaction through standard HID, not automated. So it is important to give time
		 * to the JS stack to empty before launching anything new.
		 *
		 * Possible actions to be schedule are: DOM Assessment and event triggering.
		 *
		 * Upon schedule, the action will take place as soon as the eventLoop is empty and nothing is waiting
		 * to be completed (like an XHR request).
		 *
		 * The logic is (in this order):
		 * if a XHR has been sent or is done, do nothing (ie. wait the next event loop before acting)
		 * then if a DOM Assessment is waiting, do it first.
		 * then if a event is waiting to be triggered, trigger it.
		 *
		 * A new DOM Assessment is schedule everytime the DOM is modified.
		 * A new event is schedule for every triggerable event on every element in the DOM.
		 *
		 *
		 * more info on {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/EventLoop MDN}
		 *
		 * @param probe the probe from where it's initialized
		 * @constructor
		 */
		Probe.prototype.EventLoopManager = function (probe) {
			this._probe = probe;
			this._DOMAssessmentQueue = [];
			this._toBeTriggeredEventsQueue = [];
			this._sentXHRQueue = [];
			this._doneXHRQueue = [];
			this._emptyLoopCounter = 0;
		};

		/**
		 * callback for the eventMessage listener
		 * it will wait until x empty eventLoop before requesting a `doNextAction()`,
		 * x being the buffer size set in constants.js
		 *
		 * @param eventMessage - the eventMessage triggered
		 * @private
		 */
		Probe.prototype.EventLoopManager.prototype.eventMessageHandler = function (eventMessage) {

			// if it's our eventMessage
			if (eventMessage.source === window && eventMessage.data.from === 'htcap') {
				eventMessage.stopPropagation();

				if (eventMessage.data.name === __HTCAP.messageEvent.eventLoopReady.name) {

					// waiting x number eventLoop before doing anything (x being the buffer size)
					if (this._emptyLoopCounter < __HTCAP.eventLoop.bufferCycleSize) {
						window.postMessage(__HTCAP.messageEvent.eventLoopReady, "*");
						this._emptyLoopCounter += 1;
					} else {
						this._emptyLoopCounter = 0;
						this.doNextAction();
					}
				}
			}
		};

		/**
		 * start the eventLoopManager
		 */
		Probe.prototype.EventLoopManager.prototype.start = function () {
			// DEBUG:
			// console.log('eventLoop start');
			window.__PROBE__.triggerUserEvent("onStart");

			window.postMessage(__HTCAP.messageEvent.eventLoopReady, "*");
		};

		/**
		 * Do the next action based on the priority:
		 * if a XHR has been sent or is done, do nothing (ie. wait the next event loop before acting)
		 * then if a DOM Assessment is waiting, do it first.
		 * then if a event is waiting to be triggered, trigger it.
		 * then close the manager
		 */
		Probe.prototype.EventLoopManager.prototype.doNextAction = function () {
			// DEBUG:
			console.log('eventLoop doNextAction - sent: ',
				this._sentXHRQueue.length,
				', done:', this._doneXHRQueue.length,
				', DOM:', this._DOMAssessmentQueue.length,
				', event:', this._toBeTriggeredEventsQueue.length
			);

			if (this._sentXHRQueue.length > 0) { // if there is XHR waiting to be resolved
				// releasing the eventLoop waiting for resolution
				window.postMessage(__HTCAP.messageEvent.eventLoopReady, "*");

			} else if (this._doneXHRQueue.length > 0) { // if there is XHR done
				var request = this._doneXHRQueue.shift();

				// if all XHR done
				if (this._doneXHRQueue.length === 0) {
					window.__PROBE__.triggerUserEvent("onAllXhrsCompleted");
				}
				window.__originalSetTimeout(function () {
					window.postMessage(__HTCAP.messageEvent.eventLoopReady, "*");
				}, __HTCAP.eventLoop.afterDoneXHRTimeout);

			} else if (this._DOMAssessmentQueue.length > 0) { // if there is DOMAssessment waiting

				var element = this._DOMAssessmentQueue.shift();
				// DEBUG:
				// console.log('eventLoop analyzeDOM: ' + _elementToString(element));

				// starting analyze on the next element
				this._probe._analyzeDOMElement(element);
				window.postMessage(__HTCAP.messageEvent.eventLoopReady, "*");

			} else if (this._toBeTriggeredEventsQueue.length > 0) { // if there is event waiting
				// retrieving the next pageEvent
				var pageEvent = this._toBeTriggeredEventsQueue.shift();

				// setting the current element
				this._probe._currentPageEvent = pageEvent;

				// DEBUG:
				// console.log('eventLoop pageEvent.trigger', pageEvent.element.tagName, pageEvent.eventName);

				// Triggering the event
				pageEvent.trigger();

				window.__originalSetTimeout(function () {
					window.postMessage(__HTCAP.messageEvent.eventLoopReady, "*");
				}, __HTCAP.eventLoop.afterEventTriggeredTimeout);
			} else {
				// DEBUG:
				// console.log("eventLoop END");
				window.__callPhantom({cmd: 'end'})
			}
		};

		Probe.prototype.EventLoopManager.prototype.scheduleDOMAssessment = function (element) {
			if (this._DOMAssessmentQueue.indexOf(element) < 0) {
				this._DOMAssessmentQueue.push(element);
			}
		};

		Probe.prototype.EventLoopManager.prototype.nodeMutated = function (mutations) {
			// DEBUG:
			console.log('eventLoop nodesMutated:', mutations.length);
			mutations.forEach(function (mutationRecord) {
				if (mutationRecord.type === 'childList') {
					for (var i = 0; i < mutationRecord.addedNodes.length; i++) {
						var addedNode = mutationRecord.addedNodes[i];
						// DEBUG:
						// console.log('added:', _elementToString(mutationRecord.addedNodes[i]), mutationRecord.addedNodes[i]);

						// see: https://developer.mozilla.org/en-US/docs/Web/API/Node/nodeType#Constants
						if (addedNode.nodeType === Node.ELEMENT_NODE) {
							// DEBUG:
							// console.log('added:', addedNode);
							this.scheduleDOMAssessment(addedNode)
						}
					}
				} else if (mutationRecord.type === 'attributes') {
					// DEBUG:
					// console.log('eventLoop nodeMutated: attributes', mutationRecord.attributeName, mutationRecord.target[mutationRecord.attributeName]);
					this.scheduleDOMAssessment(mutationRecord.target);

				}
			}.bind(this));
		};

		Probe.prototype.EventLoopManager.prototype.scheduleEventTriggering = function (pageEvent) {
			if (this._toBeTriggeredEventsQueue.indexOf(pageEvent) < 0) {
				// DEBUG:
				// console.log('eventLoop scheduleEventTriggering');
				this._toBeTriggeredEventsQueue.push(pageEvent);
			}
		};

		Probe.prototype.EventLoopManager.prototype.sentXHR = function (request) {
			if (this._sentXHRQueue.indexOf(request) < 0) {
				// DEBUG:
				// console.log('eventLoop sentXHR');
				this._sentXHRQueue.push(request);
			}
		};

		Probe.prototype.EventLoopManager.prototype.doneXHR = function (request) {
			if (this._doneXHRQueue.indexOf(request) < 0) {
				// DEBUG:
				// console.log('eventLoop doneXHR');

				// if the request is in the sentXHR queue
				var i = this._sentXHRQueue.indexOf(request);
				if (i >= 0) {
					this._sentXHRQueue.splice(i, 1);
				}

				this._doneXHRQueue.push(request);
			}
		};

		Probe.prototype.EventLoopManager.prototype.inErrorXHR = function (request) {
			// DEBUG:
			// console.log('eventLoop inErrorXHR');
		};

		Probe.prototype.printJSONP = function (node) {

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

		Probe.prototype.printLink = function (url) {
			var req;

			url = url.split("#")[0];

			if (url.match(/^[a-z0-9\-_]+\:/i) && !url.match(/(^https?)|(^ftps?)\:/i)) {
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

		Probe.prototype.printWebsocket = function (url) {
			var req = new this.Request("websocket", "GET", url, null, this.getLastTriggerPageEvent());
			req.print();
		};

		Probe.prototype.printPageHTML = function () {
			var html = document.documentElement.innerHTML;
			var json = '["html",' + JSON.stringify(html) + '],';
			_print(json);
		};

		Probe.prototype.getRandomValue = function (type) {
			if (!(type in this._inputValues))
				type = "string";

			return this._inputValues[type];
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
			params.splice(0, 0, this._userInterface);
			var ret = this.userEvents[name].apply(this._userInterface, params);
			return !(ret === false)
		};

		/**
		 * Start the analysis of the current Document
		 */
		Probe.prototype.startAnalysis = function () {
			console.log("page initialized ");

			// Parsing the current DOM
			var elements = document.getElementsByTagName('*');
			for (var i = 0; i < elements.length; i++) {
				var element = elements[i];
				if (element.nodeType === Node.ELEMENT_NODE) {
					this.eventLoopManager.scheduleDOMAssessment(element);
				}
			}

			// starting the eventLoop manager
			this.eventLoopManager.start();
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
		 * @param {Element} el
		 * @private
		 */
		Probe.prototype._setVal = function (el) {
			var _this = this;

			var ueRet = window.__PROBE__.triggerUserEvent("onFillInput", [el]);
			if (ueRet === true) {
				var setv = function (name) {
					var ret = _this.getRandomValue('string');
					_this._options.inputNameMatchValue.forEach(function (matchValue) {
						var regexp = new RegExp(matchValue.name, "gi");
						if (name.match(regexp)) {
							ret = _this.getRandomValue(matchValue.value);
						}
					});
					return ret;
				};

				// needed for example by angularjs
				var triggerChange = function () {
					// update angular model
					_this._trigger(new _this.PageEvent(el, 'input'));

					// _this._trigger(new _this.PageEvent(el, 'blur'));
					// _this._trigger(new _this.PageEvent(el, 'keyup'));
					// _this._trigger(new _this.PageEvent(el, 'keydown'));
				};

				if (el.tagName.toLowerCase() === 'textarea') {
					el.value = setv(el.name);
					triggerChange();

				} else if (el.tagName.toLowerCase() === 'select') {
					var opts = el.getElementsByTagName('option');
					if (opts.length > 1) { // avoid to set the first (already selected) options
						// @TODO .. qui seleziono l'ultimo val.. ma devo controllare che non fosse "selected"
						el.value = opts[opts.length - 1].value;
					} else {
						el.value = setv(el.name);
					}
					triggerChange();

				} else if (el.tagName.toLowerCase() === 'input') {
					var type = el.type.toLowerCase();

					switch (type) {
						case 'button':
						case 'hidden':
						case 'submit':
						case 'file':
							return;
						case '':
						case 'text':
						case 'search':
							el.value = setv(el.name);
							break;
						case 'radio':
						case 'checkbox':
							el.setAttribute('checked', !(el.getAttribute('checked')));
							break;
						case 'range':
						case 'number':
							if ('min' in el && el.min) {
								el.value = (parseInt(el.min) + parseInt(('step' in el) ? el.step : 1));
							} else {
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
							return;
					}

					triggerChange();
				}
			}
		};

		Probe.prototype.getRandomValue = function (type) {
			if (!(type in this._inputValues)) {
				type = "string";
			}
			return this._inputValues[type];
		};

		/**
		 * schedule the trigger of the given event on the given element when the eventLoop is ready
		 *
		 * @param {PageEvent} pageEvent which have to be triggered
		 * @private
		 */
		Probe.prototype._trigger = function (pageEvent) {
			// workaround for a phantomjs bug on linux (so maybe not a phantom bug but some linux libs??).
			// if you trigger click on input type=color everything freezes... maybe due to some
			// color picker that pops up ...
			if (!(pageEvent.element.tagName.toUpperCase() === "INPUT" && pageEvent.element.type.toLowerCase() === 'color' && pageEvent.eventName.toLowerCase() === 'click')) {

				// trigger the given event only when there is some space in the event stack to avoid collision
				// and give time to things to resolve properly (since we trigger user driven event,
				// it is important to give time to the analysed page to breath between calls)
				this.eventLoopManager.scheduleEventTriggering(pageEvent);
			}
		};

		/**
		 * @param  {Element} element
		 * @returns {Array}
		 * @private
		 */
		Probe.prototype._getEventsForElement = function (element) {
			var events = [];

			if (this._options.triggerAllMappedEvents) {
				var map = this._eventsMap;
				for (var a = 0; a < map.length; a++) {
					if (map[a].element === element) {
						events = map[a].events.slice();
						break;
					}
				}
			}

			for (var selector in __HTCAP.triggerableEvents) {
				if (element.webkitMatchesSelector(selector)) {
					events = events.concat(__HTCAP.triggerableEvents[selector]);
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

				if (_isEventTriggerable(eventName) && !_objectInArray(this._triggeredPageEvents, pageEvent)) {
					this._triggeredPageEvents.push(pageEvent);
					this._trigger(pageEvent);
				}
			}.bind(this));
		};

		/**
		 * @param {Element} element
		 * @private
		 */
		Probe.prototype._mapElementEvents = function (element) {
			__HTCAP.mappableEvents.forEach(function (eventName) {
				var onEventName = "on" + eventName;

				if (onEventName in element && element[onEventName]) {
					this.addEventToMap(element, eventName);
				}
			}.bind(this))
		};

		/**
		 * print out url found in the given element
		 * @param {Node} element
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

			for (a = 0; a < links.length; a++) {
				var url = links[a].href;
				if (url) {
					this.printLink(url);
				}
			}

			for (a = 0; a < forms.length; a++) {
				var req = this.getFormAsRequest(forms[a]);
				req.print();
			}
		};

		/**
		 * analyze the given element
		 * @param {Element} element - the element to analyze
		 * @private
		 */
		Probe.prototype._analyzeDOMElement = function (element) {

			// map property events and fill input values
			if (this._options.mapEvents) {
				this._mapElementEvents(element);
			}

			if (this._options.fillValues) {
				this._setVal(element);
			}

			if (this._options.searchUrls) {
				this._printUrlsFromElement(element);
			}

			if (this._options.triggerEvents) {
				this._triggerElementEvents(element);
			}
		};

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

		var probe = new Probe(options, inputValues, userCustomScript);

		// listening for messageEvent to trigger waiting events
		window.addEventListener("message", probe.eventLoopManager.eventMessageHandler.bind(probe.eventLoopManager), true);

		window.__PROBE__ = probe;
	}
})();
