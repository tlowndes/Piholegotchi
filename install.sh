#!/usr/bin/env bash
# Sets up Piholegotchi on a Raspberry Pi that already has Pi-hole installed.
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

if [ ! -f /etc/piholegotchi.env ]; then
  echo "==> Creating /etc/piholegotchi.env (edit it next)"
  sudo install -m 600 piholegotchi.env.example /etc/piholegotchi.env
fi

echo "==> Installing the service"
sudo tee /etc/systemd/system/piholegotchi.service >/dev/null <<UNIT
[Unit]
Description=Piholegotchi e-ink screen
After=network-online.target pihole-FTL.service
Wants=network-online.target

[Service]
User=$USER
WorkingDirectory=$HERE
EnvironmentFile=/etc/piholegotchi.env
ExecStart=/usr/bin/python3 -m piholegotchi
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable piholegotchi

echo
echo "Done. Next:"
echo "  1. sudo nano /etc/piholegotchi.env      (add your Pi-hole password and Spotify client ID)"
echo "  2. python3 -m piholegotchi.spotify_auth  (one-off Spotify sign-in)"
echo "  3. sudo systemctl restart piholegotchi"
