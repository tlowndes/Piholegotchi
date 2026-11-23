// Bins, reminders and night time, worked out from what's in settings. Same rules as the Pi.
const BIN_FROM_HOUR = 16;   // show bins from 4pm the day before...
const BIN_UNTIL_HOUR = 10;  // ...until 10am on the day
const DAY = 86400e3;

const dayOnly = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const parseDay = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
const daysBetween = (a, b) => Math.round((dayOnly(b) - dayOnly(a)) / DAY);

function collected(b, day) {
  const first = parseDay(b.next);
  if (!first) return false;
  const every = Math.max(1, +b.every || 1) * 7;
  return ((daysBetween(first, day) % every) + every) % every === 0;
}

const WD = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function nextCollection(bins, after) {
  for (let i = 1; i < 120; i++) {
    const d = new Date(after.getFullYear(), after.getMonth(), after.getDate() + i);
    const names = bins.filter((b) => collected(b, d)).map((b) => b.name || 'Bin');
    if (names.length) return { day: d, names };
  }
  return null;
}

function binDay(bins, now) {
  if (!bins || !bins.length) return null;
  let day, tonight;
  if (now.getHours() >= BIN_FROM_HOUR) { day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1); tonight = true; }
  else if (now.getHours() < BIN_UNTIL_HOUR) { day = dayOnly(now); tonight = false; }
  else return null;
  const out = bins.filter((b) => collected(b, day)).map((b) => ({ name: b.name || 'Bin', label: b.label || '' }));
  if (!out.length) return null;
  const n = nextCollection(bins, day);
  return { key: day.toDateString(), tonight, bins: out,
    next: n ? `${n.names.join(' + ')}, ${WD[n.day.getDay()].slice(0, 1)}${WD[n.day.getDay()].slice(1).toLowerCase()} ${n.day.getDate()} ${MON[n.day.getMonth()]}` : '' };
}

function dueAt(r, now) {
  const [hh, mm] = String(r.at || '08:00').split(':').map(Number);
  if (!r.last) return new Date(now.getTime() - 1000);
  const last = new Date(r.last);
  const d = new Date(last.getFullYear(), last.getMonth(), last.getDate() + Math.max(1, +r.every || 1));
  d.setHours(Number.isNaN(hh) ? 8 : hh, Number.isNaN(mm) ? 0 : mm, 0, 0);
  return d;
}

function reminders(items, now) {
  return (items || []).map((r) => {
    const at = dueAt(r, now);
    const due = now >= at;
    let when;
    const dd = daysBetween(now, at);
    if (due) when = 'Due now';
    else if (dd === 0) when = `Due ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
    else if (dd < 7) when = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][at.getDay()];
    else when = `In ${dd} days`;
    const late = due && r.last ? Math.max(0, daysBetween(at, now)) : 0;
    if (late) when += ` · ${late} day${late > 1 ? 's' : ''} late`;
    return { id: r.id, title: r.title || 'Reminder', kind: r.kind || 'other', due, when, late, at: at.getTime() };
  }).sort((a, b) => (a.due === b.due ? a.at - b.at : a.due ? -1 : 1));
}

const mins = (s) => { const [h, m] = String(s).split(':').map(Number); return h * 60 + m; };

function isNight(now, start, end) {
  const a = mins(start), b = mins(end);
  if (Number.isNaN(a) || Number.isNaN(b) || a === b) return false;
  const t = now.getHours() * 60 + now.getMinutes();
  return a < b ? a <= t && t < b : t >= a || t < b;
}

module.exports = { binDay, reminders, isNight, collected, daysBetween };
