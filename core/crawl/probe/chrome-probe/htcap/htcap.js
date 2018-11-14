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
const probe = require("./probe");

module.exports = {
	loadProbe: loadProbe
};



function loadProbe(page, options) {
	// generate a static map of random values using a "static" seed for input fields
	// the same seed generates the same values
	// generated values MUST be the same for all analyze.js call othewise the same form will look different
	// for example if a page sends a form to itself with input=random1,
	// the same form on the same page (after first post) will became input=random2
	// => form.data1 != form.data2 => form.data2 is considered a different request and it'll be crawled.
	// this process will lead to and infinite loop!
	var inputValues = generateRandomValues(options.randomSeed);

	page.evaluateOnNewDocument(probe.initProbe, options, inputValues);
	page.evaluateOnNewDocument(function(options) {
		//alert(window.__PROBE__)

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
			XMLHttpRequest.prototype.originalOpen = XMLHttpRequest.prototype.open;
			XMLHttpRequest.prototype.open = function(method, url, async, user, password){

				var _url = window.__PROBE__.removeUrlParameter(url, "_");
				this.__request = new window.__PROBE__.Request("xhr", method, _url, null, null);

				return this.originalOpen(method, url, async, user, password);
			}



			XMLHttpRequest.prototype.originalSend = XMLHttpRequest.prototype.send;

			XMLHttpRequest.prototype.send = async function(data){
				var _this = this;
				this.__request.data = data;

				var absurl = window.__PROBE__.getAbsoluteUrl(this.__request.url);
				for(var a = 0; a < options.excludedUrls.length; a++){
					if(absurl.match(options.excludedUrls[a])){
						this.__skipped = true;
					}
				}


				this.__request.trigger = window.__PROBE__.getTrigger();


				// check if request has already been sent
				var rk = this.__request.key();
				if(window.__PROBE__.sentAjax.indexOf(rk) != -1){
					return;
				}


				//var ueRet = window.__PROBE__.triggerUserEvent("onXhr",[this.__request]);
				var uRet = await window.__PROBE__.dispatchProbeEvent("xhr", {
					request: window.__PROBE__.requestToObject(this.__request)					
				});
				// console.log("----------adsdsd_---------------")
				// console.log(uRet)
				if(uRet){
					this.addEventListener("readystatechange", function ev(e){
						if(_this.readyState != 4) return;
						window.__PROBE__.dispatchProbeEvent("xhrCompleted", {
							request: window.__PROBE__.requestToObject(this.__request),
							response: _this.responseText
						});
						_this.removeEventListener("readystatechange", ev);
						//_this.originalRemoveEventListener("readystatechange", ev);
					});	

					// pending ajax
					window.__PROBE__.pendingAjax.push(this);
					window.__PROBE__.sentAjax.push(rk);
					window.__PROBE__.addRequestToPrintQueue(this.__request);


					if(!this.__skipped)
						return this.originalSend(data);
				}

				return;
			}

		}


		if(options.checkScriptInsertion){

			Node.prototype.originalappendChild = Node.prototype.appendChild;
			Node.prototype.appendChild = function(node){
				window.__PROBE__.printJSONP(node);

				window.__PROBE__.triggerJsonpEvent(node);
				return this.originalappendChild(node);
			}

			Node.prototype.originalinsertBefore = Node.prototype.insertBefore;
			Node.prototype.insertBefore = function(node, element){
				window.__PROBE__.printJSONP(node);
				window.__PROBE__.triggerJsonpEvent(node);			
				return this.originalinsertBefore(node, element);
			}

			Node.prototype.originalreplaceChild = Node.prototype.replaceChild;
			Node.prototype.replaceChild = function(node, oldNode){
				window.__PROBE__.printJSONP(node);
				window.__PROBE__.triggerJsonpEvent(node);		
				return this.originalreplaceChild(node, oldNode);
			}
		}

		if(options.checkWebsockets){
			window.WebSocket = (function(WebSocket){
				return function(url, protocols){
					//window.__PROBE__.printWebsocket(url); //websockets.push(url);
					window.__PROBE__.triggerWebsocketEvent(url);
					//return WebSocket.prototype;
					var ws = new WebSocket(url);
					ws.__originalSend = ws.send;
					ws.send = function(message){
						window.__PROBE__.triggerWebsocketSendEvent(url, message);
						return ws.__originalSend(message);
					}
					ws.addEventListener("message", function(message){								
						window.__PROBE__.triggerWebsocketMessageEvent(url, message.data);
					});
					return ws;
				}
			})(window.WebSocket);
		}


		if(options.overrideTimeoutFunctions){
			window.setTimeout = (function(setTimeout){
				return function(func, time, setTime){
					var t = setTime ? time : 0;
					return setTimeout(func, t);
				}
			})(window.setTimeout);

			window.setInterval = (function(setInterval){
				return function(func, time, setTime){
					var t = setTime ? time : 0;
					return setInterval(func, t);
				}
			})(window.setInterval);

		}

		if(options.preventElementRemoval){
			//Node.prototype.originalremoveChild = Node.prototype.removeChild;
			Node.prototype.removeChild = function(node){
				//console.log(node);
				return node;
			}
		}

		HTMLFormElement.prototype.originalSubmit = HTMLFormElement.prototype.submit;
		HTMLFormElement.prototype.submit = function(){
			//console.log("=-->"+this.action)
			var req = window.__PROBE__.getFormAsRequest(this);
			window.__PROBE__.printRequest(req);
			window.__PROBE__.triggerFormSubmitEvent(this);
			return this.originalSubmit();
		}

		// prevent window.close
		window.close = function(){ return }
		window.print = function(){ return }

		window.open = function(url, name, specs, replace){
			window.__PROBE__.printLink(url);
		}

		window.__PROBE__.triggerUserEvent("onInit");
	}, options);
};



