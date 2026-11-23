// Weather from Open-Meteo: free, no account or key needed.
const { req } = require('./http');

function kindOf(code, day = true) {
  if (code === 0 || code === 1) return [day ? 'sun' : 'moon', code === 0 ? (day ? 'Sunny' : 'Clear') : (day ? 'Mostly sunny' : 'Mostly clear')];
  if (code === 2) return [day ? 'part' : 'cloud', 'Some cloud'];
  if (code === 3) return ['cloud', 'Cloudy'];
  if (code === 45 || code === 48) return ['fog', 'Foggy'];
  if (code >= 51 && code <= 57) return ['rain', 'Drizzle'];
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return ['rain', code === 61 || code === 80 ? 'Light rain' : 'Rain'];
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return ['snow', 'Snow'];
  if (code >= 95) return ['storm', 'Thunder'];
  return ['cloud', 'Cloudy'];
}

async function geocode(place) {
  const j = await req('https://geocoding-api.open-meteo.com/v1/search?' + new URLSearchParams({ name: place, count: 1, language: 'en' }));
  const h = (j.results || [])[0];
  if (!h) return null;
  const region = h.admin1 || h.country || '';
  return { name: region && region !== h.name ? `${h.name}, ${region}` : h.name, lat: h.latitude, lon: h.longitude };
}

const hhmm = (s) => s.slice(11, 16);

async function fetchWeather(lat, lon, place) {
  const j = await req('https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({
    latitude: lat, longitude: lon, timezone: 'auto', forecast_days: 2,
    current: 'temperature_2m,apparent_temperature,weather_code,is_day',
    hourly: 'temperature_2m,weather_code,precipitation_probability,is_day',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset',
  }));
  const { current: cur, hourly: h, daily: d } = j;
  const [kind, desc] = kindOf(+cur.weather_code, !!cur.is_day);
  const now = cur.time;
  let start = h.time.findIndex((t) => t > now);
  if (start < 0) start = h.time.length - 1;
  const slots = [{ label: 'NOW', kind, temp: cur.temperature_2m }];
  for (const k of [start + 2, start + 5, start + 8]) {
    if (k < h.time.length) slots.push({ label: hhmm(h.time[k]).slice(0, 2) + ':00', kind: kindOf(+h.weather_code[k], !!h.is_day[k])[0], temp: h.temperature_2m[k] });
  }
  let outlook = '';
  for (let k = start; k < Math.min(start + 12, h.time.length); k++) {
    if ((h.precipitation_probability[k] || 0) >= 50) { outlook = k === start ? 'RAIN NOW' : `RAIN FROM ${hhmm(h.time[k]).slice(0, 2)}:00`; break; }
  }
  const today = now.slice(0, 10);
  const sunrise0 = d.sunrise[0], sunset = d.sunset[0], sunrise1 = d.sunrise[1];
  const sun = now < sunrise0 ? `SUNRISE ${hhmm(sunrise0)}` : now < sunset ? `SUNSET ${hhmm(sunset)}` : `SUNRISE ${hhmm(sunrise1)}`;
  const rain = Math.max(0, ...h.time.map((t, k) => (t.slice(0, 10) === today && k >= start - 1 ? h.precipitation_probability[k] || 0 : 0)));
  return {
    place: place.split(',')[0], temp: cur.temperature_2m, feels: cur.apparent_temperature,
    hi: d.temperature_2m_max[0], lo: d.temperature_2m_min[0], rain, kind, desc, sun, slots, outlook,
  };
}

module.exports = { geocode, fetchWeather, kindOf };
