#!/bin/sh
# Keeps the Pi on wifi. Runs as root every minute from piholegotchi-wifi.timer.
# - Power saving off every time (a driver reload turns it back on).
# - Can't reach the router 3 checks running: restart the wifi (then reload the driver).
# - Still nothing after 3 restarts: reboot (at most every 30 minutes).
# Writes what it saw to /var/lib/piholegotchi/wifi.json for the settings page.
DIR=/var/lib/piholegotchi
RUN=/run/piholegotchi-wifi
OUT=$DIR/wifi.json
mkdir -p "$RUN"

get() { cat "$RUN/$1" 2>/dev/null || cat "$DIR/.wifi-$1" 2>/dev/null || echo "${2:-0}"; }
put() { echo "$2" > "$RUN/$1"; }
keep() { echo "$2" > "$DIR/.wifi-$1"; }    # survives a reboot

iw dev wlan0 set power_save off 2>/dev/null
now=$(date +%s)
link=$(iw dev wlan0 link 2>/dev/null)
ssid=$(echo "$link" | sed -n 's/^[[:space:]]*SSID: //p' | head -1 | tr -d '"\\')
signal=$(echo "$link" | sed -n 's/^[[:space:]]*signal: \(-*[0-9]*\).*/\1/p' | head -1)
gw=$(ip route show default 2>/dev/null | awk '/default/ {print $3; exit}')

fails=$(get fails); restarts=$(get restarts); drops=$(get drops); last_drop=$(get last_drop); last_back=$(get last_back)
if [ -n "$gw" ] && ping -c 2 -W 3 "$gw" >/dev/null 2>&1; then
  ok=true
  if [ "$(get down)" = 1 ]; then last_back=$now; keep last_back "$now"; keep down 0; fi
  fails=0; restarts=0
else
  ok=false
  fails=$((fails + 1))
  if [ "$(get down)" != 1 ]; then                # a new drop, not the same one after a restart or reboot
    drops=$((drops + 1)); last_drop=$now
    keep drops "$drops"; keep last_drop "$now"; keep down 1
  fi
  if [ "$fails" -ge 3 ]; then
    up=$(cut -d. -f1 /proc/uptime)
    if [ "$restarts" -ge 3 ] && [ "$up" -gt 1800 ]; then     # not again within 30 min, if the router's just off
      logger -t piholegotchi-wifi "no router after $restarts wifi restarts, rebooting"
      keep reboots "$(( $(get reboots) + 1 ))"
      systemctl reboot
      exit 0
    fi
    restarts=$((restarts + 1)); fails=0
    logger -t piholegotchi-wifi "no router, restarting wifi (try $restarts)"
    if [ "$restarts" -ge 2 ]; then           # the Zero W's wifi chip can lock up: reload its driver
      modprobe -r brcmfmac_wcc brcmfmac 2>/dev/null; sleep 3; modprobe brcmfmac
      sleep 10; iw dev wlan0 set power_save off 2>/dev/null
    elif command -v nmcli >/dev/null 2>&1; then
      nmcli radio wifi off; sleep 5; nmcli radio wifi on
    else
      ip link set wlan0 down; sleep 5; ip link set wlan0 up
    fi
  fi
fi
put fails "$fails"; put restarts "$restarts"

cat > "$OUT.tmp" <<EOF
{"checked": $now, "ok": $ok, "ssid": "$ssid", "signal": ${signal:-null},
 "drops": $drops, "last_drop": $last_drop, "last_back": $last_back,
 "restarts": $restarts, "reboots": $(get reboots), "since": $(get since "$now")}
EOF
[ -f "$DIR/.wifi-since" ] || keep since "$now"
chmod 644 "$OUT.tmp"
mv "$OUT.tmp" "$OUT"
