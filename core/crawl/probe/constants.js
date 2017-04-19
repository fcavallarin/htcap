(function () {
	'use strict';
	window.__HTCAP = {
		messageEvent: {
			eventLoopReady: {
				from: "htcap",
				name: "event-loop-ready"
			}
		},
		eventLoop: {
			bufferCycleSize: 100, // number of event loop cycle between every new action proceed in the eventLoop
			afterEventTriggeredTimeout: 1, // after triggering an event, time in ms to wait before requesting another eventLoop cycle
			afterDoneXHRTimeout: 10// after a done XHR, time in ms to before requesting another eventLoop cycle
		},
		mappableEvents: [
			'abort', 'autocomplete', 'autocompleteerror', 'beforecopy', 'beforecut', 'beforepaste', 'blur',
			'cancel', 'canplay', 'canplaythrough', 'change', 'click', 'close', 'contextmenu', 'copy', 'cuechange',
			'cut', 'dblclick', 'drag', 'dragend', 'dragenter', 'dragleave', 'dragover', 'dragstart', 'drop',
			'durationchange', 'emptied', 'ended', 'error', 'focus', 'input', 'invalid', 'keydown', 'keypress',
			'keyup', 'load', 'loadeddata', 'loadedmetadata', 'loadstart', 'mousedown', 'mouseenter',
			'mouseleave', 'mousemove', 'mouseout', 'mouseover', 'mouseup', 'mousewheel', 'paste', 'pause',
			'play', 'playing', 'progress', 'ratechange', 'reset', 'resize', 'scroll', 'search', 'seeked',
			'seeking', 'select', 'selectstart', 'show', 'stalled', 'submit', 'suspend', 'timeupdate', 'toggle',
			'volumechange', 'waiting', 'webkitfullscreenchange', 'webkitfullscreenerror', 'wheel'
		],
		/* always trigger these events since event delegation mays "confuse" the triggering of mapped events */
		triggerableEvents: {
			'button': ['click', 'keyup', 'keydown'],
			'select': ['change', 'click', 'keyup', 'keydown'],
			'input': ['change', 'click', 'blur', 'focus', 'keyup', 'keydown'],
			'a': ['click', 'keyup', 'keydown'],
			'textarea': ['change', 'click', 'blur', 'focus', 'keyup', 'keydown'],
			'span': ['click'],
			'td': ['click']
		}
	};
})();
