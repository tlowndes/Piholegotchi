// Muncher, drawn the way the e-ink original was: on a tiny pixel grid (140 x 100), then every pixel
// snapped to a small palette and given a paper outline, and scaled up with crisp pixels.
// Shapes and positions follow render.py's _creature, _party and _starving.
(function () {
  const PAL = [[35, 35, 38], [222, 220, 210], [255, 91, 46], [255, 143, 163], [255, 196, 61], [63, 191, 127], [90, 160, 255]];
  const C = { ink: '#232326', paper: '#dedcd2', acc: '#ff5b2e', pink: '#ff8fa3', sun: '#ffc43d', leaf: '#3fbf7f', sky: '#5aa0ff' };
  const GL = {
    H: ['##.##', '#####', '.###.', '..#..'], Q: ['###', '..#', '.##', '...', '.#.'],
    A: ['.#.', '#.#', '###', '#.#', '#.#'], D: ['##.', '#.#', '#.#', '#.#', '##.'],
    Z: ['####', '...#', '..#.', '.#..', '####'], z: ['###', '..#', '.#.', '###'],
  };
  const SLEEPY = ['asleep', 'night', 'snooze'];
  const QUIET = ['asleep', 'night', 'snooze', 'starving', 'shh', 'drift', 'stretch', 'sus'];
  const R = Math.PI / 180;

  const glyph = (x, ch, X, Y, col) => { x.fillStyle = col; GL[ch].forEach((r, j) => [...r].forEach((c, i) => { if (c === '#') x.fillRect(X + i, Y + j, 1, 1); })); };
  const ell = (x, cx, cy, rx, ry, col) => { x.fillStyle = col; x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); x.fill(); };
  const rect = (x, X, Y, w, h, col) => { x.fillStyle = col; x.fillRect(X, Y, w, h); };
  const line = (x, pts, w, col) => { x.strokeStyle = col; x.lineWidth = w; x.lineCap = 'round'; x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(...p) : x.moveTo(...p))); x.stroke(); };
  const teeth = (x, cx, y, h) => { for (let i = 0; i < 5; i++) { const tx = cx - 11 + i * 5.5; x.fillStyle = C.ink; x.beginPath(); x.moveTo(tx, y); x.lineTo(tx + 5.5, y); x.lineTo(tx + 2.75, y + h); x.fill(); } };

  function body(x, m, f, o) {
    const cx = 48, cy = 62;
    const sleep = SLEEPY.includes(m);
    const sway = sleep ? 0 : Math.round(Math.sin(f * 0.6) * 1.6);
    // antenna
    const pts = [];
    for (let i = 0; i < 9; i++) { const t = i / 8; pts.push([cx + 4 + 10 * t ** 1.6 + sway * t, 36 - 14 * Math.sin((t * Math.PI) / 2)]); }
    line(x, pts, 2, C.ink);
    if (sleep) { ell(x, cx + 15, 21, 4.5, 4.5, C.ink); ell(x, cx + 15, 21, 2.5, 2.5, C.paper); } else ell(x, cx + 15 + sway, 21, 4.5, 4.5, C.acc);
    // feet and body
    rect(x, cx - 18, 84, 10, 7, C.ink); rect(x, cx + 6, 84, 10, 7, C.ink);
    ell(x, cx, cy, 32, 28, C.ink);
    if (m === 'night') {   // nightcap
      x.fillStyle = C.sky; x.beginPath(); x.moveTo(cx - 29, 49); x.lineTo(cx + 12, 35); x.lineTo(cx - 36, 16); x.closePath(); x.fill();
      rect(x, cx - 24, 40, 18, 3, C.paper); ell(x, cx - 36, 16, 3.5, 3.5, C.paper);
    }
    if (o.crown && !sleep) {
      x.fillStyle = C.sun; x.beginPath();
      [[-14, 38], [-14, 26], [-8, 32], [-2, 24], [4, 32], [10, 26], [10, 38]].forEach(([dx, y], i) => (i ? x.lineTo(cx + dx, y) : x.moveTo(cx + dx, y)));
      x.closePath(); x.fill(); rect(x, cx - 3, 33, 3, 3, C.acc);
    }
    const eyes = [cx - 12, cx + 11];
    const blink = !sleep && (f % 37 === 0 || f % 37 === 1);

    if (m === 'shh') {
      eyes.forEach((ex) => { ell(x, ex, 52, 5, 5, C.paper); ell(x, ex, 52, 2, 2.5, C.ink); });
      ell(x, cx + 1, 72, 6, 3, C.paper);
      rect(x, cx - 1, 60, 5, 18, C.paper); rect(x, cx, 61, 3, 16, C.pink); ell(x, cx + 2, 83, 7, 5, C.paper);
      return;
    }
    if (m === 'purr') {
      eyes.forEach((ex) => line(x, [[ex - 5, 56], [ex, 51], [ex + 5, 56]], 2, C.paper));
      rect(x, cx - 27, 58, 5, 3, C.pink); rect(x, cx + 22, 58, 5, 3, C.pink);
      line(x, [[cx - 8, 70], [cx - 4, 73], [cx, 70], [cx + 4, 73], [cx + 8, 70]], 2, C.paper);
      return;
    }
    if (m === 'stretch') {
      eyes.forEach((ex) => line(x, [[ex - 5, 52], [ex, 55], [ex + 5, 52]], 2, C.paper));
      ell(x, cx + 1, 72, 6, 7, C.paper);
      [-1, 1].forEach((s) => { const sx = cx + s * 28; const tip = [sx + s * 6, 22 + (f % 10 < 5 ? 0 : 2)]; line(x, [[sx, 50], tip], 4, C.ink); ell(x, tip[0], tip[1], 3, 3, C.ink); });
      return;
    }
    if (m === 'sus') {
      ell(x, cx - 12, 52, 5, 5, C.paper); ell(x, cx - 11, 53, 2, 2.5, C.ink);
      ell(x, cx + 11, 53, 5, 5, C.paper); rect(x, cx + 5, 47, 12, 5, C.ink); ell(x, cx + 11, 55, 2, 2, C.ink);
      rect(x, cx - 8, 72, 18, 2, C.paper);
      return;
    }
    if (m === 'drift') {
      eyes.forEach((ex) => { ell(x, ex, 53, 5, 5, C.paper); rect(x, ex - 6, 47, 12, 7, C.ink); rect(x, ex - 1, 55, 3, 2, C.ink); });
      ell(x, cx + 1, 73, 3, 2, C.paper);
      return;
    }

    if (sleep || blink) eyes.forEach((ex) => rect(x, ex - 5, 53, 10, 2, C.paper));
    else if (m === 'hungry') { const look = [0, 1, 1, 0, -1, -1][Math.floor(f / 6) % 6]; eyes.forEach((ex) => { ell(x, ex, 52, 5, 5, C.paper); ell(x, ex + 1 + look, 52.5, 2, 2.5, C.ink); }); }
    else if (m === 'focus') { eyes.forEach((ex) => { ell(x, ex, 53, 5, 5, C.paper); rect(x, ex - 6, 47, 12, 5, C.ink); ell(x, ex, 55, 2, 2, C.ink); }); rect(x, cx - 26, 40, 52, 3, C.acc); }
    else if (o.joy) eyes.forEach((ex) => line(x, [[ex - 5, 56], [ex, 50], [ex + 5, 56]], 2, C.paper));
    else { x.strokeStyle = C.paper; x.lineWidth = 2; eyes.forEach((ex) => { x.beginPath(); x.arc(ex, 55, 5, 198 * R, 342 * R); x.stroke(); }); }
    if (o.shades && !sleep && m !== 'focus') { rect(x, cx - 20, 48, 17, 8, C.ink); rect(x, cx + 3, 48, 17, 8, C.ink); rect(x, cx - 21, 47, 42, 2, C.ink); rect(x, cx - 17, 50, 3, 2, C.paper); rect(x, cx + 6, 50, 3, 2, C.paper); }
    if (!sleep && m !== 'hungry' && m !== 'focus') { rect(x, cx - 27, 58, 5, 3, C.pink); rect(x, cx + 22, 58, 5, 3, C.pink); }
    if (sleep) { const b = f % 16 < 8 ? 0 : 1; ell(x, cx + 1, 72, 4 + b, 3 + b, C.paper); return; }
    const eating = m === 'content' || m === 'stuffed';
    const chewRate = o.eating ? 4 : 8;
    if (eating && f % chewRate >= chewRate - 3) { ell(x, cx + 1, 71, 14, 4, C.paper); teeth(x, cx, 67, 3); }
    else {
      ell(x, cx + 1, 72, 15, 9, C.paper); teeth(x, cx, 63, 4.5);
      if (eating) rect(x, cx - 2, 72, 9, 7, C.acc);
      if (m === 'focus') rect(x, cx - 4, 73, 10, 2, C.ink);
    }
  }

  function phones(x) {
    const cx = 48, cy = 62;
    x.strokeStyle = C.acc; x.lineWidth = 3; x.beginPath(); x.ellipse(cx, cy - 2, 36, 33, 0, 200 * R, 340 * R); x.stroke();
    rect(x, cx - 38, 50, 7, 15, C.acc); rect(x, cx + 31, 50, 7, 15, C.acc);
  }

  function chips(x, n, f) {
    const rows = [[36, 0], [60, 13], [84, 26]];
    for (let k = 0; k < n; k++) {
      const [y, ph] = rows[k];
      const X = 112 - ((f * 3 + ph) % 34);
      if (X < 84) continue;
      rect(x, X, y, 15, 11, C.ink); rect(x, X + 1, y + 1, 13, 9, C.paper);
      glyph(x, 'A', X + 4, y + 3, C.ink); glyph(x, 'D', X + 8, y + 3, C.ink);
      rect(x, X + 18, y + 3, 2, 1, C.paper); rect(x, X + 22, y + 7, 2, 1, C.paper);
    }
  }

  const zzz = (x, f) => { const r = f % 24; glyph(x, 'z', 86, 44 - Math.floor(r / 6), C.paper); if (r > 8) glyph(x, 'Z', 94, 34 - Math.floor(r / 8), C.paper); };

  function notes(x, f) {
    const side = Math.floor(f / 5) % 2, nx = side ? 96 : 2;
    [[nx, 30, C.acc], [nx + 10, 16, C.sky]].forEach(([X, Y, col], i) => { ell(x, X + 3, Y + 10, 3, 2.5, col); rect(x, X + 5, Y, 2, 10, col); if (i) rect(x, X - 4, Y, 10, 2, col); });
    [[14, 14, C.sun], [100, 8, C.leaf], [110, 96, C.pink], [4, 98, C.sky], [104, 74, C.acc]].forEach(([X, Y, col], i) => { if ((i + side) % 2) rect(x, X, Y, 3, 3, col); });
  }

  function starving(x, f) {
    const cx = 48, cy = 62;
    line(x, [[cx + 4, 36], [cx + 9, 26], [cx + 12, 22], [cx + 17, 22]], 2, C.ink);
    ell(x, cx + 19, 26, 4, 4, C.ink); ell(x, cx + 19, 26, 2, 2, C.paper);
    rect(x, cx - 16, 84, 8, 7, C.ink); rect(x, cx + 6, 84, 8, 7, C.ink);
    ell(x, cx, cy, 28, 26, C.ink);
    [[cx - 11, 1], [cx + 10, -1]].forEach(([ex, k]) => { ell(x, ex, 52, 6, 6, C.paper); ell(x, ex, 53, 2.5, 3, C.ink); line(x, [[ex - 6, 43 + 2 * k], [ex + 6, 43 - 2 * k]], 2, C.paper); });
    ell(x, cx, 69, 10, 7, C.paper); ell(x, cx, 75, 5, 5, C.pink); rect(x, cx, 71, 1, 5, C.ink);
    ell(x, cx + 10, 79 + Math.min(f % 12, 6) * 0.6, 2, 3, C.sky);
  }

  // st: {mood, phones, crown, shades, eating}
  function draw(cv, st, f) {
    const x = cv.getContext('2d', { willReadFrequently: true });
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, 140, 100);
    const m = st.mood || 'content';
    const o = { crown: st.crown, shades: st.shades, eating: st.eating };
    const bob = SLEEPY.includes(m) ? 0 : f % 10 < 5 ? 0 : 1;
    x.save(); x.translate(14, -4 + bob);
    if (m === 'starving') starving(x, f);
    else if (m === 'party') {
      const p = Math.floor(f / 5) % 2;
      x.save(); x.translate(48, 82); x.rotate((p ? 12 : -12) * R); x.translate(-48 + (p ? 3 : -3), -82 - (p ? 1 : 5));
      body(x, 'party', f, { ...o, joy: true });
      [-1, 1].forEach((s) => { const up = (s === -1) === (p === 0); const sx = 48 + s * 30; const tip = up ? [sx + s * 10, 34] : [sx + s * 12, 58]; line(x, [[sx, 60], tip], 4, C.ink); ell(x, tip[0], tip[1], 3, 3, C.ink); });
      x.restore();
    } else { body(x, m, f, o); chips(x, { content: 2, stuffed: 3 }[m] || 0, f); }
    if (st.phones && !QUIET.includes(m)) phones(x);
    x.restore();
    x.save(); x.translate(14, -4);
    if (SLEEPY.includes(m)) zzz(x, f);
    if (m === 'purr') { const r = f % 16; glyph(x, 'H', 84, 36 - Math.floor(r / 3), C.pink); if (r > 6) glyph(x, 'H', 96, 30 - Math.floor(r / 4), C.pink); }
    if (m === 'sus' || m === 'drift') glyph(x, 'Q', 86, 30 - (f % 10 < 5 ? 0 : 1), C.sun);
    if (m === 'shh' && f % 10 < 6) ell(x, 92, 34, 4, 4, C.acc);
    if (m === 'party' || (st.phones && !QUIET.includes(m) && m !== 'focus')) notes(x, f);
    x.restore();
    quantise(x);
  }

  function quantise(x) {
    const W = 140, H = 100, im = x.getImageData(0, 0, W, H), d = im.data, solid = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) {
      if (d[i * 4 + 3] < 110) { d[i * 4 + 3] = 0; continue; }
      solid[i] = 1;
      const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
      let best = 0;
      if (Math.max(r, g, b) - Math.min(r, g, b) < 45) best = (r + g + b) / 3 > 128 ? 1 : 0;
      else {
        let bd = 1e9;
        for (let k = 0; k < PAL.length; k++) { const p = PAL[k]; const dd = (r - p[0]) ** 2 + (g - p[1]) ** 2 + (b - p[2]) ** 2; if (dd < bd) { bd = dd; best = k; } }
      }
      d[i * 4] = PAL[best][0]; d[i * 4 + 1] = PAL[best][1]; d[i * 4 + 2] = PAL[best][2]; d[i * 4 + 3] = 255;
    }
    // paper sticker outline, one pixel wide
    for (let y = 0; y < H; y++) for (let X = 0; X < W; X++) {
      const i = y * W + X;
      if (solid[i]) continue;
      let n = false;
      for (let dy = -1; dy <= 1 && !n; dy++) for (let dx = -1; dx <= 1; dx++) {
        const yy = y + dy, xx = X + dx;
        if (yy >= 0 && yy < H && xx >= 0 && xx < W && solid[yy * W + xx]) { n = true; break; }
      }
      if (n) { d[i * 4] = PAL[1][0]; d[i * 4 + 1] = PAL[1][1]; d[i * 4 + 2] = PAL[1][2]; d[i * 4 + 3] = 255; }
    }
    x.putImageData(im, 0, 0);
  }

  window.Muncher = { draw, MOODS: ['hungry', 'content', 'stuffed', 'party', 'starving', 'snooze', 'asleep', 'focus', 'night', 'shh', 'purr', 'stretch', 'drift', 'sus'] };
})();
