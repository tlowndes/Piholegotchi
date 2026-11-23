// Runs helper.ps1 as one long-lived PowerShell process and talks to it a line at a time.
// Off Windows (or if PowerShell won't start) every call just resolves to null, and those features hide.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class WinHelper {
  constructor(tmpDir) {
    this.ok = false;
    this.pending = new Map();
    this.n = 0;
    if (process.platform !== 'win32') return;
    // The script is copied out of the app package, since PowerShell can't read inside it.
    const file = path.join(tmpDir, 'piholegotchi-helper.ps1');
    try { fs.writeFileSync(file, fs.readFileSync(path.join(__dirname, 'helper.ps1'), 'utf8')); } catch { return; }
    this.start(file);
  }

  start(file) {
    this.p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let buf = '';
    this.p.stdout.setEncoding('utf8');
    this.p.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        let j;
        try { j = JSON.parse(line); } catch { continue; }
        if (j.ready) { this.ok = true; continue; }
        const cb = this.pending.get(j.id);
        if (cb) { this.pending.delete(j.id); cb(j.error ? null : j); }
      }
    });
    this.p.stderr.on('data', (d) => console.warn('helper:', String(d).slice(0, 300)));
    this.p.on('exit', () => {
      this.ok = false;
      for (const cb of this.pending.values()) cb(null);
      this.pending.clear();
      if (!this.stopping && (this.restarts = (this.restarts || 0) + 1) < 5) setTimeout(() => this.start(file), 5000);
    });
  }

  call(cmd, args = {}) {
    if (!this.ok) return Promise.resolve(null);
    const id = ++this.n;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      setTimeout(() => { if (this.pending.delete(id)) resolve(null); }, 8000);
      this.p.stdin.write(JSON.stringify({ id, cmd, ...args }) + '\n');
    });
  }

  stop() { this.stopping = true; if (this.p) this.p.kill(); }
}

module.exports = { WinHelper };
