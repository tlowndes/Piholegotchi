// Upcoming events from a shared ICS link (Proton Calendar's "Share with anyone").
const ical = require('node-ical');
const { req } = require('./http');

const AHEAD_DAYS = 14;

async function fetchCalendar(url) {
  if (!url) return null;
  let text;
  try {
    const r = await req(url.replace(/^webcal:/i, 'https:'), { json: false, timeout: 15000 });
    if (!r.ok) return { events: [], online: false, note: "CAN'T READ THE CALENDAR" };
    text = await r.text();
  } catch {
    return { events: [], online: false, note: "CAN'T REACH THE CALENDAR" };
  }
  return { events: upcoming(text, new Date()), online: true, note: '' };
}

function upcoming(text, now) {
  const data = ical.sync.parseICS(text);
  const from = new Date(now.getTime() - 24 * 3600e3);
  const to = new Date(now.getTime() + AHEAD_DAYS * 24 * 3600e3);
  const out = [];
  for (const ev of Object.values(data)) {
    if (!ev || ev.type !== 'VEVENT' || ev.status === 'CANCELLED') continue;
    const allDay = ev.datetype === 'date' || !!(ev.start && ev.start.dateOnly);
    const add = (start, end, summary) => {
      if (!start) return;
      end = end || new Date(start.getTime() + (allDay ? 24 * 3600e3 : 3600e3));
      if (end <= now || start > to) return;
      out.push({ title: String(summary || ev.summary || 'Busy').slice(0, 120), start: start.getTime(), end: end.getTime(),
        allDay, where: String(ev.location || '').slice(0, 80) });
    };
    if (ev.rrule) {
      try {
        for (const i of ical.expandRecurringEvent(ev, { from, to })) add(i.start, i.end, i.summary);
      } catch { /* a rule we can't read: skip it */ }
    } else add(ev.start, ev.end);
  }
  return out.sort((a, b) => a.start - b.start).slice(0, 20);
}

module.exports = { fetchCalendar, upcoming };
