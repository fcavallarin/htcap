(function () {
	'use strict';
	window.__HTCAP = {
		messageEvent: {
			eventLoopReady: {
				from: "htcap",
				name: "event-loop-ready"
			},
			scheduleNextEvent: {
				from: "htcap",
				name: "schedule-next-event-for-trigger"
			}
		},
		eventLoop: {
			bufferSize: 3,// number of empty event loop between every new action proceed in the eventLoop
		}
	};
})();
