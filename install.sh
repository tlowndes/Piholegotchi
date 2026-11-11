#!/usr/bin/env bash
# Sets up Piholegotchi on a Raspberry Pi. Ad stats come from AdGuard Home elsewhere on the network.
set -euo pipefail
cd "$(dirname "$0")"
HERE="$(pwd)"

echo "==> Installing Python packages"
sudo apt-get update -q
sudo apt-get install -y -q python3-pil python3-requests python3-spidev python3-gpiozero python3-lgpio

echo "==> Turning on SPI (the screen talks over it)"
sudo raspi-config nonint do_spi 0

echo "==> Fetching the Waveshare 2.13in V4 driver"
mkdir -p vendor/waveshare_epd
base=https://raw.githubusercontent.com/waveshareteam/e-Paper/master/RaspberryPi_JetsonNano/python/lib/waveshare_epd
for f in __init__.py epdconfig.py epd2in13_V4.py; do
  curl -fsSL "$base/$f" -o "vendor/waveshare_epd/$f"
done

git rev-parse HEAD > piholegotchi/VERSION 2>/dev/null || true

echo "==> Installing the service"
sudo tee /etc/systemd/system/piholegotchi.service >/dev/null <<UNIT
[Unit]
Description=Piholegotchi e-ink screen
After=network-online.target
Wants=network-online.target

[Service]
User=$USER
WorkingDirectory=$HERE
# updates from the settings page land in ~/.config/piholegotchi/app and take priority
Environment=PYTHONPATH=$HOME/.config/piholegotchi/app:$HERE
ExecStart=/usr/bin/python3 -m piholegotchi
# lets the settings page use port 80 without running as root
AmbientCapabilities=CAP_NET_BIND_SERVICE
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable --now piholegotchi
sudo systemctl restart piholegotchi

echo "==> Wifi: power saving off, and a watchdog that restarts it if the router goes missing"
sudo apt-get install -y -q iw
if [ -d /etc/NetworkManager ]; then
  sudo install -d /etc/NetworkManager/conf.d
  sudo install -m 644 image/wifi-powersave-off.conf /etc/NetworkManager/conf.d/piholegotchi-wifi-powersave-off.conf
fi
sudo install -m 755 image/piholegotchi-wifi.sh /usr/local/sbin/piholegotchi-wifi
sudo install -m 644 image/piholegotchi-wifi.service image/piholegotchi-wifi.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now piholegotchi-wifi.timer

echo
echo "Done. Open http://$(hostname).local on your phone or laptop to finish setting up."
