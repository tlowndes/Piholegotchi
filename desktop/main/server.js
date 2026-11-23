// A small local API, so Flight Deck and Home Assistant can talk to the widget the way they did to the Pi:
//   POST /api/deck       Flight Deck's day and Focus sessions (same JSON as the Pi)
//   POST /api/message    {"message": "...", "title": "...", "minutes": 5} from a Home Assistant automation
//   POST /api/doorbell   someone rang; grabs the camera snapshot set in Settings
//   GET  /api/status     a quick "is it there?"
const http = require('http');

function startServer(hub, port) {
  const srv = http.createServer((rq, rs) => {
    const send = (code, obj) => { rs.writeHead(code, { 'Content-Type': 'application/json' }); rs.end(JSON.stringify(obj)); };
    const path = rq.url.split('?')[0];
    if (rq.method === 'GET' && path === '/api/status') return send(200, { ok: true, app: 'piholegotchi-desktop', mood: hub.snapshot().mood });
    if (rq.method !== 'POST') return send(404, { error: 'Not here.' });
    let raw = '';
    rq.on('data', (d) => { raw += d; if (raw.length > 1e6) rq.destroy(); });
    rq.on('end', async () => {
      let body = {};
      try { body = raw ? JSON.parse(raw) : {}; } catch { return send(400, { error: "That isn't JSON." }); }
      try {
        if (path === '/api/deck') hub.receiveDeck(body);
        else if (path === '/api/message') hub.postMessage(body);
        else if (path === '/api/doorbell') await hub.ring(typeof body.image === 'string' && body.image.startsWith('data:image/') ? body.image : '');
        else return send(404, { error: 'Not here.' });
        send(200, { ok: true });
      } catch (e) { send(400, { error: e.message }); }
    });
  });
  srv.on('error', (e) => console.warn('api server:', e.message));
  srv.listen(port, '0.0.0.0');
  return srv;
}

module.exports = { startServer };
