// Example state for `npm run demo` (and for opening widget.html in a browser): everything switched on.
(function () {
  const now = Date.now(), H = 3600e3, M = 60e3;
  const art = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    x.fillStyle = '#2b3f8f'; x.fillRect(0, 0, 64, 64);
    [['#ff5b2e', 20, 22, 18], ['#ffc43d', 44, 40, 14], ['#ff8fa3', 30, 48, 9], ['#5aa0ff', 50, 14, 8]].forEach(([c2, X, Y, r]) => { x.fillStyle = c2; x.beginPath(); x.arc(X, Y, r, 0, 7); x.fill(); });
    return c.toDataURL();
  })();
  const door = (() => {
    const c = document.createElement('canvas'); c.width = 96; c.height = 64; const x = c.getContext('2d');
    const R = (a, b, w, h, col) => { x.fillStyle = col; x.fillRect(a, b, w, h); };
    R(0, 0, 96, 64, '#5c6b7a'); R(0, 46, 96, 18, '#8b8f86'); R(8, 6, 34, 46, '#3a2f2a'); R(10, 8, 30, 44, '#7a4b33'); R(34, 28, 3, 3, '#ffc43d'); R(60, 0, 36, 46, '#4d5866');
    R(52, 20, 14, 14, '#f1c7a5'); R(50, 16, 18, 6, '#232326'); R(55, 25, 2, 2, '#232326'); R(61, 25, 2, 2, '#232326'); R(48, 34, 22, 22, '#3a7bd5'); R(44, 40, 30, 16, '#c89a5b'); R(50, 56, 6, 8, '#232326'); R(62, 56, 6, 8, '#232326');
    return c.toDataURL();
  })();
  const h = new Date().getHours();
  window.DEMO_STATE = () => ({
    now: Date.now(), demo: true, night: false, mood: 'content', crown: false, shades: false, phones: true,
    nudges: [{ id: 'bins:demo', title: 'BIN DAY TOMORROW', text: 'Black bin out tonight.', screen: 'bins', prio: 4 }],
    screens: {},
    configured: { ads: true, spotify: true, weather: true, server: true, calendar: true, home: true, door: true, capture: true, helper: true, network: true },
    ads: { online: true, note: '', total: 15210, blocked: 2710, percent: 17.8, today: 2710, ate: 0,
      hours: [3, 2, 1, 1, 0, 0, 1, 4, 9, 14, 12, 10, 11, 15, 13, 9, 8, 7, 6, 5, 4, 3, 2, 1].slice(0, h + 1).map((v) => v * 17),
      top: [{ name: 'doubleclick.net', n: 1204 }, { name: 'googlesyndication.com', n: 812 }, { name: 'app-measurement.com', n: 540 }, { name: 'ads.tiktok.com', n: 388 }, { name: 'scorecardresearch.com', n: 201 }], fed: [] },
    track: { id: 'x', title: 'Glasshouse', artist: 'Halfway Lights', album: 'Blue Hour', year: '2024', progress: 131, duration: 234, playing: true, art, at: now, canControl: true },
    top: { tracks: [['Glasshouse', 'Halfway Lights'], ['Northern Line', 'The Low Tides'], ['Paper Moons', 'Ivy Field'], ['Static Bloom', 'Halfway Lights'], ['Overpass', 'Kite Club']].map(([title, artist]) => ({ title, artist })), artists: ['Halfway Lights'], note: '' },
    weather: { place: 'Bristol', temp: 9, feels: 6, hi: 11, lo: 4, rain: 70, kind: 'rain', desc: 'Light rain', sun: 'SUNSET 16:07', outlook: 'RAIN FROM 16:00',
      slots: [{ label: 'NOW', kind: 'cloud', temp: 9 }, { label: '17:00', kind: 'rain', temp: 8 }, { label: '20:00', kind: 'moon', temp: 6 }, { label: '23:00', kind: 'moon', temp: 5 }] },
    server: { online: true, cpu: 23, ram: 61, disk: 72, free_gb: 1100, total_gb: 4000, uptime: '23 DAYS' },
    calendar: { online: true, note: '', events: [
      { title: 'Portfolio review', start: now + 2.5 * H, end: now + 3.25 * H, allDay: false, where: 'Video call' },
      { title: 'Dentist', start: now + 22 * H, end: now + 23 * H, allDay: false, where: '' },
      { title: 'Recruiter calls', start: now + 44 * H, end: now + 50 * H, allDay: true, where: '' },
      { title: 'Dinner at Mum’s', start: now + 100 * H, end: now + 103 * H, allDay: false, where: '' }] },
    home: { online: true, note: '', items: [
      { id: 'light.living', label: 'Living room', value: 'ON', kind: 'light', on: true, toggle: true },
      { id: 'light.desk', label: 'Desk lamp', value: 'OFF', kind: 'light', on: false, toggle: true },
      { id: 'sensor.hall', label: 'Hallway', value: '21.5°', kind: 'temp' },
      { id: 'lock.front', label: 'Front door', value: 'LOCKED', kind: 'lock', on: true },
      { id: 'sensor.wash', label: 'Washing', value: '34 min', kind: 'other' }] },
    deck: { sent: new Date().toISOString(), next: { title: 'Finish the case study intro', mins: 25 }, due: 4, focus_min: 50, habits: { done: 3, total: 5 }, water: { ml: 1200, goal: 2000 }, jobs: { open: 6, follow_up: { company: 'Acme Studio', role: 'Product Designer', date: new Date(now + 3 * 24 * H).toISOString() } } },
    focus: { task: 'Case study write-up', running: true, ends: now + 18 * M + 24e3, remaining: 0, total: 1500, source: 'phone' },
    focusDone: null,
    message: { text: 'Washing’s done. Hang it up before it gets smelly.', title: 'Home Assistant', at: now - 2 * M, until: now + 30 * M },
    door: { img: door, at: now - 60e3 },
    network: { devices: [{ ip: '192.168.1.10', name: 'Tom’s PC', known: true }, { ip: '192.168.1.11', name: 'Pixel 8', known: true }, { ip: '192.168.1.20', name: 'ZimaOS', known: true }, { ip: '192.168.1.57', name: 'Espressif device', known: false }],
      fresh: { ip: '192.168.1.57', name: 'Espressif device', source: 'arp', at: now - 2 * M } },
    pc: { name: 'TOMS-PC', cpu: 34, gpu: 58, ram: 71, cpu_temp: 58, gpu_temp: 64, hungry: 'Figma' },
    sound: { master: 70, muted: false, sessions: [{ name: 'Spotify', volume: 55 }, { name: 'chrome', volume: 80 }, { name: 'Teams', volume: 40 }] },
    clip: ['https://tomlowndes.co.uk/work/muncher', '#FF5B2E', 'Thanks for getting back to me so quickly, I’d love to…', '192.168.1.20:3000', 'Space Grotesk 700, -2% tracking'],
    captures: [{ at: '14:02', text: 'Idea: Muncher sticker pack' }, { at: '11:40', text: 'Email Becky re: portfolio' }, { at: '09:15', text: 'Buy bin bags', task: true }],
    meeting: false, drift: false, activeMins: 112, breakDue: true,
    bins: { key: 'demo', tonight: true, bins: [{ name: 'Black', label: 'Waste' }], next: 'Green + Blue, Thu 3 Dec', done: false },
    reminders: [{ id: 'a', title: 'Water the monstera', kind: 'plant', due: true, when: 'Due now · 2 days late', late: 2 }, { id: 'b', title: 'Feed the fish', kind: 'pet', due: false, when: 'Due 18:00' }, { id: 'c', title: 'Mist the ferns', kind: 'plant', due: false, when: 'Friday' }],
    streak: { days: 6, best: 11, level: 4, total: 12, crown: true, shades: false, cal: Array.from({ length: 28 }, (_, i) => ({ level: [0, 2, 3, 1, 0, 0, 0, 2, 3, 3, 2, 1, 0, 1, 1, 0, 3, 2, 3, 0, 0, 2, 3, 1, 3, 2, 3, 0][i], today: i === 26, future: i > 26 })) },
    report: { week: 47, seen: 7, ads: 18402, focus_min: 580, water_ml: 11400, bins: 2, bins_due: 2, plants: 5, song: 'Glasshouse · Halfway Lights', grade: 'A-', note: 'Drink more water' },
    water: { ml: 1200, goal: 2000 }, focusMinutes: 25,
  });
})();
