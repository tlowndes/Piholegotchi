const test = require('node:test');
const assert = require('node:assert');
const { compare, pick } = require('../main/updates');

test('compare versions numerically', () => {
  assert.equal(compare('2.0.12', '2.0.9'), 1);
  assert.equal(compare('2.0.3', '2.0.3'), 0);
  assert.equal(compare('desktop-v2.0.3', '2.1.0'), -1);
});

test('pick skips Pi releases, drafts and releases without an installer', () => {
  const l = pick([
    { tag_name: 'v0.1.29', assets: [{ name: 'piholegotchi.img.xz' }] },
    { tag_name: 'desktop-v2.0.9', draft: true, assets: [{ name: 'a.exe' }] },
    { tag_name: 'desktop-v2.0.8', assets: [] },
    { tag_name: 'desktop-v2.0.7', html_url: 'u', assets: [{ name: 'Piholegotchi-Setup-2.0.7.exe', browser_download_url: 'https://x/y.exe', size: 5 }] },
  ]);
  assert.equal(l.version, '2.0.7');
  assert.equal(l.url, 'https://x/y.exe');
  assert.equal(pick([{ tag_name: 'v0.1.28', assets: [] }]), null);
});
