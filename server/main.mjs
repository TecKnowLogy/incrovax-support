import http from 'node:http';
import { randomBytes, createHash, scryptSync, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const secret = () => randomBytes(32).toString('base64url');
const hash = x => createHash('sha256').update(x).digest('hex');
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const clean = (x, limit = 120) => typeof x === 'string' ? x.trim().slice(0, limit) : '';

export function createControl({ password, publicUrl = 'http://127.0.0.1:8787', dataDir, now = Date.now } = {}) {
  if (typeof password !== 'string' || password.length < 14) throw new Error('ADMIN_PASSWORD muss mindestens 14 Zeichen lang sein.');
  const origin = new URL(publicUrl).origin;
  if (!origin.startsWith('https://') && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname)) throw new Error('Externe Adressen erfordern HTTPS.');
  const salt = randomBytes(16), passwordHash = scryptSync(password, salt, 32);
  const db = dataDir && existsSync(path.join(dataDir, 'state.json')) ? JSON.parse(readFileSync(path.join(dataDir, 'state.json'), 'utf8')) : { customers: [], devices: [], audit: [] };
  const logins = new Map(), attempts = new Map(), enrollments = new Map(), sessions = new Map(), lastSeen = new Map();
  const rate = new Map();
  const persist = () => {
    if (!dataDir) return;
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    const target = path.join(dataDir, 'state.json');
    writeFileSync(target + '.tmp', JSON.stringify(db), { mode: 0o600 });
    renameSync(target + '.tmp', target);
  };
  const audit = (event, deviceId = '') => { db.audit.push({ at: new Date(now()).toISOString(), event, deviceId }); db.audit = db.audit.slice(-500); persist(); };
  const status = (s) => {
    if (s && ['requested', 'active'].includes(s.state) && (now() > s.expires || now() - s.operatorSeen > 30000 || now() - (lastSeen.get(s.deviceId) || 0) > 30000)) {
      s.state = 'ended'; s.events = []; s.frame = null;
    }
    return s;
  };
  const view = s => ({ id: s.id, deviceId: s.deviceId, state: s.state, expires: s.expires });
  const prune = () => {
    for (const [k, v] of logins) if (v.expires < now()) logins.delete(k);
    for (const [k, v] of enrollments) if (v.expires < now()) enrollments.delete(k);
    for (const [k, v] of attempts) if (v.until < now()) attempts.delete(k);
    for (const [k, v] of sessions) { status(v); if (now() - v.created > 3600000) sessions.delete(k); }
    for (const [k, v] of rate) if (v.since + 60000 < now()) rate.delete(k);
  };
  const limit = (key, max) => { const entry = rate.get(key) || { since: now(), n: 0 }; if (entry.since + 60000 < now()) { entry.since = now(); entry.n = 0; } entry.n++; rate.set(key, entry); if (entry.n > max) fail(429, 'Zu viele Anfragen.'); };
  const login = (req, mutation) => {
    const cookie = /(?:^|;\s*)incrovax_session=([^;]+)/.exec(req.headers.cookie || '')?.[1];
    const record = cookie && logins.get(hash(cookie));
    if (!record || record.expires < now()) fail(401, 'Bitte anmelden.');
    if (mutation && (req.headers.origin !== origin || req.headers['x-csrf-token'] !== record.csrf)) fail(403, 'Anfrage abgelehnt.');
    return record;
  };
  const agent = req => {
    const token = /^Bearer (.+)$/.exec(req.headers.authorization || '')?.[1];
    const device = token && db.devices.find(d => d.tokenHash === hash(token) && !d.revoked);
    if (!device) fail(401, 'Geraetezugang ungueltig.');
    limit('agent:' + device.id, 500); return device;
  };
  const body = async (req, max = 8192) => {
    let size = 0; const chunks = [];
    for await (const chunk of req) { size += chunk.length; if (size > max) fail(413, 'Anfrage zu gross.'); chunks.push(chunk); }
    return Buffer.concat(chunks);
  };
  const jsonBody = async req => {
    if (!(req.headers['content-type'] || '').startsWith('application/json')) fail(415, 'JSON erwartet.');
    try { return JSON.parse((await body(req)).toString()); } catch (err) { if (err.status) throw err; fail(400, 'JSON ungueltig.'); }
  };
  const keys = new Set(['Enter', 'Escape', 'Tab', 'Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', 'Shift', 'Control', 'Alt', ' ']);
  const publicDir = fileURLToPath(new URL('./public/', import.meta.url));
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const reply = (value, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
    try {
      prune();
      const u = new URL(req.url, origin), p = u.pathname, method = req.method;
      if (method === 'GET' && ['/','/app.js','/style.css','/logo.png'].includes(p)) {
        const file = p === '/' ? 'index.html' : p.slice(1);
        res.setHeader('Content-Type', ({ 'index.html': 'text/html; charset=utf-8', 'app.js': 'text/javascript; charset=utf-8', 'style.css': 'text/css; charset=utf-8', 'logo.png': 'image/png' })[file]);
        return res.end(readFileSync(path.join(publicDir, file)));
      }
      if (p === '/health' && method === 'GET') return reply({ status: 'ok', version: '0.1.0' });
      if (p === '/api/login' && method === 'POST') {
        if (req.headers.origin !== origin) fail(403, 'Herkunft ungueltig.');
        const ip = req.socket.remoteAddress; // Proxy headers are never trusted for security decisions.
        limit('login:' + ip, 20);
        if ((attempts.get(ip)?.count || 0) >= 5) fail(429, 'Anmeldung voruebergehend gesperrt.');
        const b = await jsonBody(req);
        if (typeof b.password !== 'string' || b.password.length > 1024 || !timingSafeEqual(scryptSync(b.password, salt, 32), passwordHash)) {
          const a = attempts.get(ip) || { count: 0, until: now() + 900000 }; a.count++; attempts.set(ip, a); fail(401, 'Anmeldung fehlgeschlagen.');
        }
        attempts.delete(ip);
        const token = secret(), record = { csrf: secret(), expires: now() + 8 * 3600000 };
        logins.set(hash(token), record);
        res.setHeader('Set-Cookie', `incrovax_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${origin.startsWith('https:') ? '; Secure' : ''}`);
        return reply({ csrf: record.csrf });
      }
      if (p.startsWith('/api/agent/')) {
        if (p === '/api/agent/enroll' && method === 'POST') {
          limit('enroll:' + req.socket.remoteAddress, 30);
          const b = await jsonBody(req), ticketKey = hash(clean(b.code, 200)), ticket = enrollments.get(ticketKey);
          if (!ticket || ticket.expires < now()) fail(403, 'Registrierungscode ungueltig oder abgelaufen.');
          if (!clean(b.name)) fail(400, 'Geraetename fehlt.');
          enrollments.delete(ticketKey);
          const token = secret(), device = { id: secret(), customerId: ticket.customerId, name: clean(b.name), os: clean(b.os), tokenHash: hash(token), created: now() };
          db.devices.push(device); lastSeen.set(device.id, now()); audit('device.enrolled', device.id);
          return reply({ id: device.id, token });
        }
        const d = agent(req);
        if (p === '/api/agent/poll' && method === 'POST') {
          const b = await jsonBody(req); d.os = clean(b.os || d.os); lastSeen.set(d.id, now());
          const s = [...sessions.values()].map(status).find(s => s.deviceId === d.id && ['requested','active'].includes(s.state));
          const events = s?.state === 'active' ? s.events.splice(0, 100) : [];
          return reply({ session: s ? view(s) : null, events });
        }
        const id = p.split('/')[3], s = status(sessions.get(id));
        if (!s || s.deviceId !== d.id) fail(404, 'Sitzung unbekannt.');
        if (p.endsWith('/consent') && method === 'POST') {
          const b = await jsonBody(req);
          if (s.state !== 'requested') fail(409, 'Anfrage nicht mehr aktiv.');
          s.state = b.accept === true ? 'active' : 'denied'; audit('session.' + s.state, d.id); return reply(view(s));
        }
        if (p.endsWith('/end') && method === 'POST') { s.state = 'ended'; s.frame = null; s.events = []; audit('session.ended-by-device', d.id); return reply(view(s)); }
        if (p.endsWith('/frame') && method === 'POST') {
          if (s.state !== 'active') fail(409, 'Keine Freigabe.');
          if (req.headers['content-type'] !== 'image/jpeg') fail(415, 'JPEG erwartet.');
          const image = await body(req, 2 * 1024 * 1024);
          if (image.length < 4 || image[0] !== 255 || image[1] !== 216 || image.at(-2) !== 255 || image.at(-1) !== 217) fail(400, 'JPEG ungueltig.');
          if (s.lastFrame && now() - s.lastFrame < 200) fail(429, 'Bildrate zu hoch.');
          s.frame = image; s.lastFrame = now(); return reply({ ok: true });
        }
        fail(404, 'Nicht gefunden.');
      }
      const operator = login(req, method !== 'GET');
      if (p === '/api/me' && method === 'GET') return reply({ csrf: operator.csrf });
      if (p === '/api/logout' && method === 'POST') {
        for (const s of sessions.values()) { s.state = 'ended'; s.frame = null; s.events = []; }
        logins.clear(); res.setHeader('Set-Cookie','incrovax_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'); return reply({ ok: true });
      }
      if (p === '/api/customers' && method === 'GET') return reply(db.customers);
      if (p === '/api/customers' && method === 'POST') {
        const b = await jsonBody(req); if (!clean(b.name)) fail(400, 'Kundenname fehlt.');
        const customer = { id: secret(), name: clean(b.name) }; db.customers.push(customer); persist(); return reply(customer, 201);
      }
      if (p === '/api/devices' && method === 'GET') return reply(db.devices.filter(d => !d.revoked).map(d => ({ id: d.id, name: d.name, os: d.os, customerId: d.customerId, online: now() - (lastSeen.get(d.id) || 0) < 30000 })));
      if (p === '/api/audit' && method === 'GET') return reply(db.audit.slice(-100).reverse());
      if (p === '/api/enrollments' && method === 'POST') {
        const b = await jsonBody(req); if (!db.customers.some(c => c.id === b.customerId)) fail(400, 'Kunde unbekannt.');
        const code = secret(); enrollments.set(hash(code), { customerId: b.customerId, expires: now() + 600000 }); return reply({ code, expiresInSeconds: 600 });
      }
      if (p.startsWith('/api/devices/') && method === 'DELETE') {
        const d = db.devices.find(d => d.id === p.split('/')[3]); if (!d) fail(404, 'Geraet unbekannt.');
        d.revoked = true; for (const s of sessions.values()) if (s.deviceId === d.id) { s.state = 'ended'; s.frame = null; s.events = []; }
        audit('device.revoked', d.id); return reply({ ok: true });
      }
      if (p === '/api/sessions' && method === 'POST') {
        const b = await jsonBody(req), d = db.devices.find(d => d.id === b.deviceId && !d.revoked);
        if (!d || now() - (lastSeen.get(d.id) || 0) > 30000) fail(409, 'Geraet offline.');
        if ([...sessions.values()].map(status).some(s => s.deviceId === d.id && ['requested','active'].includes(s.state))) fail(409, 'Bereits eine Sitzung aktiv.');
        const s = { id: secret(), deviceId: d.id, state: 'requested', created: now(), expires: now() + 600000, operatorSeen: now(), events: [], frame: null };
        sessions.set(s.id, s); audit('session.requested', d.id); return reply(view(s), 201);
      }
      if (p.startsWith('/api/sessions/')) {
        const s = status(sessions.get(p.split('/')[3])); if (!s) fail(404, 'Sitzung unbekannt.');
        if (method === 'GET') s.operatorSeen = now();
        if (p.endsWith('/frame') && method === 'GET') {
          if (s.state !== 'active' || !s.frame) { res.writeHead(204); return res.end(); }
          res.setHeader('Content-Type', 'image/jpeg'); return res.end(s.frame);
        }
        if (p.endsWith('/end') && method === 'POST') { s.state = 'ended'; s.frame = null; s.events = []; audit('session.ended-by-technician', s.deviceId); return reply(view(s)); }
        if (p.endsWith('/input') && method === 'POST') {
          if (s.state !== 'active') fail(409, 'Keine Freigabe.');
          limit('input:' + s.id, 2400);
          const e = await jsonBody(req);
          if (!['move','button','scroll','key'].includes(e.kind)) fail(400, 'Eingabe ungueltig.');
          if (['move','button'].includes(e.kind) && ![e.x,e.y].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1)) fail(400, 'Position ungueltig.');
          if (e.kind === 'button' && (![0,2].includes(e.button) || typeof e.down !== 'boolean')) fail(400, 'Maustaste ungueltig.');
          if (e.kind === 'key' && (typeof e.key !== 'string' || !(/^[a-zA-Z0-9]$/.test(e.key) || keys.has(e.key)) || typeof e.down !== 'boolean')) fail(400, 'Taste ungueltig.');
          if (e.kind === 'scroll' && ![-1,1].includes(e.delta)) fail(400, 'Scrollrichtung ungueltig.');
          if (s.events.length >= 100) fail(429, 'Eingabepuffer voll.');
          s.events.push(e); return reply({ ok: true });
        }
        if (method === 'GET' && p === '/api/sessions/' + s.id) return reply(view(s));
      }
      fail(404, 'Nicht gefunden.');
    } catch (err) { if (!res.headersSent) reply({ error: err.status ? err.message : 'Interner Fehler.' }, err.status || 500); else res.end(); }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000; server.maxHeadersCount = 50;
  return server;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const host = process.env.BIND_HOST || '127.0.0.1';
  if (!['127.0.0.1','::1','localhost'].includes(host)) throw new Error('Server nur hinter einem lokalen HTTPS-Reverse-Proxy betreiben.');
  const server = createControl({ password: process.env.ADMIN_PASSWORD, publicUrl: process.env.PUBLIC_URL, dataDir: process.env.DATA_DIR || './data' });
  server.listen(Number(process.env.PORT || 8787), host, () => console.log('INCrovax Control Entwicklungsserver gestartet.'));
}
