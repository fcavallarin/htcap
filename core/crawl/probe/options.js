/*
HTCAP - beta 1
Author: filippo.cavallarin@wearesegment.com

This program is free software; you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation; either version 2 of the License, or (at your option) any later
version.
*/


window.options ={
	verbose: false,
	checkAjax: true,
	fillValues: true,
	triggerEvents: true,
	checkWebsockets: true,
	searchUrls: true,
	jsonOutput:true,
	//maxExecTime: 300000, // 300 seconds
	maxExecTime: 100000, // 100 seconds
	ajaxTimeout:5000,
	printAjaxPostData: true,
	loadImages: false,
	getCookies:true,
	mapEvents: true,
	checkScriptInsertion: true,
	httpAuth: false,
	triggerAllMappedEvents: true,
	outputMappedEvents: false,
	overrideTimeoutFunctions: true,
	referer: false,
	userAgent: 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/37.0.2062.120 Safari/537.36',
	allEvents: ['abort', 'autocomplete', 'autocompleteerror', 'beforecopy', 'beforecut', 'beforepaste', 'blur', 'cancel', 'canplay', 'canplaythrough', 'change', 'click', 'close', 'contextmenu', 'copy', 'cuechange', 'cut', 'dblclick', 'drag', 'dragend', 'dragenter', 'dragleave', 'dragover', 'dragstart', 'drop', 'durationchange', 'emptied', 'ended', 'error', 'focus', 'input', 'invalid', 'keydown', 'keypress', 'keyup', 'load', 'loadeddata', 'loadedmetadata', 'loadstart', 'mousedown', 'mouseenter', 'mouseleave', 'mousemove', 'mouseout', 'mouseover', 'mouseup', 'mousewheel', 'paste', 'pause', 'play', 'playing', 'progress', 'ratechange', 'reset', 'resize', 'scroll', 'search', 'seeked', 'seeking', 'select', 'selectstart', 'show', 'stalled', 'submit', 'suspend', 'timeupdate', 'toggle', 'volumechange', 'waiting', 'webkitfullscreenchange', 'webkitfullscreenerror', 'wheel'],
	returnHtml: false,
	setCookies: [],
	excludedUrls: [],
	maximumRecursion: 50,
	printUnknownRequests: false, // unknown requests are for example mailto: and javascript: urls

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
	eventsMap: {
		'button':['click','keyup','keydown'],
		'select':['change','click','keyup','keydown'],
		'input':['change','click','blur','focus','keyup','keydown'],
		'a':['click','keyup','keydown'],
		'textarea':['change','click','blur','focus','keyup','keydown']
		,'span':['click']
		,'td':['click']
	}
};
