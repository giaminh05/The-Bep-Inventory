import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, passwordHash, verifyPassword } from './db.mjs';
import { applyAction, digest, HttpError, readHistory, readPhoto, readReport, snapshot } from './inventory.mjs';

const web = new URL('../web/', import.meta.url);
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/staff', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/view.js', ['view.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/config.js', ['config.js', 'text/javascript; charset=utf-8']],
  ['/icon.svg', ['icon.svg', 'image/svg+xml']],
]);
const photoLimit = 7 * 1024 * 1024 + 65536;
const sessionDuration = 12 * 60 * 60 * 1000;
const fakeHash = passwordHash(randomBytes(32).toString('hex'));

function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}

async function readJson(req, maxBytes) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) {
    throw new HttpError(415, 'Gửi dữ liệu JSON.');
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size <= maxBytes) chunks.push(chunk);
  }
  if (size > maxBytes) throw new HttpError(413, 'Dữ liệu gửi lên quá lớn.');
  try {
    const data = JSON.parse(Buffer.concat(chunks));
    if (data && typeof data === 'object' && !Array.isArray(data)) return data;
  } catch {
    // A malformed or empty body is handled below.
  }
  throw new HttpError(400, 'Dữ liệu JSON không hợp lệ.');
}

export function inventoryServer({ db, allowedOrigins = ['capacitor://localhost', 'https://localhost'] }) {
  const logins = new Map();
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const path = url.pathname;
      const origin = req.headers.origin;
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('Cache-Control', 'no-store');
      if (path.startsWith('/api/') && origin && allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Idempotency-Key, X-Staff-Account');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      }
      if (req.method === 'OPTIONS' && path.startsWith('/api/')) {
        if (!allowedOrigins.includes(origin)) throw new HttpError(403, 'Nguồn truy cập không được cấp quyền.');
        res.writeHead(204).end();
        return;
      }
      if (req.method === 'GET' && assets.has(path)) {
        const [file, type] = assets.get(path);
        res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
        res.writeHead(200, { 'Content-Type': type });
        res.end(readFileSync(new URL(file, web)));
        return;
      }
      if (req.method === 'GET' && path === '/api/health') {
        db.prepare('SELECT 1').get();
        return json(res, 200, { ok: true });
      }
      if (req.method === 'POST' && path === '/api/login') {
        const { username, password, native = false } = await readJson(req, 4096);
        if (typeof username !== 'string' || typeof password !== 'string' || username.length > 80 || password.length > 256) {
          throw new HttpError(400, 'Thông tin đăng nhập không hợp lệ.');
        }
        const ip = req.socket.remoteAddress;
        const time = Date.now();
        for (const [address, attempt] of logins) if (attempt.until <= time) logins.delete(address);
        const attempt = logins.get(ip) ?? { count: 0, until: time + 60_000 };
        if (attempt.count >= 20) throw new HttpError(429, 'Thử đăng nhập lại sau một phút.');
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(username.trim().toLowerCase());
        if (!verifyPassword(password, user?.password ?? fakeHash) || !user) {
          attempt.count++;
          logins.set(ip, attempt);
          throw new HttpError(401, 'Sai tên đăng nhập hoặc mật khẩu.');
        }
        const token = randomBytes(32).toString('hex');
        const persistent = native === true && user.role === 'staff';
        db.prepare('DELETE FROM sessions WHERE expires > 0 AND expires <= ?').run(time);
        const session = db.prepare(`
          INSERT INTO sessions SELECT ?, id, ? FROM users WHERE id = ? AND password = ?
        `).run(digest(token), persistent ? 0 : time + sessionDuration, user.id, user.password);
        if (!session.changes) throw new HttpError(401, 'Mật khẩu đã thay đổi. Vui lòng đăng nhập lại.');
        return json(res, 200, { token, ...(persistent && { persistent }) });
      }
      if (!path.startsWith('/api/')) throw new HttpError(404, 'Không tìm thấy trang.');
      const token = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || '')?.[1];
      const tokenHash = token && digest(token);
      const signedInUser = tokenHash && db.prepare(`
        SELECT users.id, users.name, users.role, users.location_id
        FROM sessions JOIN users ON users.id = user_id WHERE token_hash = ? AND (expires = 0 OR expires > ?)
      `).get(tokenHash, Date.now());
      if (!signedInUser) throw new HttpError(401, 'Phiên hết hạn. Vui lòng đăng nhập.');
      if (req.method === 'POST' && path === '/api/logout') {
        db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
        return json(res, 200, { ok: true });
      }
      const staffAccount = req.headers['x-staff-account'];
      let user = signedInUser;
      if (staffAccount !== undefined) {
        if (signedInUser.role !== 'manager') throw new HttpError(403, 'Chỉ quản lý được chuyển tài khoản.');
        user = db.prepare(`
          SELECT id, name, role, location_id FROM users WHERE id = ? AND role = 'staff' AND location_id IS NOT NULL
        `).get(staffAccount);
        if (!user) throw new HttpError(404, 'Không tìm thấy tài khoản nhân viên.');
      }
      if (req.method === 'GET' && path === '/api/snapshot') return json(res, 200, snapshot(db, user));
      if (req.method === 'GET' && path === '/api/report') {
        return json(res, 200, readReport(db, user, url.searchParams.get('location'), url.searchParams.get('week')));
      }
      if (req.method === 'GET' && path === '/api/history') {
        return json(res, 200, readHistory(db, user, url.searchParams.get('location'), url.searchParams.get('before'),
          url.searchParams.get('q') ?? ''));
      }
      if (req.method === 'GET' && /^\/api\/photos\/[\w-]+$/.test(path)) {
        const photo = readPhoto(db, user, path.split('/').at(-1));
        res.writeHead(200, { 'Content-Type': photo.photo_type });
        res.end(Buffer.from(photo.photo));
        return;
      }
      const action = /^\/api\/([a-z-]+)$/.exec(path)?.[1];
      if (req.method === 'POST' && action) {
        const input = await readJson(req, ['receipts', 'delivery-receipts-all'].includes(action) ? photoLimit : 65536);
        // A password reset can revoke this session while the request body is arriving.
        if (!db.prepare('SELECT 1 FROM sessions WHERE token_hash = ? AND (expires = 0 OR expires > ?)').get(tokenHash, Date.now())) {
          throw new HttpError(401, 'Phiên hết hạn. Vui lòng đăng nhập.');
        }
        const result = applyAction(db, user, action, req.headers['idempotency-key'], input,
          staffAccount === undefined ? null : signedInUser.id);
        return json(res, 200, result);
      }
      throw new HttpError(404, 'Không tìm thấy yêu cầu.');
    } catch (error) {
      if (res.destroyed || res.headersSent) return;
      if (error instanceof HttpError) return json(res, error.status, { error: error.message });
      console.error(error);
      json(res, 500, { error: 'Máy chủ chưa xử lý được yêu cầu.' });
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const db = openDatabase(process.env.BEP_DB ?? fileURLToPath(new URL('../data/demo.sqlite', import.meta.url)),
    { demo: !process.env.BEP_LIVE });
  const allowedOrigins = process.env.BEP_ORIGINS?.split(',').map(value => value.trim());
  const host = process.env.BEP_HOST ?? '127.0.0.1';
  const port = Number(process.env.BEP_PORT ?? 4170);
  const server = inventoryServer({ db, allowedOrigins });
  server.listen(port, host, () => console.log(`The Bếp Inventory • http://${host}:${server.address().port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => db.close()));
}
