// AdGuard Home on the ZimaOS server: stats, pausing, eating links, and who's on the network.
const { req, basic } = require('./http');

class AdGuard {
  constructor(url, user, pass) {
    this.base = (url || '').replace(/\/+$/, '') + '/control';
    this.headers = basic(user, pass);
    this.configured = !!url;
  }

  get(p) { return req(this.base + p, { headers: this.headers, timeout: 6000 }); }
  post(p, body) { return req(this.base + p, { method: 'POST', body, headers: this.headers, timeout: 6000 }); }

  async stats() {
    let s, status;
    try {
      [s, status] = await Promise.all([this.get('/stats'), this.get('/status')]);
    } catch (e) {
      return { online: false, note: 'ADGUARD IS DOWN', total: 0, blocked: 0, percent: 0, hours: [], top: [] };
    }
    const total = +s.num_dns_queries || 0;
    const blocked = (+s.num_blocked_filtering || 0) + (+s.num_replaced_safebrowsing || 0) + (+s.num_replaced_parental || 0);
    const percent = total ? (blocked / total) * 100 : 0;
    const top = (s.top_blocked_domains || []).slice(0, 5).map((d) => Object.entries(d)[0]).filter(Boolean)
      .map(([name, n]) => ({ name, n: +n }));
    // per-hour blocked counts, oldest first; keep today's hours
    let hours = [], today = null;
    const per = s.blocked_filtering;
    if (Array.isArray(per) && per.length) {
      if (s.time_units === 'days') today = +per[per.length - 1];
      else {
        const h = new Date().getHours();
        hours = per.slice(-(h + 1)).map(Number);
        today = hours.reduce((a, b) => a + b, 0);
      }
    }
    const out = { online: true, note: '', total, blocked, percent, today, hours, top };
    if (status.protection_enabled === false) {
      out.online = false;
      const left = (+status.protection_disabled_duration || 0) / 1000;
      if (left > 0) { out.note = 'BLOCKING PAUSED'; out.paused_until = Date.now() + left * 1000; }
      else out.note = 'BLOCKING IS OFF';
    }
    return out;
  }

  async protect(on, minutes = 0) {
    const body = { enabled: on };
    if (!on && minutes) body.duration = minutes * 60000;
    try {
      await this.post('/protection', body);
    } catch (e) {
      if (e.status === 404 && (on || !minutes)) await this.post('/dns_config', { protection_enabled: on });
      else if (e.status === 404) throw new Error('This AdGuard Home is too old for timed pauses. Update it from the ZimaOS app store.');
      else throw e;
    }
  }

  // Feeding Muncher a link: block its domain with a user rule.
  async block(domain) {
    const st = await this.get('/filtering/status');
    const rules = st.user_rules || [];
    const rule = `||${domain}^`;
    if (!rules.includes(rule)) await this.post('/filtering/set_rules', { rules: [...rules, rule] });
  }

  async unblock(domain) {
    const st = await this.get('/filtering/status');
    const rule = `||${domain}^`;
    await this.post('/filtering/set_rules', { rules: (st.user_rules || []).filter((r) => r !== rule) });
  }

  // Devices AdGuard has seen (from DHCP, ARP and reverse DNS).
  async clients() {
    const c = await this.get('/clients');
    const out = [];
    for (const a of c.auto_clients || []) out.push({ ip: a.ip, name: a.name || '', source: a.source || '' });
    for (const k of c.clients || []) for (const id of k.ids || []) out.push({ ip: id, name: k.name, source: 'saved' });
    return out;
  }

  async disallow(ip) {
    const a = await this.get('/access/list');
    const list = a.disallowed_clients || [];
    if (!list.includes(ip)) await this.post('/access/set', { ...a, disallowed_clients: [...list, ip] });
  }
}

// "https://ads.example.com/page?x" -> "ads.example.com"
function domainOf(text) {
  const s = String(text || '').trim().split(/\s+/)[0];
  try {
    const u = new URL(/^[a-z]+:\/\//i.test(s) ? s : 'http://' + s);
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(u.hostname)) return '';
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch { return ''; }
}

module.exports = { AdGuard, domainOf };
