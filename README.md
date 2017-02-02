## HTCAP

Htcap is a web application scanner able to crawl single page application (SPA) in a recursive manner by intercepting ajax calls and DOM changes.  
Htcap is not just another vulnerability scanner since it's focused mainly on the crawling process and uses external tools to discover vulnerabilities. It's designed to be a tool for both manual and automated penetration test of modern web applications.

More infos at [htcap.org](http://htcap.org).

## SETUP

### Requirements

 1. Python 2.7
 2. PhantomJS v2
 3. Sqlmap (for sqlmap scanner module)
 4. Arachni (for arachni scanner module)

### Download and Run

```console
$ git clone https://github.com/segment-srl/htcap.git htcap
$ htcap/htcap.py
```

PhantomJs can be downloaded [here](http://phantomjs.org//download.html). It comes as a self-contained executable with all libraries linked statically, so there is no need to install or compile anything else.  


## DOCUMENTATION

Documentation, examples and demos can be found at the official website [http://htcap.org](http://htcap.org).

## LICENCE

This program is free software; you can redistribute it and/or modify it under the terms of the [GNU General Public License](https://www.gnu.org/licenses/gpl-2.0.html) as published by the Free Software Foundation; either version 2 of the License, or(at your option) any later version.