## HTCAP

htcap is a web application scanner able to crawl single page application (SPA) recursively by intercepting ajax calls and DOM changes.

## KEY FEATURES

- Recursive DOM crawling engine
- Discovers ajax/fetch/jsonp/websocket requests
- Supports cookies, proxy, custom headers, http auth and more
- Heuristic page deduplication engine based on text similarities
- Scriptable login sequences
- All findings are saved to sqlite database and can be exported to an interactive html report
- The built-in fuzzers can detect SQL-Injection, XSS, Command Execution, File disclosure and many more
- Can be easly interfaced with Sqlmap, Arachni, Wapiti, Burp and many other tools
- Fuzzers are built on top of a fuzzing framework so they can be easly created/customized
- Fuzzers fully support REST and SOAP payloads (json and xml)
- Both crawler and fuzzers run in a mulithreaded environment
- The report comes with advanced filtering capabilities and workflow tools

## BRIEF

Htcap is not just another vulnerability scanner since it's focused on the crawling process and it's aimed to detect and intercept ajax/fetch calls, websockets, jsonp ecc. It uses its own fuzzers plus a set of external tools to discover vulnerabilities and it's designed to be a tool for both manual and automated penetration test of modern web applications.

It also features a small but powerful framework to quickly develop custom fuzzers with less than 60 lines of python.
The fuzzers can work with GET/POST data, XML and JSON payloads and switch between POST and GET. Of course, fuzzers run in parallel in a multi-threaded environment.

This is the very first release that uses headless chrome instead of phantomjs.
Htcap’s Javascript crawling engine has been rewritten to take advantage of the new async/await features of ecmascript and has been converted to a nodjes module build on top of [Puppeteer](https://github.com/GoogleChrome/puppeteer).

More infos [here](http://www.fcvl.net/htcap).


## DEMO
The video below shows htcap crawling gmail.  
The crawl lasted for many hours and about 3000 XHR request have been captured.  

[![crawling gmail](https://www.fcvl.net/htcap/img/htcap-gmail-video.png)](https://www.youtube.com/watch?v=5FLmWjKE2JI "HTCAP Crawling Gmail")


## SETUP

### Requirements

 1. Python 3.3
 2. Nodejs and npm
 3. Sqlmap (for sqlmap scanner module)
 4. Arachni (for arachni scanner module)

### Local Installation

Install the requirements and run the following:
```console
$ git clone https://github.com/fcavallarin/htcap.git htcap
$ htcap/htcap.py
```

### Docker Installation

Install Docker and run the following:
```console
$ git clone https://github.com/fcavallarin/htcap.git htcap
$ cd htcap
$ docker build -t htcap --build-arg HTCAP_VERSION=master . # replace master by the desired htcap commit hash or branch
$ mkdir -p htcap-out && docker run -v "$(pwd)/htcap-out/":/out/ --rm --name htcap htcap
$ docker exec -it htcap bash
$ htcap # now you can use htcap in the Docker container
```

You can access services listening on the Docker host from within the Docker container using the hostname `host.docker.internal`.
To get the IP for `host.docker.internal`, run the following command inside the Docker container:
```console
getent hosts host.docker.internal | awk '{print $1;}'
```

## DOCUMENTATION

Documentation, examples and demos can be found [here](http://www.fcvl.net/htcap)

## LICENSE

This program is free software; you can redistribute it and/or modify it under the terms of the [GNU General Public License](https://www.gnu.org/licenses/gpl-2.0.html) as published by the Free Software Foundation; either version 2 of the License, or(at your option) any later version.
