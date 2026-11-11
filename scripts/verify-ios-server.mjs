import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:https';
import { request } from 'node:http';
import { once } from 'node:events';
import { join } from 'node:path';
import { openDatabase } from '../server/db.mjs';
import { inventoryServer } from '../server/http.mjs';

const temp = process.env.BEP_IOS_TMP;
const file = name => join(temp, name);
const db = openDatabase(':memory:', { demo: true });
const backend = inventoryServer({ db }).listen(0, '127.0.0.1');
await once(backend, 'listening');
const count = db.prepare("SELECT COUNT(*) AS total FROM sessions WHERE user_id = 'norcross' AND expires = 0");
createServer({ key: readFileSync(file('key.pem')), cert: readFileSync(file('cert.pem')) }, (req, res) => {
  const url = new URL(req.url, 'https://127.0.0.1');
  if (url.pathname === '/__verify') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    const phase = readFileSync(file('phase'), 'utf8');
    if (req.method === 'POST') {
      const expectedSessions = ['logout', 'after-logout'].includes(phase) ? 0 : 1;
      const outcome = url.searchParams.get('result');
      writeFileSync(file(phase), outcome === 'pass' && count.get().total !== expectedSessions ? 'Unexpected session count' : outcome);
      res.end();
    } else res.end(phase);
    return;
  }
  const upstream = request({ hostname: '127.0.0.1', port: backend.address().port, path: req.url,
    method: req.method, headers: req.headers }, reply => {
    res.writeHead(reply.statusCode, reply.headers);
    reply.pipe(res);
  });
  upstream.on('error', () => res.writeHead(502).end());
  req.pipe(upstream);
}).listen(4173, '127.0.0.1');
