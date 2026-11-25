const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Store } = require('../main/store');
const { Life, dayKey } = require('../main/life');

const fresh = () => new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'pg-')), null);
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

test('a new record day throws a party', () => {
  const life = new Life(fresh());
  life.d.best = 100;
  const cfg = { muncher_party: true, starve_minutes: 30 };
  const now = new Date(2026, 10, 23, 15);
  const a = life.applyMoods({ online: true, today: 150, note: '' }, cfg, now);
  assert.equal(a.mood, 'party');
  assert.equal(a.beat, 100);
});

test('blocking off long enough makes him starve', () => {
  const life = new Life(fresh());
  const cfg = { muncher_party: true, starve_minutes: 30 };
  const t0 = new Date(2026, 10, 23, 15);
  life.applyMoods({ online: true, today: 1, note: 'BLOCKING IS OFF' }, cfg, t0);
  const a = life.applyMoods({ online: true, today: 1, note: 'BLOCKING IS OFF' }, cfg, new Date(t0.getTime() + 31 * 60e3));
  assert.equal(a.mood, 'starving');
  assert.equal(a.off_mins, 31);
});

test('streak counts focus days of 25 minutes or more, crown at five', () => {
  const life = new Life(fresh());
  const now = new Date(2026, 10, 23, 12);
  for (let i = 0; i < 5; i++) life.day(dayKey(addDays(now, -i))).focus_min = 30;
  life.day(dayKey(addDays(now, -6))).focus_min = 30;
  const s = life.streak(now);
  assert.equal(s.days, 5);
  assert.equal(s.crown, true);
  assert.equal(s.cal.length, 28);
});

test('streak still counts when today has no focus yet', () => {
  const life = new Life(fresh());
  const now = new Date(2026, 10, 23, 9);
  for (let i = 1; i <= 3; i++) life.day(dayKey(addDays(now, -i))).focus_min = 40;
  assert.equal(life.streak(now).days, 3);
});

test('report card grades last full Monday to Sunday', () => {
  const store = fresh();
  const life = new Life(store);
  const now = new Date(2026, 10, 23, 12);     // a Monday
  for (let i = 1; i <= 7; i++) Object.assign(life.day(dayKey(addDays(now, -i))), { focus_min: 60, water_ml: 2000, bins: 1, bins_due: 1, ads: 10 });
  const r = life.report(now);
  assert.equal(r.seen, 7);
  assert.equal(r.ads, 70);
  assert.equal(r.grade, 'A');
  assert.equal(r.key, '2026-11-16');
});

test('Pi backup import keeps known keys, skips Spotify sign-in and widget position', () => {
  const store = fresh();
  const n = store.importPi({ piholegotchi_backup: 1, config: { adguard_url: 'http://x:3000', spotify_refresh: 'secret', pos: { x: 1, y: 1 }, nonsense: 1 } });
  assert.equal(store.get('adguard_url'), 'http://x:3000');
  assert.equal(store.get('spotify_refresh'), '');
  assert.equal(store.get('pos'), null);
  assert.ok(n >= 1);
  assert.throws(() => store.importPi({ hello: 1 }));
});
