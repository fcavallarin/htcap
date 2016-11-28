#!/bin/bash

PY="/usr/bin/python"
#THISFILE=$(readlink $0 || echo $0)
CURDIR=$( cd "$(dirname "$(readlink $0 || echo $0)")" ; pwd -P )

# EXPORT="\"$CURDIR/../scripts/htmlreport.py\""
# VULNS="\"$CURDIR/../scripts/vulns.py\""

HTCAP="\"$CURDIR/../htcap.py\""
EXPORT="$HTCAP util report"
VULNS="$HTCAP util lsvuln"
yes=false
requests='link,redirect,form,xhr,jsonp'
cookies=""
excluded=""

function yesno {
	if [ $1 = false ]; then
		read yesno
	else
		yesno="y"
	fi

	echo $yesno
}

if [ $# -lt 1 ];then
	echo "usage "$(basename $0) "[options]" "<host>"
	echo "options:"
	echo "  -r   set request types (default: " $requests ")"
	echo "  -y   say yes to all questions"
	echo "  -c   set cookies"
	echo "  -x   set excluded urls"
	exit 1
fi

while getopts "r:yc:x:" opt; do
    case "$opt" in 
    r)  requests=$OPTARG
        ;;
    y)  yes=true
        ;;
    c)	cookies="-c '$OPTARG'"
		;;
	x)	excluded="-x '$OPTARG'"
		;;
    esac
done
shift $((OPTIND-1))

HOST=$1


OUTFILE=`echo $HOST | sed -E 's/^https?:\/\///' | sed 's/\./_/g' | sed 's/\/.*//g'`

if [ -e "$OUTFILE.db" ];then
	echo -n "$OUTFILE.db already exists. Overwrite it? (y/N): " && $yes && echo "y"
	if [ "$(yesno $yes)" = "y" ]; then
		rm "$OUTFILE.db"
	else
		exit 1
	fi
fi


echo $HTCAP crawl $cookies $excluded $HOST $OUTFILE.db | xargs $PY || exit 1
echo -n "Run arachni? (y/N): " && $yes && echo "y"
if [ "$(yesno $yes)" = "y" ]; then
	echo $HTCAP scan -r $requests arachni $OUTFILE.db | xargs $PY || exit 1
fi
echo -n "Run sqlmap? (y/N): " && $yes && echo "y"
if [ "$(yesno $yes)" = "y" ]; then
	echo $HTCAP scan -r $requests sqlmap $OUTFILE.db | xargs $PY || exit 1
fi
echo 

if [ "`echo $VULNS $OUTFILE.db | xargs $PY`" = "" ];then
	echo "No vulnerabilities found"
else
	echo "Detected vulnerabilities:"
	/bin/bash -c 'sqlite3 -version' > /dev/null 2>&1 
	if [ $? = 0 ]; then
		echo "SELECT '  Type: ',type, ', found ',count(type) FROM vulnerability GROUP BY type ORDER BY count(type) DESC;" | sqlite3 -separator "" $OUTFILE.db
	else 
		echo "  Warning: unable to run sqlite3 command"
	fi
	echo
fi

rm "$OUTFILE".html 2> /dev/null
echo $EXPORT $OUTFILE.db $OUTFILE.html | xargs $PY

opener=""
while [ "$opener" = "" ];do 
	echo -n "Open $OUTFILE.html with command (^C to abort): "
	read opener
	if [ "$opener" != "" ];then
		$opener "$OUTFILE".html
	fi
done

exit 0
