// What Muncher remembers day to day: record days and moods (as on the Pi), focus streaks,
// water, songs, chores done, for the streak screen and the Monday report card.
const PARTY_MS = 3600e3;     // dance for an hour after a record falls
const DANCE_MS = 120e3;

const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

class Life {
  constructor(store) {
    this.store = store;
    this.d = store.load('life', {});
    this.d.days = this.d.days || {};
    this.d.best = this.d.best || 0;
    this.d.done = this.d.done || {};          // nudge ids finished for good (bins out, etc.)
    this.d.fed = this.d.fed || [];            // domains fed to Muncher, newest first
    this.dirty = false;
  }

  save() { if (this.dirty) { this.store.save('life', this.d); this.dirty = false; } }

  day(k = dayKey()) {
    if (!this.d.days[k]) {
      this.d.days[k] = { ads: 0, focus_min: 0, water_ml: 0, bins: 0, bins_due: 0, plants: 0, songs: {} };
      // keep about two months
      const keys = Object.keys(this.d.days).sort();
      for (const old of keys.slice(0, Math.max(0, keys.length - 62))) delete this.d.days[old];
      this.dirty = true;
    }
    return this.d.days[k];
  }

  bump(field, n = 1) { this.day()[field] += n; this.dirty = true; }

  song(title) { const s = this.day().songs; s[title] = (s[title] || 0) + 1; this.dirty = true; }

  // ---------------------------------------------------------------- moods (ported from moods.py)
  applyMoods(ads, cfg, now = new Date()) {
    if (!ads) return ads;
    const t = now.getTime(), d = this.d;
    if (ads.note === 'BLOCKING IS OFF') d.off_since = d.off_since || t;
    else if (ads.online) delete d.off_since;

    const k = dayKey(now);
    if (d.today_key !== k) {
      if (d.full && (d.today || 0) > d.best) d.best = d.today;
      Object.assign(d, { today_key: k, today: 0, full: now.getHours() === 0 });
      this.dirty = true;
    }
    if (ads.today != null) {
      if (ads.today > (d.today || 0)) { d.today = ads.today; this.day().ads = ads.today; this.dirty = true; }
      if (cfg.muncher_party && ads.online && d.best > 0 && ads.today > d.best && d.party_day !== k) {
        Object.assign(d, { party_day: k, party_until: t + PARTY_MS, party_from: t, beat: d.best });
        this.dirty = true;
      }
    }
    if (ads.note === 'BLOCKING IS OFF' && cfg.starve_minutes) {
      const mins = Math.floor((t - d.off_since) / 60000);
      if (mins >= cfg.starve_minutes) return { ...ads, mood: 'starving', off_mins: mins };
    }
    if (cfg.muncher_party && ads.online && t < (d.party_until || 0)) {
      return { ...ads, mood: 'party', beat: d.beat || 0, dancing: t - d.party_from < DANCE_MS * 30 };
    }
    return { ...ads, best: d.best };
  }

  partyNow() { const t = Date.now(); Object.assign(this.d, { party_until: t + 60000, party_from: t, beat: this.d.best || this.d.today || 0 }); this.dirty = true; }

  // ---------------------------------------------------------------- streaks
  streak(now = new Date()) {
    const hit = (d) => (this.d.days[dayKey(d)] || {}).focus_min >= 25;
    let n = 0;
    let d = hit(now) ? now : addDays(now, -1);
    while (hit(d)) { n++; d = addDays(d, -1); }
    const total = Object.values(this.d.days).filter((x) => x.focus_min >= 25).length + (this.d.old_focus_days || 0);
    if (n > (this.d.best_streak || 0)) { this.d.best_streak = n; this.dirty = true; }
    const cal = [];
    // four weeks, Monday first, ending this week
    const monday = addDays(now, -((now.getDay() + 6) % 7) - 21);
    for (let i = 0; i < 28; i++) {
      const day = addDays(monday, i);
      const m = (this.d.days[dayKey(day)] || {}).focus_min || 0;
      cal.push({ level: m >= 75 ? 3 : m >= 25 ? 2 : m > 0 ? 1 : 0, today: dayKey(day) === dayKey(now), future: day > now });
    }
    const level = Math.min(9, 1 + Math.floor(total / 3));
    return { days: n, best: this.d.best_streak || n, level, total, cal, crown: n >= 5, shades: level >= 6 };
  }

  // ---------------------------------------------------------------- report card: last full Mon-Sun
  report(now = new Date()) {
    const lastMon = addDays(now, -((now.getDay() + 6) % 7) - 7);
    const sum = { ads: 0, focus_min: 0, water_ml: 0, bins: 0, bins_due: 0, plants: 0 };
    const songs = {};
    let seen = 0;
    for (let i = 0; i < 7; i++) {
      const x = this.d.days[dayKey(addDays(lastMon, i))];
      if (!x) continue;
      seen++;
      for (const k of Object.keys(sum)) sum[k] += x[k] || 0;
      for (const [s, c] of Object.entries(x.songs || {})) songs[s] = (songs[s] || 0) + c;
    }
    const top = Object.entries(songs).sort((a, b) => b[1] - a[1])[0];
    const onejan = new Date(lastMon.getFullYear(), 0, 1);
    const week = Math.ceil(((lastMon - onejan) / 86400e3 + onejan.getDay() + 1) / 7);
    // grade: focus (5h = full marks), water (goal x 7), bins out
    const goal = (this.store.get('water_goal') || 2000) * 7;
    const parts = [Math.min(1, sum.focus_min / 300), Math.min(1, sum.water_ml / goal), sum.bins_due ? sum.bins / sum.bins_due : 1];
    const score = parts.reduce((a, b) => a + b, 0) / parts.length;
    const grade = score >= 0.9 ? 'A' : score >= 0.8 ? 'A-' : score >= 0.7 ? 'B' : score >= 0.55 ? 'C' : 'D';
    const worst = ['Needs more focus', 'Drink more water', 'Bins got missed'][parts.indexOf(Math.min(...parts))];
    return { week, seen, ...sum, song: top ? top[0] : '', grade, note: score >= 0.9 ? 'Top of the class' : worst, key: dayKey(lastMon) };
  }
}

module.exports = { Life, dayKey };
