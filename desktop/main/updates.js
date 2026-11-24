// Updates from GitHub: the newest desktop-v* release with an installer attached.
// The Pi's releases (v0.1.*) live in the same repo and are skipped.
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

const REPO = 'tlowndes/Piholegotchi';
const UA = { 'User-Agent': 'Piholegotchi-desktop', Accept: 'application/vnd.github+json' };

// "2.0.12" vs "2.0.9" -> 1
function compare(a, b) {
  const pa = String(a).replace(/^\D+/, '').split('.').map(Number), pb = String(b).replace(/^\D+/, '').split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

function pick(releases) {
  for (const r of releases || []) {
    if (r.draft || r.prerelease || !/^desktop-v\d/.test(r.tag_name || '')) continue;
    const exe = (r.assets || []).find((a) => /\.exe$/i.test(a.name));
    if (exe) return { version: r.tag_name.replace(/^desktop-v/, ''), tag: r.tag_name, url: exe.browser_download_url, name: exe.name, size: exe.size, page: r.html_url, date: r.published_at };
  }
  return null;
}

async function latest() {
  const r = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=30`, { headers: UA, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(r.status === 403 ? 'GitHub has had too many checks from this network. Try again in an hour.' : `GitHub said ${r.status}.`);
  return pick(await r.json());
}

async function check(current) {
  const l = await latest();
  if (!l) return { ok: true, current, newer: false, message: `You're on ${current}. No Windows releases yet.` };
  const newer = compare(l.version, current) > 0;
  return { ok: true, current, latest: l, newer,
    message: newer ? `Version ${l.version} is out. You're on ${current}.` : `You're up to date (${current}).` };
}

async function download(l, dir) {
  const dest = path.join(dir, l.name);
  const r = await fetch(l.url, { headers: { 'User-Agent': UA['User-Agent'] }, signal: AbortSignal.timeout(10 * 60e3) });
  if (!r.ok || !r.body) throw new Error(`Download failed (${r.status}).`);
  await pipeline(Readable.fromWeb(r.body), fs.createWriteStream(dest));
  if (l.size && fs.statSync(dest).size !== l.size) throw new Error('The download was incomplete. Try again.');
  return dest;
}

module.exports = { check, download, compare, pick };
