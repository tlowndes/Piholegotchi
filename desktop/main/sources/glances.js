// Server health from Glances on ZimaOS.
const { req } = require('./http');

const SKIP_FS = new Set(['tmpfs', 'devtmpfs', 'overlay', 'squashfs', 'proc', 'sysfs', 'nsfs', 'autofs']);

function uptimeText(raw) {
  const s = String(raw);
  let m = s.match(/^\s*(\d+)\s+day/);
  if (m) return `${m[1]} DAY${m[1] === '1' ? '' : 'S'}`;
  m = s.match(/^\s*(\d+):(\d+)/);
  if (m) return +m[1] ? `${+m[1]} HOUR${m[1] === '1' ? '' : 'S'}` : `${+m[2]} MIN`;
  return s.toUpperCase().slice(0, 12);
}

class Glances {
  constructor(url) {
    this.base = (url || '').replace(/\/+$/, '');
    this.configured = !!url;
    this.version = null;
    this.history = [];
  }

  async get(what) {
    let err;
    for (const v of this.version ? [this.version] : ['4', '3']) {
      try { const j = await req(`${this.base}/api/${v}/${what}`, { timeout: 5000 }); this.version = v; return j; } catch (e) { err = e; }
    }
    throw err;
  }

  async fetch() {
    if (!this.configured) return null;
    let cpu, mem, fs, up = '?';
    try {
      [cpu, mem, fs] = await Promise.all([this.get('cpu'), this.get('mem'), this.get('fs')]);
      try { up = uptimeText(await this.get('uptime')); } catch { /* fine */ }
    } catch {
      this.version = null;
      return { online: false, note: 'SERVER IS DOWN' };
    }
    const disks = fs.filter((d) => !SKIP_FS.has(d.fs_type) && d.size);
    const big = disks.sort((a, b) => b.size - a.size)[0] || { size: 0, free: 0, percent: 0 };
    const total = +cpu.total || 0;
    this.history.push(total);
    if (this.history.length > 24 * 60) this.history.shift();
    return { online: true, cpu: total, ram: +mem.percent || 0, disk: +big.percent || 0,
      free_gb: big.free / 1e9, total_gb: big.size / 1e9, uptime: up, history: squash(this.history, 48) };
  }
}

function squash(xs, n) {
  if (xs.length <= n) return xs;
  const step = xs.length / n;
  return Array.from({ length: n }, (_, i) => {
    const a = Math.floor(i * step), b = Math.max(a + 1, Math.floor((i + 1) * step));
    return xs.slice(a, b).reduce((p, q) => p + q, 0) / (b - a);
  });
}

module.exports = { Glances, uptimeText };
