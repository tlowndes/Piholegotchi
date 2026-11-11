# Piholegotchi

An old Pwnagotchi, rebuilt as a face for my network's ad blocker.

A Raspberry Pi Zero W sits on the shelf and reads stats from [AdGuard Home](https://adguard.com/en/adguard-home/overview.html), which runs on a ZimaOS home server. Its 2.13in e-ink screen shows two things:

- **Sleeve** while Spotify is playing: the album cover, dithered to 1-bit, with track, artist and progress.
- **Muncher** the rest of the time: a small creature that eats the ads AdGuard Home blocks. Its mood follows the day's block rate.

<p>
  <img src="docs/screens/sleeve-playing.png" width="375" alt="Sleeve screen: dithered album art beside track title, artist and a progress bar">
  <img src="docs/screens/muncher-stuffed.png" width="375" alt="Muncher screen: a round creature chewing ads beside the count of ads blocked today">
</p>

## Design

The panel is 250 × 122 pixels, black or white, with no greys. Every screen is drawn at that native size, so what you see above is exactly what the panel shows, scaled up 3×.

- **Type.** Silkscreen for small caps labels, VT323 for secondary lines, Space Grotesk Bold for the big numbers and titles. All three hold up when thresholded to 1-bit.
- **Album art.** Atkinson dithering. It keeps more white than Floyd–Steinberg, so covers stay light and readable on paper-white e-ink.
- **Refresh.** E-ink flashes black and white on a full refresh. The progress bar uses quick partial refreshes every 10 seconds, and a full refresh only happens on a track change, a mood change, or every 30 partials to clear ghosting.
- **Switching.** When Spotify stops, a paused track stays up for 2 minutes, then Muncher takes over.
- **Stats.** Muncher counts what AdGuard Home blocked over its stats window (24 hours by default), checked every 5 minutes.

### Muncher's moods

| Block rate | Mood | |
|---|---|---|
| under 12% | Hungry | <img src="docs/screens/muncher-hungry.png" width="250" alt="Hungry: wide eyes, empty mouth"> |
| 12–22% | Content | <img src="docs/screens/muncher-content.png" width="250" alt="Content: happy eyes, chewing"> |
| over 22% | Stuffed | <img src="docs/screens/muncher-stuffed.png" width="250" alt="Stuffed: happy eyes, ads flying in"> |
| AdGuard down | Asleep | <img src="docs/screens/muncher-asleep.png" width="250" alt="Asleep: closed eyes, Zzz"> |

## Hardware

- Raspberry Pi Zero W (the Pwnagotchi board)
- Waveshare 2.13in e-Paper HAT, **V4**
- A microSD card, 8 GB or more

## Setup

### 1. Flash the SD card

1. Install [Raspberry Pi Imager](https://www.raspberrypi.com/software/) on your computer.
2. **Device:** Raspberry Pi Zero (or Zero 2 W, whichever yours is).
3. **OS:** Raspberry Pi OS (other) → **Raspberry Pi OS Lite (32-bit)**.
4. When it offers to edit settings, say yes:
   - Hostname: `piholegotchi`
   - Username and password: your choice
   - Wi-Fi: your network name and password, country GB
   - Services: turn on **SSH** with password login
5. Write the card, put it in the Pi, power it up and give it a few minutes.

### 2. Log in

From a terminal on your computer:

```sh
ssh yourname@piholegotchi.local
```

### 3. Install Piholegotchi

```sh
sudo apt-get install -y git
git clone https://github.com/tlowndes/piholegotchi.git
cd piholegotchi
./install.sh
```

### 4. Make a Spotify app

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) and log in.
2. **Create app.** Any name and description.
3. **Redirect URI:** `http://127.0.0.1:8888/callback`
4. Tick **Web API**, then save.
5. Copy the **Client ID**.

### 5. Add your details

```sh
sudo nano /etc/piholegotchi.env
```

Fill in:

- `ADGUARD_URL`: the address you open AdGuard Home's dashboard on, including the port, e.g. `http://192.168.1.20:3000`
- `ADGUARD_USERNAME` and `ADGUARD_PASSWORD`: the dashboard login
- `SPOTIFY_CLIENT_ID`: from step 4

Save with Ctrl-O, Enter, Ctrl-X.

### 6. Sign in to Spotify (once)

```sh
python3 -m piholegotchi.spotify_auth
```

It prints a link. Open it on your phone or laptop and approve. You'll land on a page that doesn't load, which is expected. Copy that page's full address and paste it back into the terminal.

### 7. Start it

```sh
sudo systemctl restart piholegotchi
```

It starts by itself on every boot from now on.

## Handy commands

```sh
journalctl -u piholegotchi -f       # watch the logs
sudo systemctl stop piholegotchi    # stop (leaves a sleeping face on screen)
python3 -m piholegotchi.preview     # render every screen to ./preview, no hardware needed
python3 -m piholegotchi --png       # run the live loop, writing live.png instead of the panel
```

## Credits

Fonts are under the SIL Open Font License, see `piholegotchi/fonts/`. The e-ink driver is fetched from [Waveshare's e-Paper repo](https://github.com/waveshareteam/e-Paper) at install time.
