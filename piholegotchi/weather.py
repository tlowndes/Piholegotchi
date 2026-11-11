"""Weather from Open-Meteo: free, no account or key needed."""
from __future__ import annotations

import logging
from datetime import datetime

import requests

from .screens import Slot, Weather

log = logging.getLogger(__name__)
GEO = "https://geocoding-api.open-meteo.com/v1/search"
FORECAST = "https://api.open-meteo.com/v1/forecast"

# WMO weather codes -> (icon, words)
def kind_of(code: int, day: bool = True) -> tuple[str, str]:
    if code in (0, 1):
        return ("sun" if day else "moon"), ("Sunny" if day else "Clear") if code == 0 else ("Mostly sunny" if day else "Mostly clear")
    if code == 2:
        return ("part" if day else "cloud"), "Some cloud"
    if code == 3:
        return "cloud", "Cloudy"
    if code in (45, 48):
        return "fog", "Foggy"
    if 51 <= code <= 57:
        return "rain", "Drizzle"
    if 61 <= code <= 67 or 80 <= code <= 82:
        return "rain", "Light rain" if code in (61, 80) else "Rain"
    if 71 <= code <= 77 or code in (85, 86):
        return "snow", "Snow"
    if code >= 95:
        return "storm", "Thunder"
    return "cloud", "Cloudy"


def geocode(place: str) -> dict | None:
    """'Bristol' -> {'name': 'Bristol, England', 'lat': .., 'lon': ..} or None."""
    r = requests.get(GEO, params={"name": place, "count": 1, "language": "en"}, timeout=8)
    r.raise_for_status()
    hits = r.json().get("results") or []
    if not hits:
        return None
    h = hits[0]
    region = h.get("admin1") or h.get("country") or ""
    return {"name": f"{h['name']}, {region}" if region and region != h["name"] else h["name"],
            "lat": h["latitude"], "lon": h["longitude"]}


def fetch(lat: float, lon: float, place: str) -> Weather:
    r = requests.get(FORECAST, timeout=8, params={
        "latitude": lat, "longitude": lon, "timezone": "auto", "forecast_days": 2,
        "current": "temperature_2m,apparent_temperature,weather_code,is_day",
        "hourly": "temperature_2m,weather_code,precipitation_probability,is_day",
        "daily": "temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset",
    })
    r.raise_for_status()
    j = r.json()
    cur, hourly, daily = j["current"], j["hourly"], j["daily"]
    now = datetime.fromisoformat(cur["time"])
    kind, desc = kind_of(int(cur["weather_code"]), bool(cur.get("is_day", 1)))

    times = [datetime.fromisoformat(t) for t in hourly["time"]]
    start = next((i for i, t in enumerate(times) if t > now), len(times) - 1)
    slots = [Slot("NOW", kind, cur["temperature_2m"])]
    for k in (start + 2, start + 5, start + 8):        # about +3h, +6h, +9h on the hour
        if k < len(times):
            kk, _ = kind_of(int(hourly["weather_code"][k]), bool(hourly["is_day"][k]))
            slots.append(Slot(times[k].strftime("%H:00"), kk, hourly["temperature_2m"][k]))

    outlook = desc
    for k in range(start, min(start + 12, len(times))):
        if (hourly["precipitation_probability"][k] or 0) >= 50:
            outlook = "Rain now" if k == start else f"Rain from {times[k].strftime('%H:00')}"
            break

    # chance of rain for the rest of today, not the whole day
    today = [hourly["precipitation_probability"][k] or 0 for k in range(max(0, start - 1), len(times))
             if times[k].date() == now.date()]
    rain_left = int(max(today, default=daily["precipitation_probability_max"][0] or 0))

    sunset = datetime.fromisoformat(daily["sunset"][0])
    sunrise_next = datetime.fromisoformat(daily["sunrise"][1])
    sunrise_today = datetime.fromisoformat(daily["sunrise"][0])
    if now < sunrise_today:
        sun_label = f"SUNRISE {sunrise_today:%H:%M}"
    elif now < sunset:
        sun_label = f"SUNSET {sunset:%H:%M}"
    else:
        sun_label = f"SUNRISE {sunrise_next:%H:%M}"

    return Weather(place=place.split(",")[0], temp=cur["temperature_2m"], feels=cur["apparent_temperature"],
                   hi=daily["temperature_2m_max"][0], lo=daily["temperature_2m_min"][0],
                   rain=rain_left, kind=kind, desc=desc,
                   sun_label=sun_label, slots=slots, outlook=outlook)


class WeatherSource:
    def __init__(self, lat: float, lon: float, place: str):
        self.lat, self.lon, self.place = lat, lon, place
        self.configured = bool(place)
        self.last: Weather | None = None

    def get(self) -> Weather | None:
        if not self.configured:
            return None
        try:
            self.last = fetch(self.lat, self.lon, self.place)
        except Exception as e:  # noqa: BLE001 - keep the last good forecast
            log.warning("weather failed: %s", e)
        return self.last
