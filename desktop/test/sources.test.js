const test = require('node:test');
const assert = require('node:assert');
const { domainOf } = require('../main/sources/adguard');
const { upcoming } = require('../main/sources/calendar');

test('domainOf pulls a clean domain out of links and text', () => {
  assert.equal(domainOf('https://www.Example.co.uk/path?q=1'), 'example.co.uk');
  assert.equal(domainOf('ads.tracker.com'), 'ads.tracker.com');
  assert.equal(domainOf('  http://x.io  more text'), 'x.io');
  assert.equal(domainOf('not a link'), '');
  assert.equal(domainOf('localhost'), '');
  assert.equal(domainOf(''), '');
});

const ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:1
DTSTART:20261124T100000Z
DTEND:20261124T110000Z
SUMMARY:Design review
LOCATION:Studio
END:VEVENT
BEGIN:VEVENT
UID:2
DTSTART:20261101T090000Z
DTEND:20261101T093000Z
RRULE:FREQ=WEEKLY;BYDAY=MO
SUMMARY:Stand-up
END:VEVENT
BEGIN:VEVENT
UID:3
DTSTART:20261020T090000Z
DTEND:20261020T100000Z
SUMMARY:Old thing
END:VEVENT
BEGIN:VEVENT
UID:4
DTSTART;VALUE=DATE:20261125
DTEND;VALUE=DATE:20261126
SUMMARY:Day off
END:VEVENT
END:VCALENDAR`;

test('calendar: upcoming events, recurring ones expanded, past ones dropped', () => {
  const ev = upcoming(ICS, new Date('2026-11-23T12:00:00Z'));
  const titles = ev.map((e) => e.title);
  assert.ok(!titles.includes('Old thing'));
  assert.equal(titles[0], 'Design review');
  assert.equal(ev[0].where, 'Studio');
  assert.ok(titles.filter((t) => t === 'Stand-up').length >= 2);
  const off = ev.find((e) => e.title === 'Day off');
  assert.equal(off.allDay, true);
  for (let i = 1; i < ev.length; i++) assert.ok(ev[i].start >= ev[i - 1].start);
});
