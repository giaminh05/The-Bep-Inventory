import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { openDatabase } from '../server/db.mjs';
import { inventoryServer } from '../server/http.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.BEP_PLAYWRIGHT ?? 'playwright');
const browser = await chromium.launch({ executablePath: process.env.BEP_CHROME || undefined });
const errors = [];

async function scenario(name, run) {
  const db = openDatabase(':memory:', { demo: true });
  const server = inventoryServer({ db }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  const contexts = [];
  async function client(username, mobile = false) {
    const context = await browser.newContext({
      locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh',
      viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
      ...(mobile && { isMobile: true, hasTouch: true }),
    });
    contexts.push(context);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(10000);
    await page.goto(origin);
    await login(page, username);
    return { context, page };
  }
  try {
    await run({ db, client });
    console.log('PASS ' + name);
  } finally {
    await Promise.all(contexts.map(context => context.close()));
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    db.close();
  }
}

async function login(page, username) {
  await page.getByLabel('Tên đăng nhập').fill(username);
  await page.getByLabel('Mật khẩu').fill('BepDemo2026!');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.getByRole('heading', { name: username === 'manager' ? 'Tồn kho' : 'Phiếu kiểm kê', exact: true }).waitFor();
}

async function countFromManager(page, item, quantity) {
  const status = await page.evaluate(async ({ item, quantity, key }) => {
    const headers = { Authorization: 'Bearer ' + sessionStorage.getItem('bep-session') };
    const snapshot = await (await fetch('/api/snapshot', { headers })).json();
    const row = snapshot.stock.find(row => row.location_id === 'duluth' && row.item_id === item);
    const response = await fetch('/api/counts', {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify({ location: 'duluth', item, quantity, unit: 'bag', revision: row.revision }),
    });
    return response.status;
  }, { item, quantity, key: randomUUID() });
  assert.equal(status, 200);
}

async function draftValues(page, account, category, switched = false) {
  return page.evaluate(({ account, category, switched }) => {
    const scope = ['bep-count-draft', '', 'green-tea', account];
    if (switched) scope.push('manager-switch');
    const key = JSON.stringify([...scope, 'duluth', category]);
    return JSON.parse(localStorage.getItem(key));
  }, { account, category, switched });
}

try {
  // Break caught: dropping offline edits, silently refreshing all devices, or sharing another account's draft.
  await scenario('offline drafts, manual refresh conflicts, and account ownership', async ({ db, client }) => {
    const { page: manager } = await client('manager');
    const { page: staff, context } = await client('duluth', true);
    let submissions = 0;
    staff.on('request', request => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/count-sheets') submissions++;
    });
    await staff.locator('#count-category').selectOption('Trà');
    await context.setOffline(true);
    await staff.getByLabel('Số đếm Trà xanh').fill('27');
    await staff.locator('#count-performed').fill('Offline counter');
    assert.equal((await draftValues(staff, 'duluth', 'Trà')).values['green-tea'].quantity, '27');
    await context.setOffline(false);
    await staff.reload();
    await staff.getByLabel('Số đếm Trà xanh').waitFor();
    assert.equal(await staff.getByLabel('Số đếm Trà xanh').inputValue(), '27');
    assert.equal(await staff.locator('#count-performed').inputValue(), 'Offline counter');
    assert.equal(submissions, 0, 'reconnection/reload must not auto-submit a local draft');
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM count_sheets').get().total, 0);

    await countFromManager(manager, 'green-tea', '30');
    assert.equal(await staff.getByLabel('Số đếm Trà xanh').inputValue(), '27');
    assert.equal(await staff.locator('[data-count-stale]:visible').count(), 0, 'other client remains on its earlier snapshot until refresh');
    await staff.getByRole('button', { name: 'Làm mới', exact: true }).click();
    await staff.locator('[data-count-stale="green-tea"]:visible').waitFor();
    await staff.getByRole('button', { name: 'Kiểm tra và gửi', exact: true }).click();
    await staff.locator('#toast').filter({ hasText: 'tồn đã thay đổi' }).waitFor();
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM count_sheets').get().total, 0);
    assert.equal(db.prepare("SELECT on_hand FROM stock WHERE location_id='duluth' AND item_id='green-tea'").get().on_hand, 30000);
    assert.equal(await staff.getByLabel('Số đếm Trà xanh').inputValue(), '27');
    assert.equal(await staff.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

    await staff.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
    await login(staff, 'johns-creek');
    await staff.locator('#count-category').selectOption('Trà');
    assert.equal(await staff.getByLabel('Số đếm Trà xanh').inputValue(), '');
    assert.equal(await staff.locator('#count-performed').inputValue(), '');
    assert.equal((await draftValues(staff, 'duluth', 'Trà')).values['green-tea'].quantity, '27');

    await staff.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
    await login(staff, 'manager');
    await staff.getByRole('button', { name: 'Chức năng', exact: true }).click();
    await staff.getByRole('navigation').getByRole('button', { name: 'Tài khoản', exact: true }).click();
    await staff.getByRole('row').filter({ hasText: 'Duluth' }).getByRole('button', { name: 'Chuyển tài khoản', exact: true }).click();
    await staff.locator('#count-category').selectOption('Trà');
    assert.equal(await staff.getByLabel('Số đếm Trà xanh').inputValue(), '', 'delegation must not inherit a direct staff draft');
    assert.equal(await draftValues(staff, 'duluth', 'Trà', true), null);
    assert.equal((await draftValues(staff, 'duluth', 'Trà')).values['green-tea'].quantity, '27');
  });

  // Break caught: treating the multi-category queue as one transaction, or deleting an unconfirmed draft.
  await scenario('partial multi-category submission retains only unconfirmed drafts', async ({ db, client }) => {
    const { page: manager } = await client('manager');
    const { page: staff } = await client('duluth', true);
    await staff.locator('#count-category').selectOption('Trà');
    await staff.getByLabel('Số đếm Trà xanh').fill('27');
    await staff.locator('#count-performed').fill('Partial counter');
    await staff.locator('#count-category').selectOption('Topping');
    await staff.getByLabel('Số đếm Trân châu').fill('13');
    assert.equal(await staff.locator('#count-performed').inputValue(), 'Partial counter');
    let conflicted = false;
    await staff.route('**/api/count-sheets', async route => {
      if (!conflicted && route.request().postDataJSON().category === 'Topping') {
        conflicted = true;
        await countFromManager(manager, 'tapioca', '16');
      }
      await route.continue();
    });
    await staff.getByRole('button', { name: 'Kiểm tra và gửi', exact: true }).click();
    await staff.getByRole('dialog').getByRole('button', { name: 'Gửi kiểm kê', exact: true }).click();
    await staff.getByRole('dialog').getByRole('alert').filter({ hasText: 'Đã gửi 1/2 nhóm' }).waitFor();
    assert.equal(conflicted, true);
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM count_sheets').get().total, 1);
    assert.equal(db.prepare("SELECT on_hand FROM stock WHERE location_id='duluth' AND item_id='green-tea'").get().on_hand, 27000);
    assert.equal(db.prepare("SELECT on_hand FROM stock WHERE location_id='duluth' AND item_id='tapioca'").get().on_hand, 16000);
    assert.equal(await draftValues(staff, 'duluth', 'Trà'), null);
    const pending = await draftValues(staff, 'duluth', 'Topping');
    assert.equal(pending.values.tapioca.quantity, '13');
    assert.equal(pending.values.tapioca.revision, 0, 'failed draft retains the revision that must be rechecked');
    await staff.getByRole('dialog').getByRole('button', { name: 'Hủy', exact: true }).click();
    await staff.reload();
    await staff.getByLabel('Số đếm Trân châu').waitFor();
    assert.equal(await staff.getByLabel('Số đếm Trân châu').inputValue(), '13');
    await staff.locator('[data-count-stale="tapioca"]:visible').waitFor();
  });

  // Break caught: allocating a fresh key after a lost response even though the first count already committed.
  await scenario('retry after a lost committed response preserves the operation identity', async ({ db, client }) => {
    const { page } = await client('duluth', true);
    await page.locator('#count-category').selectOption('Trà');
    await page.getByLabel('Số đếm Trà xanh').fill('29');
    await page.locator('#count-performed').fill('Retry counter');
    let dropped = false;
    await page.route('**/api/count-sheets', async route => {
      if (!dropped) {
        dropped = true;
        const response = await route.fetch();
        assert.equal(response.status(), 200);
        await route.abort('connectionfailed');
      } else await route.continue();
    });
    await page.getByRole('button', { name: 'Kiểm tra và gửi', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Gửi kiểm kê', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Thử lại lần lưu này', exact: true }).waitFor();
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM count_sheets').get().total, 1);
    assert.equal((await draftValues(page, 'duluth', 'Trà')).values['green-tea'].quantity, '29');
    await page.getByRole('dialog').getByRole('button', { name: 'Thử lại lần lưu này', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM count_sheets').get().total, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM movements WHERE type='sheet_count'").get().total, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM requests').get().total, 1);
    assert.equal(db.prepare("SELECT on_hand,revision FROM stock WHERE location_id='duluth' AND item_id='green-tea'").get().revision, 1);
    assert.equal(await draftValues(page, 'duluth', 'Trà'), null);
  });
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
