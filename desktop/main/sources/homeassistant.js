// Home Assistant: entities on the Home screen (tap to switch), and the doorbell camera.
const { req, dataUrl } = require('./http');

const USEFUL = ['sensor', 'binary_sensor', 'light', 'switch', 'lock', 'climate', 'person', 'device_tracker',
  'media_player', 'fan', 'cover', 'input_boolean', 'weather', 'vacuum', 'alarm_control_panel', 'camera'];
const TOGGLE = ['light', 'switch', 'input_boolean', 'fan'];

const num = (v) => {
  const f = parseFloat(v);
  if (Number.isNaN(f)) return String(v);
  return Math.abs(f) >= 100 || Number.isInteger(f) ? f.toFixed(0) : f.toFixed(1);
};

function describe(s, label = '') {
  const id = s.entity_id || '';
  const domain = id.split('.')[0];
  const a = s.attributes || {};
  const st = String(s.state ?? '');
  label = label || a.friendly_name || id;
  const dc = a.device_class || '';
  const it = (value, kind, on = null) => ({ id, label, value, kind, on, toggle: TOGGLE.includes(domain) });
  if (st === 'unavailable' || st === 'unknown') return it('-', 'other');
  if (TOGGLE.includes(domain)) return it(st.toUpperCase(), domain === 'light' ? 'light' : 'plug', st === 'on');
  if (domain === 'lock') return it(st.toUpperCase(), 'lock', st === 'locked');
  if (domain === 'cover') return it(st.toUpperCase(), 'door', st === 'open');
  if (domain === 'binary_sensor') {
    const on = st === 'on';
    if (['door', 'window', 'opening', 'garage_door'].includes(dc)) return it(on ? 'OPEN' : 'SHUT', 'door', on);
    if (['motion', 'occupancy', 'presence'].includes(dc)) return it(on ? 'MOTION' : 'CLEAR', 'motion', on);
    return it(on ? 'ON' : 'OFF', 'other', on);
  }
  if (domain === 'person' || domain === 'device_tracker') {
    return it({ home: 'HOME', not_home: 'AWAY' }[st] || st.replace(/_/g, ' ').toUpperCase(), 'person', st === 'home');
  }
  if (domain === 'climate') {
    let v = a.current_temperature != null ? `${num(a.current_temperature)}°` : st.toUpperCase();
    if (a.temperature != null && st !== 'off') v += ` > ${num(a.temperature)}°`;
    return it(v, 'climate', !['off', 'idle'].includes(st));
  }
  if (domain === 'media_player') return it(st === 'playing' && a.media_title ? String(a.media_title) : st.toUpperCase(), 'media', st === 'playing');
  if (domain === 'weather') return it(a.temperature != null ? `${num(a.temperature)}°` : st, 'temp');
  let unit = a.unit_of_measurement || '';
  let kind = { temperature: 'temp', humidity: 'humidity', power: 'power', energy: 'power', battery: 'battery' }[dc] || 'other';
  if (unit === '°C' || unit === '°F') { kind = 'temp'; unit = '°'; }
  const v = num(st) + (unit === '°' || unit === '%' ? unit : unit ? ' ' + unit : '');
  return it(unit || /^[-\d]/.test(st) ? v : st.toUpperCase(), kind);
}

class HomeAssistant {
  constructor(url, token) {
    this.url = (url || '').trim().replace(/\/+$/, '');
    this.token = (token || '').trim();
    this.h = { Authorization: `Bearer ${this.token}` };
  }

  get configured() { return !!(this.url && this.token); }

  get(p) { return req(this.url + p, { headers: this.h }); }

  async check() {
    try { await this.get('/api/'); return ''; } catch (e) {
      if (e.status === 401) return "Home Assistant didn't accept that token. Make a new long-lived token and paste it again.";
      return "Can't reach Home Assistant there. Check the address, e.g. http://192.168.1.20:8123";
    }
  }

  async entities() {
    const all = await this.get('/api/states');
    return all.filter((s) => USEFUL.includes((s.entity_id || '').split('.')[0]))
      .map((s) => ({ id: s.entity_id, name: (s.attributes || {}).friendly_name || s.entity_id, value: describe(s).value }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async home(picks) {
    if (!picks || !picks.length) return { items: [], online: true, note: 'PICK SOME THINGS IN SETTINGS' };
    const items = [];
    try {
      for (const p of picks.slice(0, 5)) {
        try { items.push(describe(await this.get(`/api/states/${p.id}`), p.label)); } catch (e) {
          if (e.status === 401) throw e;
          items.push({ id: p.id, label: p.label || p.id, value: 'GONE', kind: 'other' });
        }
      }
    } catch (e) {
      return { items: [], online: false, note: e.status === 401 ? 'TOKEN NOT ACCEPTED' : "CAN'T REACH HOME ASSISTANT" };
    }
    return { items, online: true, note: '' };
  }

  async toggle(entityId) {
    const domain = entityId.split('.')[0];
    if (!TOGGLE.includes(domain)) return;
    await req(`${this.url}/api/services/${domain}/toggle`, { method: 'POST', headers: this.h, body: { entity_id: entityId } });
  }

  async state(entityId) { return (await this.get(`/api/states/${entityId}`)).state; }

  async snapshot(cameraId) { return dataUrl(`${this.url}/api/camera_proxy/${cameraId}`, this.h); }
}

module.exports = { HomeAssistant, describe };
