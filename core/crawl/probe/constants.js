(function () {
	'use strict';
	window.__HTCAP = {
		messageEvent: {
			eventLoopReady: {
				from: "htcap",
				name: "event-loop-ready"
			},
		},
		eventLoop: {
			bufferSize: 10,// number of empty event loop between every new action proceed in the eventLoop
		}
	};
})();
