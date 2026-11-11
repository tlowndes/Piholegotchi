#!/bin/sh
# Keeps the Pi on wifi. Runs as root every 2 minutes from piholegotchi-wifi.timer.
# Power saving off every time (a driver reload turns it back on), and if the router
# can't be reached three checks running, restart the wifi.
iw dev wlan0 set power_save off 2>/dev/null
gw=$(ip route show default 2>/dev/null | awk '/default/ {print $3; exit}')
state=/run/piholegotchi-wifi.fails
if [ -n "$gw" ] && ping -c 2 -W 3 "$gw" >/dev/null 2>&1; then
  rm -f "$state"
  exit 0
fi
n=$(( $(cat "$state" 2>/dev/null || echo 0) + 1 ))
echo "$n" > "$state"
[ "$n" -lt 3 ] && exit 0
logger -t piholegotchi-wifi "no router for $n checks, restarting wifi"
rm -f "$state"
if command -v nmcli >/dev/null 2>&1; then
  nmcli radio wifi off; sleep 5; nmcli radio wifi on
else
  ip link set wlan0 down; sleep 5; ip link set wlan0 up
fi
