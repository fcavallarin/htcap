/*
HTCRAWL - 1.0
http://htcrawl.org
Author: filippo.cavallarin@wearesegment.com

This program is free software; you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation; either version 2 of the License, or (at your option) any later
version.
*/

exports.options = {
	id: 0,
	verbose: false,
	checkAjax: true,
	fillValues: true,
	triggerEvents: true,
	checkWebsockets: true,
	searchUrls: true,
	jsonOutput:true,
	maxExecTime: 300000, // 300 seconds
	ajaxTimeout:3000,
	printAjaxPostData: true,
	loadImages: false,
	getCookies:true,
	mapEvents: true,
	checkScriptInsertion: true,
	checkFetch: true,
	httpAuth: false,
	triggerAllMappedEvents: true,
	outputMappedEvents: false,
	overrideTimeoutFunctions: false,
	referer: false,
	userAgent: null,
	allEvents: ['abort', 'autocomplete', 'autocompleteerror', 'beforecopy', 'beforecut', 'beforepaste', 'blur', 'cancel', 'canplay', 'canplaythrough', 'change', /*'click',*/ 'close', 'contextmenu', 'copy', 'cuechange', 'cut', 'dblclick', 'drag', 'dragend', 'dragenter', 'dragleave', 'dragover', 'dragstart', 'drop', 'durationchange', 'emptied', 'ended', 'error', 'focus', 'input', 'invalid', 'keydown', 'keypress', 'keyup', 'load', 'loadeddata', 'loadedmetadata', 'loadstart', 'mousedown', 'mouseenter', 'mouseleave', 'mousemove', 'mouseout', 'mouseover', 'mouseup', 'mousewheel', 'paste', 'pause', 'play', 'playing', 'progress', 'ratechange', 'reset', 'resize', 'scroll', 'search', 'seeked', 'seeking', 'select', 'selectstart', 'show', 'stalled', 'submit', 'suspend', 'timeupdate', 'toggle', 'volumechange', 'waiting', 'webkitfullscreenchange', 'webkitfullscreenerror', 'wheel'],
	mouseEvents: [],//['click','dblclick','mouseup','mousedown','mousemove','mouseover', 'mouseout'],
	keyboardEvents: [], //['keydown', 'keypress', 'keydown', 'keypress', 'keyup'], 
	setCookies: [],
	excludedUrls: [],
	maximumRecursion: 15,
	maximumAjaxChain: 30,
	preventElementRemoval: 1,
	randomSeed: "IsHOulDb34RaNd0MsTR1ngbUt1mN0t",
	// map input names to string generators. see generateRandomValues to see all available generators
	inputNameMatchValue:[ // regexps NEED to be string to get passed to phantom page
		{name: "mail", value: "email"},
		{name: "((number)|(phone))|(^tel)", value: "number"},
		{name: "(date)|(birth)", value: "humandate"},
		{name: "((month)|(day))|(^mon$)", value: "month"},
		{name: "year", value: "year"},
		{name: "url", value: "url"},
		{name: "firstname", value: "firstname"},
		{name: "(surname)|(lastname)", value: "surname"},
	],
	/* always trigger these events since event delegation mays "confuse" the triggering of mapped events */
	// NOTE: trigger mouseUP FIRST to prevent up and down to be considered a click
	eventsMap: {
		'button':['click','dblclick','keydown','keyup','mouseup','mousedown'],
		'select':['change','click','dblclick','keydown','keyup','mouseup','mousedown'],
		'input':['change','click','dblclick','blur','focus','keydown','keyup','mouseup','mousedown'],
		'a':['click','dblclick','keydown','keyup','mouseup','mousedown'],
		'textarea':['change','click','dblclick','blur','focus','keydown','keyup','mouseup','mousedown'],
		'span':['click','dblclick','mouseup','mousedown'],
		'td':['click','dblclick','mouseup','mousedown'],
		'tr':['click','dblclick','mouseup','mousedown'],
		'div':['click','dblclick','mouseup','mousedown']
	},
	proxy: null,
	loadWithPost: false,
	postData: null,
	headlessChrome: true,
	extraHeaders: false,
	openChromeDevtoos: false,
	exceptionOnRedirect: false
};
