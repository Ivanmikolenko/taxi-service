#!/bin/bash

if [ ! -d /app/testcases ]; then
	echo -e "\033[0;31m/app/testcases not found\033[0m"
	exit 1
fi

/opt/bin/entry_point.sh 2>/tmp/selenium.log 1>/tmp/selenium.log &
seleniumpid=$!

python -m http.server -d /app/testcases 8080 2>/dev/null 1>/dev/null &
servpid=$!

# poll selenium health check
while true; do
	result=`curl -s localhost:4444/status | jq -r .value.ready`
	if [ "$result" = "true" ]; then
		break
	fi
	sleep 0.1
done
echo -e "\033[1;33mselenium ready\033[0m"

export SELENIUM_HUB=http://localhost:4444
mkdir -p /app/results
rm -f /app/results/results*

failed=0
for i in `ls /app/testcases | sort -n`; do
	echo -e "\033[1;33mrunning tests for $i/\033[0m"
	xmlresult="/app/results/results_$i.xml"

	TEST_URL=http://localhost:8080/$i pytest /app/solution.py --junitxml=$xmlresult
	if [ ! -e "$xmlresult" ]; then
		echo -e "\033[0;31mtest output not found. pytest failed\033[0m"
		failed=1
		break
	fi 

done

parser.bin /app/results
if [ $? -ne 0 ]; then
	echo -e "\033[0;31mparser returned error\033[0m"
	failed=1
	break
fi
chown -R --reference=/app/testcases /app/results

if [ $failed -eq 0 ]; then
	echo -e "\033[32mtesting finished successfully\033[0m"
fi

kill $seleniumpid
kill $servpid
wait
