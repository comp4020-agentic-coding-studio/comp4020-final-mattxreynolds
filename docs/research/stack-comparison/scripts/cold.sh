#!/bin/bash
D="/mnt/c/Program Files/Docker/Docker/resources/bin/docker.exe"
img=$1; shift
for i in 1 2 3 4 5; do
  "$D" rm -f cs >/dev/null 2>&1
  s=$(date +%s%N)
  "$D" run -d --name cs --init --cpus 0.25 --memory 256m -p 18080:8080 -e PORT=8080 "$@" $img >/dev/null
  until curl -s -o /dev/null -m 1 -w '%{http_code}' localhost:18080/ | grep -q 200; do sleep 0.02; done
  e=$(date +%s%N); echo -n "$(( (e-s)/1000000 )) "
done
echo " ms ($img)"
"$D" rm -f cs >/dev/null 2>&1
