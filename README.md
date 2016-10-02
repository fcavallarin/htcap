## HTCAP

htcap is a web application scanner able to crawl single page application (SPA) in a recursive  
manner by intercepting ajax calls and DOM changes.  
Htcap is not just another vulnerability scanner since it's focused mainly on the crawling process  
and uses external tools to discover vulnerabilities. It's designed to be a tool for both manual and  
automated penetration test of modern web applications.

The scan process is divided in two parts, first htcap crawls the target and collects as many  
requests as possible (urls, forms, ajax ecc..) and saves them to a sql-lite database. When the  
crawling is done it is possible to launch several security scanners against the saved requests and  
save the scan results to the same database.  
When the database is populated (at least with crawing data), it's possible to generate an interactive  
report of the findings or use ready-available tools such as sqlite3 or DBEaver to explore the database.


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

PhantomJs can be downloaded [here](http://phantomjs.org//download.html). It comes as a self-contained executable with all libraries linked  
statically, so there is no need to install or compile anything else.  


## DOCUMENTATION

Documentation, examples and demos can be found at the official website [http://htcap.org](http://htcap.org).