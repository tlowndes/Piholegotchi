#!/usr/bin/env bash
# Builds a Raspberry Pi OS Lite image with Piholegotchi pre-installed.
# Runs on an x86 Linux machine with root (GitHub Actions does this for us):
#
#   sudo apt-get install -y qemu-user-binfmt parted xz-utils e2fsprogs
#   sudo image/build.sh            # -> out/piholegotchi.img.xz
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${WORK:-$REPO/build}"
OUT="${OUT:-$REPO/out}"
BASE_URL="${BASE_URL:-https://downloads.raspberrypi.com/raspios_lite_armhf_latest}"
EXTRA_MB=1024
ROOT="$WORK/root"
mkdir -p "$WORK" "$OUT"

cleanup() {
  set +e
  for m in boot/firmware dev/pts dev proc sys; do umount "$ROOT/$m" 2>/dev/null; done
  umount "$ROOT" 2>/dev/null
  [ -n "${LOOP:-}" ] && losetup -d "$LOOP"
}
trap cleanup EXIT

echo "==> Downloading Raspberry Pi OS Lite (32-bit)"
curl -fL --retry 3 -o "$WORK/base.img.xz" "$BASE_URL"
xz -dc "$WORK/base.img.xz" > "$WORK/piholegotchi.img"
IMG="$WORK/piholegotchi.img"

echo "==> Making room for our packages"
truncate -s +"${EXTRA_MB}M" "$IMG"
parted -s "$IMG" resizepart 2 100%
LOOP=$(losetup -fP --show "$IMG")
e2fsck -pf "${LOOP}p2" || true
resize2fs "${LOOP}p2"

mkdir -p "$ROOT"
mount "${LOOP}p2" "$ROOT"
mount "${LOOP}p1" "$ROOT/boot/firmware"
for m in proc sys dev dev/pts; do mount --bind "/$m" "$ROOT/$m"; done
cp /etc/resolv.conf "$ROOT/etc/resolv.conf.build"
mount --bind /etc/resolv.conf "$ROOT/etc/resolv.conf" 2>/dev/null || cp /etc/resolv.conf "$ROOT/etc/resolv.conf"

echo "==> Installing Python packages inside the image"
chroot "$ROOT" /usr/bin/env DEBIAN_FRONTEND=noninteractive bash -euxc '
  apt-get update
  apt-get install -y --no-install-recommends python3-pil python3-requests python3-spidev \
      python3-gpiozero python3-lgpio avahi-daemon
  apt-get clean
  rm -rf /var/lib/apt/lists/*
'

echo "==> Copying Piholegotchi in"
install -d "$ROOT/opt/piholegotchi"
cp -r "$REPO/piholegotchi" "$ROOT/opt/piholegotchi/"
find "$ROOT/opt/piholegotchi" -name __pycache__ -prune -exec rm -rf {} +
install -d "$ROOT/opt/piholegotchi/vendor/waveshare_epd"
base=https://raw.githubusercontent.com/waveshareteam/e-Paper/master/RaspberryPi_JetsonNano/python/lib/waveshare_epd
for f in __init__.py epdconfig.py epd2in13_V4.py; do
  curl -fsSL --retry 3 "$base/$f" -o "$ROOT/opt/piholegotchi/vendor/waveshare_epd/$f"
done

echo "==> Service user, SPI, hostname"
chroot "$ROOT" bash -euxc '
  id piholegotchi >/dev/null 2>&1 || useradd --system --create-home --home-dir /var/lib/piholegotchi \
      --shell /usr/sbin/nologin --groups spi,gpio piholegotchi
  chmod 700 /var/lib/piholegotchi
'
grep -q '^dtparam=spi=on' "$ROOT/boot/firmware/config.txt" || echo 'dtparam=spi=on' >> "$ROOT/boot/firmware/config.txt"
echo piholegotchi > "$ROOT/etc/hostname"
sed -i 's/\braspberrypi\b/piholegotchi/g' "$ROOT/etc/hosts"

install -m 644 "$REPO/image/piholegotchi.service" "$ROOT/etc/systemd/system/piholegotchi.service"
ln -sf /etc/systemd/system/piholegotchi.service "$ROOT/etc/systemd/system/multi-user.target.wants/piholegotchi.service"

umount "$ROOT/etc/resolv.conf" 2>/dev/null || true
mv "$ROOT/etc/resolv.conf.build" "$ROOT/etc/resolv.conf"

cleanup
trap - EXIT

echo "==> Compressing"
xz -T0 -6 -c "$IMG" > "$OUT/piholegotchi.img.xz"
( cd "$OUT" && sha256sum piholegotchi.img.xz > piholegotchi.img.xz.sha256 )
ls -lh "$OUT"
