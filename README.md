## HTCAP

Htcap is a web application scanner able to crawl single page application (SPA) in a recursive manner by intercepting ajax calls and DOM changes.
Htcap is not just another vulnerability scanner since it's focused on the crawling process and it's aimed to detect and intercept ajax/fetch calls, websockets, jsonp ecc. It uses its own fuzzers plus a set of external tools to discover vulnerabilities and it's designed to be a tool for both manual and automated penetration test of modern web applications.

It also features a small but powerful framework to quickly develop custom fuzzers with less than 60 lines of python.
The fuzzers can work with GET/POST data, XML and JSON payloads and switch between POST and GET. Of course, fuzzers run in parallel in a multi-threaded environment.

This is the very first release that uses headless chrome instead of phantomjs.
Htcap’s Javascript crawling engine has been rewritten to take advantage of the new async/await features of ecmascript and has been converted to a nodjes module build on top of [Puppetteer](https://github.com/GoogleChrome/puppeteer).

More infos at [htcap.org](http://htcap.org).

## SETUP

### Requirements

 1. Python 2.7
 2. Nodejs and npm
 3. Sqlmap (for sqlmap scanner module)
 4. Arachni (for arachni scanner module)

### Download and Run

```console
$ git clone https://github.com/fcavallarin/htcap.git htcap
$ htcap/htcap.py
```

## DOCUMENTATION

Documentation, examples and demos can be found at the official website [https://htcap.org](https://htcap.org).

## LICENSE

This program is free software; you can redistribute it and/or modify it under the terms of the [GNU General Public License](https://www.gnu.org/licenses/gpl-2.0.html) as published by the Free Software Foundation; either version 2 of the License, or(at your option) any later version.
