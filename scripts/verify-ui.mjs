import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { openDatabase } from '../server/db.mjs';
import { inventoryServer } from '../server/http.mjs';

// Everything uses disposable demo data; screenshots go outside the repository.
const db = openDatabase(':memory:', { demo: true });
const server = inventoryServer({ db }).listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const url = 'http://127.0.0.1:' + server.address().port;
const output = await mkdtemp(join(tmpdir(), 'bep-ui-'));
const errors = [];
let browser;

async function login(page, username) {
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.locator('[name="username"]').fill(username);
  await page.locator('[name="password"]').fill('BepDemo2026!');
  await page.locator('#login-form button').click();
  await page.locator('.heading h1').waitFor();
}

try {
  browser = await chromium.launch({ executablePath: process.env.BEP_CHROME || undefined });
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await login(desktop, 'manager');
  for (const colorScheme of ['light', 'dark']) {
    await desktop.emulateMedia({ colorScheme });
    assert.equal(await desktop.evaluate(() => getComputedStyle(document.querySelector('.stat')).backgroundColor === getComputedStyle(document.querySelector('.panel')).backgroundColor), true, 'Theme changes must update card surfaces immediately.');
    await desktop.screenshot({ path: join(output, 'manager-' + colorScheme + '.png') });
  }

  // Refresh keeps the current content, exposes its pending state, and offers recovery.
  let releaseSnapshot;
  await desktop.route('**/api/snapshot', async route => {
    await new Promise(resolve => { releaseSnapshot = resolve; });
    await route.continue();
  });
  await desktop.getByRole('button', { name: 'Làm mới', exact: true }).click();
  await desktop.waitForFunction(() => document.querySelector('[data-action="refresh"]').disabled);
  assert.equal(await desktop.locator('.stock-table tbody tr').count(), 3);
  while (!releaseSnapshot) await new Promise(resolve => setTimeout(resolve, 10));
  releaseSnapshot();
  await desktop.waitForFunction(() => !document.querySelector('#app').hasAttribute('aria-busy'));
  await desktop.unroute('**/api/snapshot');
  await desktop.route('**/api/snapshot', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Máy chủ tạm gián đoạn.' }) }));
  await desktop.getByRole('button', { name: 'Làm mới', exact: true }).click();
  await desktop.locator('#page-feedback button').waitFor();
  assert.equal(await desktop.locator('.stock-table tbody tr').count(), 3);
  await desktop.unroute('**/api/snapshot');
  await desktop.locator('#page-feedback button').click();
  await desktop.locator('#page-feedback').waitFor({ state: 'hidden' });

  const managerPhone = await browser.newPage({ viewport: { width: 320, height: 844 }, isMobile: true, hasTouch: true });
  await login(managerPhone, 'manager');
  await managerPhone.getByRole('button', { name: 'Chức năng', exact: true }).click();
  await managerPhone.locator('[data-manager-nav] [data-id="deliveries"]').click();
  await managerPhone.getByRole('button', { name: 'Tạo đơn giao', exact: true }).click();
  const dialog = managerPhone.locator('#dialog');
  assert.equal(await dialog.evaluate(element => Math.round(element.getBoundingClientRect().width)), 320);
  await dialog.locator('[name="supplier"]').fill('Nhà cung cấp thử nghiệm');
  await dialog.getByRole('button', { name: 'Hủy', exact: true }).click();
  await dialog.locator('.discard-confirm').waitFor();
  await dialog.getByRole('button', { name: 'Tiếp tục nhập', exact: true }).click();
  assert.equal(await dialog.locator('[name="supplier"]').inputValue(), 'Nhà cung cấp thử nghiệm');
  await managerPhone.keyboard.press('Escape');
  await dialog.locator('.discard-confirm').waitFor();
  await dialog.getByRole('button', { name: 'Bỏ thay đổi', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });

  // Check long content, enlarged text, both themes, and the persistent staff tabs.
  db.prepare('UPDATE items SET name = ? WHERE id = ?').run('Ly 23 oz · Bao bì dùng cho đồ uống mang đi tại cửa hàng', 'cup-23');
  for (const width of [320, 390]) {
    const phone = await browser.newPage({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
    await login(phone, 'duluth');
    await phone.locator('#count-category').selectOption('Bao bì');
    const quantity = phone.locator('[data-count-item="cup-23"]');
    await quantity.fill('0');
    await phone.locator('#count-performed').fill('Người kiểm kê');
    await phone.locator('#draft-status').getByText('Đã lưu nháp trên thiết bị này.', { exact: true }).waitFor();
    await phone.setViewportSize({ width, height: 500 });
    await phone.waitForFunction(() => document.body.classList.contains('keyboard-open'));
    assert.equal(await phone.locator('#inventory-nav').isVisible(), false);
    await phone.setViewportSize({ width, height: 844 });
    await phone.waitForFunction(() => !document.body.classList.contains('keyboard-open'));
    for (const colorScheme of ['light', 'dark']) {
      await phone.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      const nav = await phone.locator('#inventory-nav').boundingBox();
      assert.equal(Math.round(nav.y + nav.height), 844);
      await phone.screenshot({ path: join(output, 'staff-' + width + '-' + colorScheme + '.png') });
    }
    await phone.evaluate(() => { document.documentElement.style.fontSize = '20px'; });
    assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await phone.screenshot({ path: join(output, 'staff-' + width + '-large-text.png') });
    await quantity.focus();
    await phone.setViewportSize({ width, height: 500 });
    await phone.waitForFunction(() => document.body.classList.contains('keyboard-open'));
    assert.equal(await phone.locator('#inventory-nav').isVisible(), false);
    await phone.setViewportSize({ width, height: 844 });
    await quantity.blur();
    await phone.locator('#inventory-nav').waitFor();
    await phone.getByRole('button', { name: 'Kiểm tra và gửi', exact: true }).click();
    await phone.locator('#dialog').waitFor();
    await phone.locator('#dialog [data-action="close"]').click();
    assert.equal(await quantity.inputValue(), '0');
    await phone.getByRole('button', { name: 'Đơn giao', exact: true }).click();
    await phone.getByRole('heading', { name: 'Đơn giao', exact: true }).waitFor();
    await phone.getByRole('button', { name: 'Phiếu kiểm kê', exact: true }).click();
    assert.equal(await quantity.inputValue(), '0');
    await phone.close();
  }
  assert.deepEqual(errors, []);
  console.log('PASS UI themes, mobile navigation, enlarged text, drafts, form dismissal, and refresh recovery.');
  console.log('Screenshots: ' + output);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  db.close();
}
