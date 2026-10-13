#!/bin/bash
# usage: rss.sh <port> <pid> ; hits / 300x, holds 50 SSE clients 5s, reports RSS
port=$1; pid=$2
sleep 1
echo "idle: $(grep VmRSS /proc/$pid/status)"
for i in $(seq 1 300); do curl -s localhost:$port/ >/dev/null; done
echo "after300: $(grep VmRSS /proc/$pid/status)"
