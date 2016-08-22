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
When the database is populated (at least with crawing data), it's possible to explore it with  
ready-available tools such as sqlite3 or DBEaver or export the results in various formats using the  
built-in scripts.

## QUICK START

Let's assume that we have to perform a penetration test against target.local, first we crawl the  
site:

```console
$ htcap/htcap.py crawl target.local target.db
```

Once the crawl is done, the database (target.db) will contain all the requests discovered by the  
crawler. To explore/export the database we can use the built-in scripts or ready available tools.  
For example, to list all discovered ajax calls we can use a single shell command:

```console
$ echo "SELECT method,url,data FROM request WHERE type = 'xhr';" | sqlite3 target.db
```

Now that the site is crawled it's possible to launch several vulnerability scanners against the  
requests saved to the database. A scanner is an external program that can fuzz requests to spot  
security flaws.

Htcap uses a modular architecture to handle different scanners and execute them in a multi-threaded  
environment. For example we can run ten parallel instances of sqlmap against saved ajax requests  
with the following command:

```console
$ htcap/htcap.py scan -r xhr -n 10 sqlmap target.db
```

Htcap comes with sqlmap and arachni modules built-in.  
Sqlmap is used to discover SQL-Injection vulnerabilities and arachni is used to discover XSS, XXE,  
Code Executions, File Inclusions ecc.  
Since scanner modules extend the BaseScanner class, they can be easly created or modified (see the  
section "Writing Scanner Modules" of this manual).

Htcap comes with several standalone scripts to export the crawl and scan results.  
For example we can generate an interactive report containing the relevant informations about  
website/webapp with the command below.  
Relevant informations will include, for example, the list of all pages that trigger ajax calls or  
websockets and the ones that contain vulnerabilities.

```console
$ htcap/scripts/htmlreport.py target.db target.html
```

To scan a target with a single command use/modify the quickscan.sh script.

```console
$ htcap/scripts/quickscan.sh https://target.local
```

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

Alternatively you can download the latest zip [here](https://github.com/segment-srl/htcap/archive/master.zip).

PhantomJs can be downloaded [here](http://phantomjs.org//download.html). It comes as a self-contained executable with all libraries linked  
statically, so there is no need to install or compile anything else.  
Htcap will search for phantomjs executable in the locations listed below and in the paths listed in  
$PATH environment varailbe:

 1. ./
 2. /usr/bin/
 3. /usr/local/bin/
 4. /usr/share/bin/

To install htcap system-wide:

```console
# mv htcap /usr/share/
# ln -s /usr/share/htcap/htcap.py /usr/local/bin/htcap
# ln -s /usr/share/htcap/scripts/htmlreport.py /usr/local/bin/htcap_report
# ln -s /usr/share/htcap/scripts/quickscan.sh /usr/local/bin/htcapquick

```

## DEMOS

You can find an online demo of the html report [here](http://htcap.org/scanme/report.html) and a screenshot of the database view [here](http://htcap.org/scanme/db_screen.png)  
You can also explore the test pages [here](http://htcap.org/scanme/) to see from what the report has been generated. They also  
include a page to [test ajax recursion](http://htcap.org/scanme/ng/).

## EXPLORING DATABASE

In order to read the database it's possible to use the built-in scripts or any ready-available  
sqlite3 client.

### BUILT-IN SCRIPT EXAMPLES

Generate the html report. (demo report available [here](http://htcap.org/scanme/report.html))

```console
$ htcap/scripts/htmlreport.py target.db target.html
```

List all pages that trigger ajax requests:

```console
$ htcap/scripts/ajax.py target.db
    Request ID: 6
    Page URL:   http://target.local/dashboard
    Referer:    http://target.local/
    Ajax requests:
      [BUTTON txt=Statistics].click() -> GET http://target.local/api/get_stats

```

List all discovered SQL-Injection vulnerabilities:

```console
$ htcap/scripts/vulns.py target.db "type='sqli'"
    C O M M A N D
    python /usr/local/bin/sqlmap --batch -u http://target.local/api/[...]

    D E T A I L S
    Parameter: name (POST)
        Type: error-based
        Title: PostgreSQL AND error-based - WHERE or HAVING clause
        Payload: id=1' AND 4163=CAST [...]
        [...]

```

### QUERY EXAMPLES

Search for login forms

```console
SELECT referer, method, url, data FROM request WHERE type='form' AND (url LIKE '%login%' OR data LIKE '%password%')
```

Search inside the pages html

```console
SELECT url FROM request WHERE html LIKE '%upload%' COLLATE NOCASE
```

## AJAX CRAWLING

Htcap features an algorithm able to crawl ajax-based pages in a recursive manner.  
The algorithm works by capturing ajax calls, mapping DOM changes to them and repeat the process  
recursively against the newly added elements.  
When a page is loaded htcap starts by triggering all events and filling input values in the aim to  
to trigger ajax calls. When an ajax call is detected, htcap waits until it is completed and the  
relative callback is called; if, after that, the DOM is modified, htcap runs the same algorithm  
against the added elements and repeats it until all the ajax calls have been fired.

```console
 _________________
|                 |
|load page content|
'--------,--------'
         |
         |
         |
 ________V________
|  interact with  |
|  new content    |<-----------------------------------------+
'--------,--------'                                          |
         |                                                   |
         |                                                   |
         |                                                   | YES
   ______V______             ________________          ______l_____
 /     AJAX      \ YES      |                |       /    CONTENT   \
{    TRIGGERED?   }-------->|   wait ajax    |----->{    MODIFIED?   }
 \ ______ ______ /          '----------------'       \ ______ _____ /
         | NO                                                | NO 
         |                                                   |
         |                                                   |
 ________V________                                           |
|                 |                                          |
|     return      |<-----------------------------------------+
'-----------------'


```

## COMMAND LINE ARGUMENTS



```console
$ htcap crawl -h
usage: htcap [options] url outfile
Options: 
  -h               this help
  -w               overwrite output file
  -q               do not display progress informations
  -v               be verbose
  -m MODE          set crawl mode:
                      - passive: do not intract with the page
                      - active: trigger events
                      - aggressive: also fill input values and crawl forms (default)
  -s SCOPE         set crawl scope
                      - domain: limit crawling to current domain (default)
                      - directory: limit crawling to current directory (and subdirecotries) 
                      - url: do not crawl, just analyze a single page
  -D               maximum crawl depth (default: 100)
  -P               maximum crawl depth for consecutive forms (default: 10)
  -F               even if in aggressive mode, do not crawl forms
  -H               save HTML generated by the page
  -d DOMAINS       comma separated list of allowed domains (ex *.target.com)
  -c COOKIES       cookies as json or name=value pairs separaded by semicolon
  -C COOKIE_FILE   path to file containing COOKIES 
  -r REFERER       set initial referer
  -x EXCLUDED      comma separated list of urls to exclude (regex) - ie logout urls
  -p PROXY         proxy string protocol:host:port -  protocol can be 'http' or 'socks5'
  -n THREADS       number of parallel threads (default: 10)
  -A CREDENTIALS   username and password used for HTTP authentication separated by a colon
  -U USERAGENT     set user agent
  -t TIMEOUT       maximum seconds spent to analyze a page (default 300)
  -S               skip initial url check
  -G               group query_string parameters with the same name ('[]' ending excluded)
  -N               don't normalize URL path (keep ../../)
  -R               maximum number of redirects to follow (default 10)
  -I               ignore robots.txt
  -O               dont't override timeout functions (setTimeout, setInterval)



```

### Crawl Modes

Htcap supports three scan modes: passive, active and aggressive.  
When in passive mode, htcap do not interacts with the page, this means that no events are triggered  
and only links are followed. In this mode htcap acts as a very basic web crawler that collects only  
the links found in the page (A tags). This simulates a user that just clicks on links.  
The active mode behaves like the passive mode but it also triggers all discovered events. This  
simulates a user that interact with the page without filling input values.  
The aggressive mode makes htcap to also fill input values and post forms. This simulates a user  
that performs as many actions as possible on the page.

Crawl http://www.target.local trying to be as stealth as possible

```console
$ htcap/htcap.py crawl -m passive www.target.local target.db
```

### Crawl Scope

Htcap limits the crawling process to a specific scope. Available scopes are: domain, directory and  
url.  
When scope is set to domain, htcap will crawl the domain of the taget only, plus the  
allowed_domains (-d option).  
If scope is directory, htcap will crawl only the target directory and its subdirectories and if the  
scope is url, htcap will not crawl anything, it just analyzes a single page.  
The excluded urls (-x option) are considered out of scope, so they get saved to database but not  
crawled.

Crawl all discovered subdomains of http://target.local plus http://www.target1.local starting from  
http://www.target.local

```console
$ htcap/htcap.py crawl -d '*.target.local,www.target1.local' www.target.local target.db
```

Crawl the directory admin and never go to the upper directory level

```console
$ htcap/htcap.py crawl -s directory www.target.local/admin/ target.db
```

### Excluded Urls

It's possible to exclude some urls from crawling by providing a comma separated list of regular  
expression. Excluded urls are considered out of scope.

```console
$ htcap/htcap.py crawl -x '.*logout.*,.*session.*' www.target.local/admin/ target.db
```

### Crawl depth

htcap is designed to limit the crawl depth to a specific threshold.  
By default there are two depth limits, one for general crawling (-D) and the other for sequential  
post request (-P).

### Cookies

Cookies can be specified both as json and as string and can be passed as commandline option or  
inside a file.  
The json must be set as follow, and only the 'name' and 'value' properties are mandatory.

```console

[  
   {  
      "name":"session",
      "value":"eyJpdiI6IkZXV1J",
      "domain":"target.local",
      "secure":false,
      "path":"/",
      "expires":1453990424,
      "httponly":true
   },
   {  
      "name":"version",
      "value":"1.1",
      "domain":"target.local",
      "secure":false,
      "path":"/",
      "expires":1453990381,
      "httponly":true
   }
]

```

The string format is the classic list of name=value pairs separated by a semicolon:

```console
session=eyJpdiI6IkZXV1J; version=1.1
```

A quick note about encoding: if cookies are passed as string their value gets url-decoded. This  
means that to put, for example, a semicolon into the cookie value it must be urlencoded.

```console
$ htcap/htcap.py crawl -c 'session=someBetter%3BToken; version=1' www.target.local/admin/ target.db'
```

```console
$ htcap/htcap.py crawl -c '[{name:"session",value:"someGood;Token"}]' www.target.local/admin/ target.db'
```

```console
$ htcap/htcap.py crawl -C cookies.json www.target.local/admin/ target.db'
```

## DATABASE STRUCTURE

Htcap's database is composed by the tables listed below

```console
CRAWL_INFO                   Crawl informations
REQUEST                      Contains the requests discovered by the crawler
REQUEST_CHILD                Relations between requests
ASSESSMENT                   Each scanner run generates a new assessment
VULNERABILITY                Vulnerabilities discovered by an assessment
```

### The CRAWL_INFO Table

The CRAWL_INFO table contains the informations about the crawl and, since each crawl has its own  
database, it contains one row only. It's composed by the following fields:

```console
HTCAP_VERSION                Version of htcap
TARGET                       Target URL
START_DATE                   Crawl start date
END_DATE                     Crawl end date
COMMANDLINE                  Crawler commandline options
USER_AGENT                   User-agent set by the crawler
```

### The REQUEST Table

The REQUEST table contains all the requests discovered by the crawler.  
It's composed by the following fields:

```console
ID                           Id of the request
ID_PARENT                    Id of the parent request
TYPE                         The type of the request 
METHOD                       Request method
URL                          Request URL
REFERER                      Referer URL
REDIRECTS                    Number of redirects ahead of this page
DATA                         POST data
COOKIES                      Cookies as json
HTTP_AUTH                    Username:password used for basic http authentication
OUT_OF_SCOPE                 Equal to 1 if the URL is out of crawler scope
TRIGGER                      The html element and event that triggered the request 
CRAWLED                      Equal to 1 if the request has been crawled
CRAWLER_ERRORS               Array of crawler errors as json
HTML                         HTML generated by the page
```

The parent request is the request from wich the main request has been generated. For example, each  
request inherits the cookies from the parent.  
Consider that the crawler follows just one path, this means that if page A is linked from page B  
and page C, the crawler will load page A as if the navigation comes from page B but not from page  
C. To save all the connections between pages, the crawler uses a separate table.  
This table, called REQUEST_CHILD, contains the following fields:

```console
ID_REQUEST                   Id of the parent request
ID_CHILD                     Id of the child request
```

By combining these two tables it's possible to rebuild the whole site structure.

### The ASSESSMENT Table

Each scaner run generates a new record in this table to save the scanning informations, so  
basically an assessment is considered the execution of a scanner module.  
It contains the following fields:

```console
ID                           Id of the assessment
SCANNER                      The name of the scanner
START_DATE                   Scan start date
END_DATE                     Scan end date
```

### The VULNERABILITY Table

The VULNERABILITY table contains all the vulnerabilities discovered by the various assessments. It  
contains the following fields:

```console
ID                           Id of the vulnerability
ID_ASSESSMENT                Id of the assessment to which it belongs to
ID_REQUEST                   Id of the request that has been scanned
TYPE                         vulnerability type (see vulntypes)
DESCRIPTION                  Description of the vulnerability
```

## WRITING SCANNER MODULES

Each scanner module is a python class that extends the BaseScanner class and overrides the  
following methods:

 - init
 - get_settings
 - get_cmd
 - scanner_executed

Basically the execution process of a scanner is as follow:

 1. Scanner is initalized by the parent class by calling the get_settings and init methods
 2. The parent class calls the get_cmd method to get the command to execute for the given request
 3. Once the command returns, the parent class passes the the output to the scanner module by calling  
    the scanner_executed method.
 4. The scanner_executed method parses the command output and saves the result to the database by  
    calling the save_vulnerability method.

### Basic Module Example

```console

[...]
from core.scan.base_scanner import BaseScanner

class Curl(BaseScanner):
  def init(self, argv):
    pass
  
  def get_settings(self):
    return dict(
      request_types = "link,redirect", 
      num_threads = 10,
      process_timeout = 20,
      scanner_exe = "/usr/bin/env curl"
    )

  def get_cmd(self, request, tmp_dir):
    cmd = ["-I", request.url]    
    return cmd

  def scanner_executed(self, request, out, err, tmp_dir, cmd):
    if not re.search("^X-XSS-Protection\:", out, re.M):
      type  = "xss-portection-missing"
      descr = "X-XSS-Protection header is not set"
      self.save_vulnerability(request, type, descr)

```

### Adding A Module

To add a scanner module called, for example, myscanner follow these steps:

 1. Create a file named myscanner.py inside core/scan/scanners/
 2. Inside that file create Myscanner class that overrides BaseScanner
 3. Override methods and adjust settings

To execute myscanner run the following command:

```console
$ htcap/htcap.py scan myscanner target.db
```

### URL Uniqueness

One of the biggest problem when scanning a webapplication is how to determine the uniqueness of a  
page. Modern web applications usually use the same page to generate different contents based to the  
url parameters or patterns. A vulnerability scanner don't need to analyze the same page just  
because its content has changed.  
In the aim to solve this problem, or at least reduce its impact, htcap implements an algorithm for  
url comparision that can let scanner modules skip "duplicated" urls.  
Inside the get_cmd method it's possbile to implement this feature using the code below.

```console

if self.is_request_duplicated(request):
    return False

```

The algorithm is extreamely simple, it just removes the values from parameters and it sorts  
them alphabetically; for example http://www.test.local/a/?c=1&amp;a=2&amp;b=3 becames  
http://www.test.local/a/?a=&amp;b=&amp;c= .  
A good idea would be the use of the SimHash algorithm but lots of tests are needed.  
In case of POST requests the same algorithm is also applied to the following payloads:
 1. URL-Encoded
 2. XML
 3. JSON

### Detailed Module Example:

```console

[...]
from core.scan.base_scanner import BaseScanner

class CustomScanner(BaseScanner):

  def init(self, argv):
    """ 
    custom initializer
    the first argument is an array of command line arguments (if any) passed to the scanner
    """
    if argv[0] == "-h":
      print "usage: ...."
      self.exit(0)

  

  def get_settings(self):
    """ 
    scanner settings 
    """

    return dict(      
      request_types = "xhr,link,redirect,form,jsonp", # request types to analyze
      num_threads = 10, # number of parallel commands to execute
      process_timeout = 180, # command execution timeout
      scanner_exe = "/usr/bin/customscanner"
    )


  def get_cmd(self, request, tmp_dir):
    """ 
    this method is called by the parent class to get the command to execute
    the first argument is the Request object containing the url, the cookies ecc
    the second argument is the path to the temporary dir used to store output files ecc
    """   

    if self.is_request_duplicated(request):
        return False

    out_file = tmp_dir + "/output"
    cmd = [      
      "--url", request.url,
      "--out", out_file     
      ]
    
    # return False to skip current request
    #return False

    return cmd


  def scanner_executed(self, request, out, err, tmp_dir, cmd):
    """ 
    this method is called when the execution of a command is completed
    the first argument is the Request object used to generate the command
    the second and the third are the output and the error returned by the command
    the forth argumnt is the path to the temporary dir used by the command
    the fifth argument is the command executed
    """
    
    out_file = tmp_dir + "/output"

    with open(out_file,'r') as file:
      output = file.read()
    
    # parse output
    ......

    for vulnerability in report:
      # request, type, description
      self.save_vulnerability(request, "sqli", vulnerability)

```

### Scan scope

Scanner modules analyze only in-scope requests. If the crawler scope is set to "url", any  
discovered request will be considered out of scope, including ajax requests, jsonp ecc.  
For example if target.local/foo/bar.php has been crawled with scope set to "url" and it contains  
ajax request to target.local/foo/ajax.php, they won't be scanned. With a simple query it's possible  
to make those request visible to scanners.

```console
UPDATE request set out_of_scope=0 where type in ('xhr','websocket','jsonp')
```

