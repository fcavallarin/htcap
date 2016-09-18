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
	echo "  -y   answare yes to all questions"
	exit 1
fi


while getopts "r:y" opt; do
    case "$opt" in 
    r)  requests=$OPTARG
        ;;
    y)  yes=true
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


echo $HTCAP crawl $HOST $OUTFILE.db | xargs $PY || exit 1
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
	echo "! VULNERABILITIES FOUND !"
fi

rm "$OUTFILE".html 2> /dev/null
echo $EXPORT $OUTFILE.db $OUTFILE.html | xargs $PY

echo

opener=""
while [ "$opener" = "" ];do 
	echo -n "Open $OUTFILE.html with command (^C to abort): "
	read opener
	if [ "$opener" != "" ];then
		$opener "$OUTFILE".html
	fi
done

exit 0
