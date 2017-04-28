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
		this.pendingAjax = [];
		this.inputValues = inputValues;
		this.currentUserScriptParameters = [];
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



	Probe.prototype.isChildOf = function(child, parent){
		var p = child.parentNode;
		var depth = 1;
		while(p){
			if(p == parent){
				return depth;
			}
			p = p.parentNode;
			depth++;
		}

		return -1;
	}


	// do NOT use MutationObserver to get added elements .. it is asynchronous and the callback is fired only when DOM is refreshed (graphically)
	Probe.prototype.takeDOMSnapshot = function(){
		this.DOMSnapshot = Array.prototype.slice.call( document.getElementsByTagName("*"), 0 );
	}


	Probe.prototype.getAddedElements = function(){
		var elements = []
		var rootElements = []
		var ueRet = null;
		var newDom = Array.prototype.slice.call( document.getElementsByTagName("*"), 0 );

		console.log('get added elements start dom len: ' + this.DOMSnapshot.length + ' new dom len: ' + newDom.length);
		// get all added elements
		for(var a = 0;a < newDom.length;a++){
			if(this.DOMSnapshot.indexOf(newDom[a]) == -1) {
				// set __new flag on added elements to avoid checking for elments.indexOf
				// that is very very slow
				newDom[a].__new = true;
				elements.push(newDom[a]);
			}
		}

		console.log("elements get... (tot "+elements.length+") searching for root nodes")

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

		if(rootElements.length > 0){
			this.triggerUserEvent("onDomModified", [rootElements, elements]);
		}

		console.log("root elements found: " + rootElements.length);
		return rootElements;
	}




	/* DO NOT include node as first element.. this is a requirement */
	Probe.prototype.getDOMTreeAsArray = function(node, tmp){
		var out = [];
		var children = node.querySelectorAll(":scope > *");

		if(children.length == 0){
			return out;
		}

		for(var a = 0; a < children.length; a++){
			//if(children[a].style.display != 'none')
				out.push(children[a]);

			out = out.concat(this.getDOMTreeAsArray(children[a]));
		}

		return out;
	}




	// class Request

	Probe.prototype.Request = function(type, method, url, data, trigger){
		this.type = type;
		this.method = method;
		this.url = url;
		this.data = data || null;
		this.trigger = trigger || null;

		//this.username = null; // todo
		//this.password = null;
	}

	// returns a unique string represntation of the request. used for comparision
	Probe.prototype.Request.prototype.key = function(){
		var key = "" + this.type + this.method + this.url + (this.data ? this.data : "") + (this.trigger ? this.trigger : "")
		return key;
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
	}



	// END OF class Request..

	Probe.prototype.print = function(str){
		window.__callPhantom({cmd:'print', argument: str});
	}

	Probe.prototype.printRequest = function(req){
		var k = req.key();
		if(this.printedRequests.indexOf(k) == -1){
			//var trigger = this.describeElement(this.curElement.element) + "." + this.curElement.event + "()";
			var json = '["request",' + this.requestToJson(req) + "],";
			this.print(json);
			this.printedRequests.push(k);
		}
	}

	Probe.prototype.printRequestQueue = function(){

		for(var a = 0; a < this.requestsPrintQueue.length; a++){
			this.printRequest(this.requestsPrintQueue[a]);
		}
		this.requestsPrintQueue = [];
	}

	Probe.prototype.printJSONP = function(node){
		if(node.nodeName.toLowerCase() != "script") return;
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


	Probe.prototype.addRequestToPrintQueue = function(req){
		this.requestsPrintQueue.push(req);
	}


	Probe.prototype.isAjaxCompleted = function(xhrs){
		var alldone = true;
		for(var a = 0; a < xhrs.length; a++){
			//console.log("-->"+xhrs[a].readyState + " "+ xhrs[a].__request.url)
			if(xhrs[a].readyState != 4 && ! xhrs[a].__skipped) alldone = false;
		}
		//if(alldone)
		//	console.log("-----------------> alla ajax completed")
		return alldone;
	}


	Probe.prototype.waitAjax = function(callback, chainLimit){
		var _this = this;
		var xhrs = this.pendingAjax.slice();
		this.pendingAjax = [];
		var timeout = this.options.ajaxTimeout;
		var chainLimit = typeof chainLimit != 'undefined' ? chainLimit : this.options.maximumAjaxChain;
		console.log("Waiting for ajaxs: "+chainLimit)
		var t = setInterval(function(){
			if((timeout <= 0) || _this.isAjaxCompleted(xhrs)){
				clearInterval(t);
				setTimeout(function(){
					if(chainLimit > 0 && _this.pendingAjax.length > 0){
						_this.waitAjax(callback, chainLimit - 1);
					} else {
						callback(xhrs.length > 0);
					}
				}, 100, true);
				return;
			}
			timeout -= 10;
		}, 0);
		console.log("Wait ajax return, "+chainLimit)
		return xhrs.length > 0;
	}


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


	Probe.prototype.trigger = function(el,evname){
		/* 	workaround for a phantomjs bug on linux (so maybe not a phantom bug but some linux libs??).
			if you trigger click on input type=color evertything freezes... maybe due to some
			color picker that pops up ...
		*/
		if(el.tagName == "INPUT" && el.type.toLowerCase()=='color' && evname=='click'){
			return;
		}

		var ueRet = this.triggerUserEvent("onTriggerEvent", [el, evname]);
		if(ueRet === false) return;


		if ('createEvent' in document) {
			var evt = document.createEvent('HTMLEvents');
			evt.initEvent(evname, true, false);
			el.dispatchEvent(evt);
		} else {
			evname = 'on' + evname;
			if( evname in el && typeof el[evname] == "function"){
				el[evname]();
			}
		}

		this.triggerUserEvent("onEventTriggered", [el, evname])
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

		return events;
	};



	Probe.prototype.triggerElementEvents = function(element){
		//console.log("triggering events for " + this.describeElement(element));
		var events = this.getEventsForElement(element);
		for(var a = 0; a < events.length; a++){

			var teObj = {e:element, ev: events[a]};
			if(!this.isEventTriggerable(event) || this.objectInArray(this.triggeredEvents, teObj))
				continue;

			this.curElement.element = teObj.e;
			this.curElement.event = teObj.ev;
			this.triggeredEvents.push(teObj);
			this.trigger(teObj.e, teObj.ev);

		}

		this.curElement = {};

	}


	Probe.prototype.getTrigger = function(){
		if(!this.curElement || !this.curElement.element)
			return null;

		return {element: this.curElement.element, event: this.curElement.event};
	};


	Probe.prototype.describeElement = function(el){
		if(!el)
			return "[]";
		var tagName = (el == document ? "DOCUMENT" : (el == window ? "WINDOW" :el.tagName));
		var text = null;
		if(el.textContent){
			text =  el.textContent.trim().replace(/\s/," ").substring(0,10)
			if(text.indexOf(" ") > -1) text = "'" + text + "'";
		}


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
	}



	Probe.prototype.getUrls = function(element){
		var a;
		var links = element.getElementsByTagName("a");
		var forms = element.getElementsByTagName("form");

		if(element.tagName == "A"){
			links = Array.prototype.slice.call(links, 0).concat(element);
		}

		if(element.tagName == "FORM"){
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
			var req = new this.Request("form", "POST", formObj.url, formObj.data);
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


	Probe.prototype.triggerUserEvent = function(name, params){
		this.currentUserScriptParameters = params || [];
		var args = {name: name};
		var ret = window.__callPhantom({cmd:'triggerUserEvent', argument: args});
		return !(ret === false) 
	};


	Probe.prototype.startAnalysis = function(){
		console.log("page initialized ");
		this.analyzeDOM(document, 0, function(){ window.__callPhantom({cmd:'end'}) });

	};




	window.lastThreadId = 0;
	Probe.prototype.analyzeDOM = function(rootNode, counter, callback){
		var _this = this;
		var elements = [rootNode == document ? document.documentElement : rootNode].concat(this.getDOMTreeAsArray(rootNode));

		var index = 0, lastIndex = -1;
		var ajaxCompleted = false;
		var recursionReturned = false;
		var waitingRecursion = false;
		var me = [];
		var meIndex = 0, lastMeIndex = -1;
		var xhrs = false;
		var ajaxTriggered = true;

		var threadId = window.lastThreadId++;


		if(elements.length == 0){
			if(typeof callback == 'function') callback();
			return;
		}


		//console.log(threadId + " layer: "+counter+" initializzing " + _this.describeElement(rootNode))
		// map propety events and fill input values
		this.initializeElement(rootNode);

		if(options.searchUrls){
			this.getUrls(rootNode);
		}



		var to = setInterval(function(){
			//console.log(threadId+" waitingRecursion: "+waitingRecursion+" ajaxCompleted: "+ajaxCompleted+ " recursionReturned:"+recursionReturned)

			if(lastIndex < index && !waitingRecursion){
				//console.log(threadId + " analysing "+_this.describeElement(elements[index]))

				/*
					here the element may have been detached, moved,  ecc
					try to find a logic to handle this
				*/

				_this.takeDOMSnapshot();
				if(_this.options.triggerEvents){
					_this.triggerElementEvents(elements[index]);
				}

				if(_this.pendingAjax.length > 0){
					xhrs = _this.waitAjax(function(){ajaxCompleted = true; ajaxTriggered = true});
				} else {
					xhrs = false;
					ajaxCompleted = true;
					ajaxTriggered = false;
				}

				lastIndex = index;
			}

			if(ajaxCompleted || waitingRecursion){

				if(ajaxCompleted){
					ajaxCompleted = false;

					_this.printRequestQueue();
					if(ajaxTriggered){
						_this.triggerUserEvent("onAllXhrsCompleted");
					}

					if(counter < _this.options.maximumRecursion){
						// getAddedElement is slow and can take time if the DOM is big (~25000 nodes)
						// so use it only if ajax
						me = ajaxTriggered ? _this.getAddedElements() : [];
						///me = _this.getAddedElements();

						meIndex = 0;
						lastMeIndex = -1;
						// if ajax has been triggered and some elements are modified then recurse thru modified elements
						waitingRecursion = (me.length > 0 && xhrs);
						///waitingRecursion = (me.length > 0);

					} else {
						console.log(">>>>RECURSON LIMIT REACHED :" + counter);
					}
				}

				if(waitingRecursion){

					if(lastMeIndex < meIndex){
						//console.log(threadId + " added " + _this.describeElement(me[meIndex]))
						_this.analyzeDOM(me[meIndex], counter + 1, function(){recursionReturned = true});
						lastMeIndex = meIndex;
					}

					if(!recursionReturned) return;
					recursionReturned = false;

					if(meIndex == me.length - 1){
						waitingRecursion = false;
					} else {
						meIndex++;
						return;
					}

				}


				if(index == elements.length - 1){
					clearInterval(to);
					//console.log("-------END")
					if(typeof callback == 'function') callback();
					return;
				}

				index++;

			}

		}, 0);
	};



	window.__PROBE__ = new Probe(options, inputValues);
};
