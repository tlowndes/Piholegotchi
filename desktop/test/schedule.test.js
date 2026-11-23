const test = require('node:test');
const assert = require('node:assert');
const { binDay, reminders, isNight } = require('../main/schedule');

const bins = [{ name: 'Black', label: 'General', next: '2026-11-24', every: 2 }, { name: 'Blue', label: 'Recycling', next: '2026-12-01', every: 2 }];

test('bins show from 4pm the night before', () => {
  const b = binDay(bins, new Date(2026, 10, 23, 17, 0));
  assert.equal(b.tonight, true);
  assert.deepEqual(b.bins.map((x) => x.name), ['Black']);
  assert.match(b.next, /^Blue, Tue 1 Dec$/);
});

test('bins stay until 10am on the day, then go', () => {
  assert.equal(binDay(bins, new Date(2026, 10, 24, 9, 0)).tonight, false);
  assert.equal(binDay(bins, new Date(2026, 10, 24, 11, 0)), null);
  assert.equal(binDay(bins, new Date(2026, 10, 23, 12, 0)), null);
});

test('fortnightly bins repeat every two weeks, backwards too', () => {
  assert.ok(binDay(bins, new Date(2026, 11, 7, 18)));     // night before 8 Dec
  assert.ok(binDay(bins, new Date(2026, 10, 9, 18)));     // night before 10 Nov
  assert.deepEqual(binDay(bins, new Date(2026, 10, 16, 18)).bins.map((x) => x.name), ['Blue']);
  assert.equal(binDay(bins, new Date(2026, 10, 30, 9)), null);
});

test('reminders: never done is due now; done is due after "every" days', () => {
  const now = new Date(2026, 10, 23, 12);
  const r = reminders([
    { id: 'a', title: 'Water monstera', every: 7, at: '09:00', last: new Date(2026, 10, 20).getTime() },
    { id: 'b', title: 'Feed fish' },
    { id: 'c', title: 'Fern', every: 2, at: '08:00', last: new Date(2026, 10, 18).getTime() },
  ], now);
  assert.deepEqual(r.map((x) => x.id), ['c', 'b', 'a']);
  assert.equal(r[0].late, 3);
  assert.match(r[0].when, /3 days late/);
  assert.equal(r[2].due, false);
});

test('night wraps past midnight', () => {
  assert.equal(isNight(new Date(2026, 0, 1, 23, 30), '23:00', '07:00'), true);
  assert.equal(isNight(new Date(2026, 0, 1, 6, 59), '23:00', '07:00'), true);
  assert.equal(isNight(new Date(2026, 0, 1, 12), '23:00', '07:00'), false);
  assert.equal(isNight(new Date(2026, 0, 1, 13), '12:00', '14:00'), true);
});
