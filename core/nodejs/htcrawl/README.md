## HTCRAWL

Htcrawl is nodejs module for the recursive crawling of single page applications (SPA) using javascript.  
It uses headless chrome to load and analyze web applications and it's build on top of Puppetteer from wich it inherits all the functionalities.

With htcrawl you can roll your own DOM-XSS scanner with less than 60 lines of javascript!!

More infos at [htcrawl.org](http://htcrawl.org).


## SAMPLE USAGE

```javascript
const htcrawl = require('htcrawl');
const crawler = await htcrawl.launch("https://htcrawl.org");

// Print out the url of ajax calls
crawler.on("xhr", e => {
  console.log("XHR to " + e.params.request.url);
});

// Start crawling!
crawler.start();

```


## DOCUMENTATION

API documentation can be found at [https://htcrawl.org/api/](https://htcrawl.org/api/).


## LICENSE

This program is free software; you can redistribute it and/or modify it under the terms of the [GNU General Public License](https://www.gnu.org/licenses/gpl-2.0.html) as published by the Free Software Foundation; either version 2 of the License, or(at your option) any later version.


## ABOUT

Written by Filippo Cavallarin. This project is son of Htcap (https://github.com/fcavallarin/htcap | https://htcap.org).