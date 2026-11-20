import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '../server/db.mjs';
import { inventoryServer } from '../server/http.mjs';
import { nextFixtureEnvironment } from './lib/next-fixture-environment.mjs';

const require = createRequire(import.meta.url);
const appRequire = createRequire(new URL('../apps/web/package.json', import.meta.url));
const next = appRequire.resolve('next/dist/bin/next');
const app = fileURLToPath(new URL('../apps/web/', import.meta.url));
const { chromium } = require(process.env.BEP_PLAYWRIGHT ?? 'playwright');
const db = openDatabase(':memory:', { demo: true });
let backend = inventoryServer({ db }).listen(0, '127.0.0.1');
await once(backend, 'listening');
const backendPort = backend.address().port;
const backendOrigin = 'http://127.0.0.1:' + backendPort;
const output = await mkdtemp(join(tmpdir(), 'bep-next-foundation-'));
const errors = [];
let browser;
let nextServer;

function command(args, origin) {
  const env = nextFixtureEnvironment(origin);
  const child = spawn(process.execPath, [next, ...args], { cwd: app, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  child.stdout.on('data', chunk => { logs += chunk; });
  child.stderr.on('data', chunk => { logs += chunk; });
  const completion = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(new Error('Next command failed: ' + logs)));
  });
  // An intentionally stopped server must not generate an unhandled rejection.
  completion.catch(() => {});
  return { child, completion, getLogs: () => logs };
}

async function stopNext() {
  if (!nextServer) return;
  const running = nextServer;
  nextServer = undefined;
  if (running.child.exitCode === null && running.child.signalCode === null) running.child.kill();
  await running.completion.catch(() => {});
}

async function startNext(origin) {
  const probe = createServer().listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  nextServer = command(['start', '--hostname', '127.0.0.1', '--port', String(port)], origin);
  const url = 'http://127.0.0.1:' + port;
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (nextServer.child.exitCode !== null) throw new Error(nextServer.getLogs());
    if (await fetch(url).then(response => response.ok).catch(() => false)) return url;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error('Next server did not become ready.');
}

try {
  browser = await chromium.launch({ executablePath: process.env.BEP_CHROME || undefined });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh' });
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));

  // Rewrites and static route output are environment-specific: test both real builds.
  await command(['build'], undefined).completion;
  const unconfigured = await startNext(undefined);
  await page.goto(unconfigured);
  await page.getByText('Chưa cấu hình kết nối', { exact: true }).waitFor();
  const icon = await page.locator('link[rel="icon"]').getAttribute('href');
  assert.ok(icon?.startsWith('/icon.svg'), 'the preview supplies its own icon instead of a missing default favicon');
  assert.equal((await page.request.get(unconfigured + icon)).status(), 200);
  assert.equal(await page.getByRole('link', { name: /Mở ứng dụng hiện tại/ }).count(), 0);
  assert.equal(await page.evaluate(() => sessionStorage.length + localStorage.length), 0);
  console.log('PASS unconfigured production build selects no backend or credentials');
  await stopNext();

  await command(['build'], backendOrigin).completion;
  const url = await startNext(backendOrigin);
  await page.goto(url);
  await page.getByText('API đang phản hồi', { exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: /Mở ứng dụng hiện tại/ }).getAttribute('href'), backendOrigin);
  const health = await page.request.get(url + '/api/health');
  assert.equal(health.status(), 200);
  assert.deepEqual(await health.json(), { ok: true });
  assert.equal(health.headers()['cache-control'], 'no-store');
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM sessions').get().total, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM movements').get().total, 0);

  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [path, heading] of [['/', null], ['/preview/manager', 'Không gian quản lý'], ['/preview/staff', 'Không gian nhân viên']]) {
      await page.goto(url + path);
      await page.getByText('API đang phản hồi', { exact: true }).waitFor();
      if (heading) await page.getByRole('heading', { name: heading, exact: true }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${path} at${width}px`);
      if (path.includes('preview')) {
        assert.equal(await page.locator('.location-list li').count(), 5);
        assert.equal(await page.getByRole('textbox').count(), 0, 'preview must not offer data entry');
      }
      if (width < 650 && path.endsWith('manager')) {
        await page.locator('.mobile-menu summary').click();
        await page.locator('.mobile-menu nav a[href="#locations"]').click();
        assert.equal(new URL(page.url()).hash, '#locations');
      }
      if (width < 650 && path.endsWith('staff')) {
        await page.locator('.staff-bottom-nav a[href="#locations"]').click();
        assert.equal(new URL(page.url()).hash, '#locations');
      }
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url + '/preview/staff');
  await page.emulateMedia({ colorScheme: 'light' });
  const light = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  const dark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert.notEqual(dark, light);
  await page.evaluate(() => { document.documentElement.style.fontSize = '125%'; });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: join(output, 'staff-dark-large-text.png'), fullPage: true });
  await page.goto(url);
  await page.keyboard.press('Tab');
  assert.equal(await page.getByRole('link', { name: 'Đến nội dung chính' }).evaluate(element => element === document.activeElement), true);
  await page.keyboard.press('Enter');
  assert.equal(new URL(page.url()).hash, '#main-content');
  console.log('PASS preview routes, responsive navigation, dark mode, enlarged text and keyboard skip link');

  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(url + '/preview/manager');
  await page.screenshot({ path: join(output, 'manager-desktop.png'), fullPage: true });
  await new Promise(resolve => backend.close(resolve));
  await page.reload();
  await page.getByText('Chưa kết nối được API', { exact: true }).waitFor();
  backend = inventoryServer({ db }).listen(backendPort, '127.0.0.1');
  await once(backend, 'listening');
  await page.getByRole('button', { name: 'Thử kết nối lại', exact: true }).click();
  await page.getByText('API đang phản hồi', { exact: true }).waitFor();
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM sessions').get().total, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM movements').get().total, 0);
  const missing = await page.goto(url + '/not-a-real-route');
  assert.equal(missing.status(), 404);
  assert.deepEqual(errors, []);
  console.log('PASS real API outage/retry, uncached proxy and not-found handling without inventory writes');
  console.log('Screenshots: ' + output);
} finally {
  await browser?.close();
  await stopNext();
  if (backend.listening) await new Promise(resolve => backend.close(resolve));
  db.close();
}
