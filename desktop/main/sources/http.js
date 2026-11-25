// fetch with a timeout, and JSON helpers.
async function req(url, { method = 'GET', headers = {}, body, timeout = 8000, json = true } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const opts = { method, headers: { ...headers }, signal: ctl.signal };
    if (body !== undefined) {
      if (typeof body === 'string' || body instanceof URLSearchParams) opts.body = body;
      else { opts.body = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; }
    }
    const r = await fetch(url, opts);
    if (!json) return r;
    if (!r.ok) {
      const e = new Error(`${r.status} ${r.statusText}`);
      e.status = r.status;
      throw e;
    }
    const text = await r.text();
    return text ? JSON.parse(text) : {};
  } finally {
    clearTimeout(t);
  }
}

async function dataUrl(url, headers = {}) {
  const r = await req(url, { headers, json: false, timeout: 10000 });
  if (!r.ok) throw new Error(`${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  return `data:${r.headers.get('content-type') || 'image/jpeg'};base64,${buf.toString('base64')}`;
}

const basic = (u, p) => (u ? { Authorization: 'Basic ' + Buffer.from(`${u}:${p}`).toString('base64') } : {});

module.exports = { req, dataUrl, basic };
