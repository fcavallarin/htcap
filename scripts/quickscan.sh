#!/bin/bash

PY="/usr/bin/python"
#THISFILE=$(readlink $0 || echo $0)
CURDIR=$( cd "$(dirname "$(readlink $0 || echo $0)")" ; pwd -P )

EXPORT="\"$CURDIR/../scripts/htmlreport.py\""
VULNS="\"$CURDIR/../scripts/vulns.py\""

HTCAP="\"$CURDIR/../htcap.py\""

if [ $# -lt 1 ];then
	echo "usage "$(basename $0) "<host>"
	exit 1
fi

HOST=$1
OUTFILE=`echo $HOST | sed -E 's/^https?:\/\///' | sed 's/\./_/g' | sed 's/\/.*//g'`	

if [ -e "$OUTFILE.db" ];then
	echo -n "$OUTFILE.db already exists. Overwrite it? (y/N): "
	read yesno
	if [ "$yesno" = "y" ]; then
		rm "$OUTFILE.db"
	else
		exit 1
	fi
fi


echo $HTCAP crawl $HOST $OUTFILE.db | xargs $PY || exit 1
echo -n "Run arachni? (y/N): "
read yesno
if [ "$yesno" = "y" ]; then
	echo $HTCAP scan arachni $OUTFILE.db | xargs $PY || exit 1
fi
echo -n "Run sqlmap? (y/N): "
read yesno
if [ "$yesno" = "y" ]; then
	echo $HTCAP scan sqlmap $OUTFILE.db | xargs $PY || exit 1
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
