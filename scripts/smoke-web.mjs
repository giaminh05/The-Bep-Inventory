import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { openDatabase } from '../server/db.mjs';
import { inventoryServer } from '../server/http.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.BEP_PLAYWRIGHT ?? 'playwright');
const db = openDatabase(':memory:', { demo: true });
db.prepare('UPDATE stock SET known = 0 WHERE location_id = ? AND item_id = ?').run('extra', 'tapioca');
const server = inventoryServer({ db }).listen(0, '127.0.0.1');
await once(server, 'listening');
const url = 'http://127.0.0.1:' + server.address().port;
const errors = [];
let browser;

try {
  browser = await chromium.launch({ executablePath: process.env.BEP_CHROME || undefined });
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  desktop.setDefaultTimeout(10000);
  phone.setDefaultTimeout(10000);

  async function login(page, username) {
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    await page.getByRole('heading', { name: 'Đăng nhập', exact: true }).waitFor();
    await page.getByLabel('Tên đăng nhập').fill(username);
    await page.getByLabel('Mật khẩu').fill('BepDemo2026!');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await page.getByRole('heading', { name: username === 'manager' ? 'Tồn kho' : 'Phiếu kiểm kê', exact: true }).waitFor();
  }

  for (const width of [390, 320]) {
    const managerPhone = await browser.newPage({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
    await login(managerPhone, 'manager');
    const nav = managerPhone.getByRole('navigation', { name: 'Chức năng kho' });
    const active = nav.locator('[aria-current="page"]');
    const assertActiveTabVisible = async () => assert.deepEqual(await active.evaluate(tab => {
      const scroller = tab.closest('nav');
      const bounds = scroller.getBoundingClientRect();
      const button = tab.getBoundingClientRect();
      return { tabVisible: button.left >= bounds.left - 1 && button.right <= bounds.right + 1,
        pageFits: document.documentElement.scrollWidth === innerWidth };
    }), { tabVisible: true, pageFits: true });
    await managerPhone.getByText('Cuộn ngang để xem thêm tab').waitFor();
    const touch = await managerPhone.context().newCDPSession(managerPhone);
    const { x, y, width: navWidth, height } = await nav.boundingBox();
    const point = offset => ({ x: Math.round(x + navWidth * offset), y: Math.round(y + height / 2) });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(.85)] });
    for (const offset of [.7, .55, .4, .25]) {
      await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(offset)] });
    }
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await managerPhone.waitForFunction(() => document.querySelector('[data-manager-nav]').scrollLeft > 0);
    await touch.detach();

    for (const title of ['Phiếu kiểm kê', 'Đơn giao', 'Chuyển kho', 'Nhật ký', 'Báo cáo tuần', 'Tồn kho']) {
      await nav.getByRole('button', { name: title, exact: true }).tap();
      await managerPhone.getByRole('heading', { name: title, exact: true }).waitFor();
      await assertActiveTabVisible();
    }
    await nav.getByRole('button', { name: 'Báo cáo tuần', exact: true }).focus();
    await managerPhone.keyboard.press('Tab');
    await managerPhone.keyboard.press('Enter');
    await managerPhone.getByRole('heading', { name: 'Tài khoản', exact: true }).waitFor();
    await managerPhone.waitForFunction(() =>
      document.activeElement.matches('[data-manager-nav] [data-id="accounts"][aria-current="page"]'));
    await assertActiveTabVisible();
    const renderedNav = await nav.elementHandle();
    await managerPhone.getByRole('button', { name: 'Làm mới' }).tap();
    await renderedNav.waitForElementState('hidden');
    await assertActiveTabVisible();

    await nav.getByRole('button', { name: 'Phiếu kiểm kê', exact: true }).tap();
    const place = managerPhone.getByRole('combobox', { name: 'Lọc địa điểm' });
    await place.selectOption('duluth');
    await managerPhone.locator('#count-category').selectOption('Trà');
    await managerPhone.getByLabel('Số đếm Trà xanh').fill('0');
    if (width === 320) {
      await managerPhone.evaluate(() => localStorage.removeItem(JSON.stringify(['bep-count-draft', '', 'green-tea', 'manager'])));
    }
    await managerPhone.reload();
    await managerPhone.getByRole('heading', { name: 'Phiếu kiểm kê', exact: true }).waitFor();
    assert.equal(await place.inputValue(), 'duluth');
    assert.equal(await managerPhone.locator('#count-category').inputValue(), 'Trà');
    assert.equal(await managerPhone.getByLabel('Số đếm Trà xanh').inputValue(), '0');
    await place.selectOption('norcross');
    assert.equal(await managerPhone.locator('#count-category').inputValue(), '');
    await place.selectOption('duluth');
    assert.equal(await managerPhone.getByLabel('Số đếm Trà xanh').inputValue(), '0');
    await managerPhone.close();
  }

  await login(desktop, 'manager');
  const locationFilter = desktop.getByRole('combobox', { name: 'Lọc địa điểm' });
  assert.equal(await locationFilter.locator('option').count(), 6);
  assert.equal(await desktop.locator('.stock-table tbody tr').count(), 3);
  assert.equal(await desktop.locator('[data-list-pages]:visible').count(), 0);
  assert.equal(await desktop.locator('.nav-scroll-hint').isVisible(), false);
  await desktop.getByRole('row').filter({ hasText: 'Trà xanh' }).getByText('108', { exact: true }).waitFor();
  const tapiocaTotal = desktop.getByRole('row').filter({ hasText: 'Trân châu' });
  await tapiocaTotal.getByText('65', { exact: true }).waitFor();
  await tapiocaTotal.getByText('Tạm tính · 1 nơi chưa biết tồn', { exact: true }).waitFor();
  assert.equal(await desktop.getByRole('button', { name: 'Đặt ngưỡng' }).count(), 3);
  await locationFilter.selectOption('duluth');
  const row = desktop.getByRole('row').filter({ hasText: 'Trân châu' });
  await row.getByRole('button', { name: 'Đặt ngưỡng' }).click();
  await desktop.getByRole('dialog').getByLabel('Ngưỡng', { exact: true }).fill('6');
  await desktop.getByRole('dialog').getByRole('button', { name: 'Lưu', exact: true }).click();
  await desktop.getByRole('dialog').waitFor({ state: 'hidden' });
  await row.getByText('6 túi', { exact: true }).waitFor();

  await login(phone, 'duluth');
  assert.equal(await phone.getByRole('combobox', { name: 'Lọc địa điểm' }).count(), 0);
  assert.equal(await phone.getByRole('button', { name: 'Đặt ngưỡng' }).count(), 0);
  assert.equal(await phone.getByRole('button', { name: 'Tồn kho', exact: true }).count(), 0);
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth === innerWidth), true);
  await phone.evaluate(() => {
    const scope = ['bep-count-draft', '', 'green-tea', 'duluth'];
    localStorage.setItem(JSON.stringify(scope), JSON.stringify({ place: 'duluth', category: 'Nhóm đã xóa' }));
    const draft = JSON.stringify({ values: { 'green-tea': { quantity: '12', unit: 'bag', revision: 0 } } });
    localStorage.setItem(JSON.stringify([...scope, 'duluth', 'Nhóm đã xóa']), draft);
    localStorage.setItem(JSON.stringify([...scope, 'norcross', 'Trà']), draft);
    localStorage.setItem(JSON.stringify([...scope, 'duluth', 'Topping']), draft);
  });
  await phone.reload();
  assert.equal(await phone.locator('#count-category').inputValue(), '');
  await phone.locator('#count-category').selectOption('Topping');
  await phone.getByLabel('Đơn vị đếm Trân châu').selectOption('case');
  await phone.getByLabel('Số đếm Trân châu').fill('1');
  await phone.getByLabel('Người kiểm kê').fill('Người đếm');
  await phone.getByRole('button', { name: 'Kiểm tra và gửi' }).click();
  await phone.getByRole('button', { name: 'Gửi kiểm kê', exact: true }).click();
  await phone.locator('.count-history summary').filter({ hasText: 'Người đếm' }).waitFor();
  await desktop.getByRole('button', { name: 'Làm mới' }).click();
  await row.getByText('Sắp hết', { exact: true }).waitFor();
  await locationFilter.selectOption('');
  await tapiocaTotal.getByText('Duluth', { exact: true }).waitFor();
  await desktop.getByLabel('Chỉ hiện cảnh báo').check();
  assert.equal(await desktop.locator('.stock-table tbody tr').count(), 1);
  await desktop.getByLabel('Chỉ hiện cảnh báo').uncheck();
  await tapiocaTotal.getByRole('button', { name: 'Đặt ngưỡng' }).click();
  const thresholds = desktop.getByRole('dialog', { name: 'Đặt ngưỡng tồn kho' });
  assert.equal(await thresholds.getByRole('spinbutton').count(), 6);
  assert.equal(await thresholds.getByLabel('Duluth', { exact: true }).inputValue(), '6');
  await thresholds.getByLabel('Norcross', { exact: true }).fill('6');
  await thresholds.getByLabel('Ngưỡng tổng toàn hệ thống').fill('100');
  await thresholds.getByRole('button', { name: 'Lưu', exact: true }).click();
  await tapiocaTotal.getByText('Norcross', { exact: true }).waitFor();
  await tapiocaTotal.getByText('Tạm tính · 1 nơi chưa biết tồn', { exact: true }).waitFor();
  await tapiocaTotal.getByText('Tổng tồn chạm ngưỡng', { exact: true }).waitFor();
  const teaTotal = desktop.getByRole('row').filter({ hasText: 'Trà xanh' });
  await teaTotal.getByRole('button', { name: 'Đặt ngưỡng' }).click();
  await thresholds.getByLabel('Ngưỡng tổng toàn hệ thống').fill('108');
  await thresholds.getByRole('button', { name: 'Lưu', exact: true }).click();
  await teaTotal.getByText('Tổng tồn chạm ngưỡng').waitFor();
  await desktop.getByLabel('Chỉ hiện cảnh báo').check();
  assert.equal(await desktop.locator('.stock-table tbody tr:visible').count(), 2);
  await desktop.getByLabel('Chỉ hiện cảnh báo').uncheck();
  await locationFilter.selectOption('duluth');

  await phone.getByRole('button', { name: 'Phiếu kiểm kê', exact: true }).click();
  await phone.locator('#count-category').selectOption('Bao bì');
  await phone.getByLabel('Số đếm Ly 23 oz').fill('900');
  await phone.locator('#count-category').selectOption('Trà');
  await phone.getByLabel('Số đếm Trà xanh').fill('29');
  await phone.getByLabel('Người kiểm kê').fill('Nhân viên thử');
  await phone.reload();
  assert.equal(await phone.locator('#count-category').inputValue(), 'Trà');
  assert.equal(await phone.getByLabel('Số đếm Trà xanh').inputValue(), '29');
  assert.equal(await phone.locator('[data-list-pages]:visible').count(), 0);
  const sentCounts = [];
  await phone.route('**/api/count-sheets', async route => {
    const { category } = route.request().postDataJSON();
    const key = route.request().headers()['idempotency-key'];
    sentCounts.push({ category, key });
    if (category === 'Bao bì' && sentCounts.length === 2) {
      assert.equal((await route.fetch()).ok(), true);
      await route.abort();
    } else await route.continue();
  });
  await phone.getByRole('button', { name: 'Kiểm tra và gửi' }).click();
  await phone.getByRole('dialog').getByText('Duluth · 2 nhóm đã đếm').waitFor();
  await phone.getByRole('button', { name: 'Gửi kiểm kê', exact: true }).click();
  await phone.getByRole('dialog').getByText(/Đã gửi 1\/2 nhóm. Nhóm Bao bì/).waitFor();
  assert.equal(await phone.getByLabel('Số đếm Trà xanh').inputValue(), '');
  await phone.getByRole('button', { name: 'Thử lại lần lưu này' }).click();
  await phone.getByText('Đã gửi 2 phiếu và cập nhật tồn.').waitFor();
  await phone.getByText(/Nhân viên thử.*1 đã đếm/).first().waitFor();
  assert.deepEqual(sentCounts.map(request => request.category), ['Trà', 'Bao bì', 'Bao bì']);
  assert.equal(sentCounts[1].key, sentCounts[2].key);
  assert.equal(await phone.locator('.count-history summary').filter({ hasText: 'Nhân viên thử' }).count(), 2);
  await phone.unroute('**/api/count-sheets');

  await desktop.getByRole('button', { name: 'Đơn giao', exact: true }).click();
  await desktop.getByRole('button', { name: 'Làm mới' }).click();
  await desktop.getByRole('button', { name: 'Xác nhận nhận', exact: true }).click();
  await desktop.getByLabel('Tên người nhận / Người chịu trách nhiệm').fill('Quản lý thử');
  await desktop.getByLabel('Thực nhận lần này').fill('5');
  await desktop.locator('[name="countSheet"]').selectOption({ index: 1 });
  await desktop.getByLabel('Ảnh hóa đơn hoặc phiếu giao').setInputFiles({
    name: 'phieu-giao.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==', 'base64'),
  });
  await desktop.getByRole('dialog').getByRole('button', { name: 'Xác nhận nhận hàng', exact: true }).click();
  await desktop.getByText('Đã nhận một phần', { exact: true }).waitFor();
  await desktop.getByText('7 túi', { exact: true }).waitFor();
  await desktop.getByText('Hóa đơn và phiếu giao (1)', { exact: true }).click();
  const thumbnail = desktop.locator('.invoice-thumb img');
  await thumbnail.waitFor();
  await thumbnail.evaluate(image => image.decode());
  await desktop.getByRole('button', { name: 'Phóng to chứng từ 1' }).click();
  const photo = desktop.getByRole('dialog', { name: 'Ảnh chứng từ' }).getByRole('img');
  await photo.evaluate(image => image.decode());
  await desktop.getByRole('button', { name: 'Đóng', exact: true }).click();
  await desktop.getByRole('button', { name: 'Tồn kho', exact: true }).click();
  await desktop.getByRole('row').filter({ hasText: 'Trà xanh' }).getByText('29', { exact: true }).waitFor();

  await phone.getByRole('button', { name: 'Đơn giao', exact: true }).click();
  await phone.getByRole('button', { name: 'Làm mới' }).click();
  assert.equal(await phone.getByRole('button', { name: 'Tạo đơn giao' }).count(), 0);
  await phone.getByRole('button', { name: 'Xác nhận cả lô' }).click();
  const fullReceipt = phone.getByRole('button', { name: 'Xác nhận nhận đủ toàn bộ hàng' });
  assert.equal(await fullReceipt.isDisabled(), true);
  await phone.getByLabel('Tên người nhận / Người chịu trách nhiệm').fill('Nhân viên nhận');
  await fullReceipt.click();
  await phone.getByText('Đã nhận đủ', { exact: true }).waitFor();

  await phone.getByRole('button', { name: 'Chuyển kho', exact: true }).click();
  await phone.getByRole('button', { name: 'Xuất chuyển kho' }).click();
  await phone.getByRole('checkbox', { name: 'Ly 23 oz' }).check();
  await phone.getByRole('checkbox', { name: 'Trân châu' }).check();
  await phone.getByRole('button', { name: 'Thêm mặt hàng đã chọn' }).click();
  await phone.locator('[data-transfer-line="cup-23"]').getByLabel('Số lượng xuất').fill('100');
  await phone.locator('[data-transfer-line="tapioca"]').getByLabel('Số lượng xuất').fill('1');
  await phone.getByRole('button', { name: 'Xác nhận và trừ tồn' }).click();
  await phone.getByText('Đang vận chuyển', { exact: true }).waitFor();
  assert.equal(await phone.getByRole('button', { name: 'Xác nhận thực nhận' }).count(), 0);
  await desktop.getByRole('button', { name: 'Chuyển kho', exact: true }).click();
  await desktop.getByRole('button', { name: 'Làm mới' }).click();
  await desktop.locator('.line').filter({ has: desktop.getByRole('heading', { name: 'Ly 23 oz', exact: true }) })
    .getByRole('button', { name: 'Xác nhận thực nhận', exact: true }).click();
  await desktop.getByLabel('Tên người nhận / Người chịu trách nhiệm').fill('Quản lý thử');
  await desktop.getByLabel('Thực nhận lần này').fill('90');
  await desktop.getByLabel('Đóng phiếu sau lần nhận này').check();
  await desktop.getByLabel('Ghi chú hoặc lý do chênh lệch').fill('Thiếu 10 ly');
  await desktop.getByRole('dialog').getByRole('button', { name: 'Xác nhận thực nhận', exact: true }).click();
  await desktop.getByText('-10 cái', { exact: true }).waitFor();
  await desktop.getByRole('button', { name: 'Xác nhận cả lô' }).click();
  await desktop.getByLabel('Tên người nhận / Người chịu trách nhiệm').fill('Quản lý thử');
  await desktop.getByRole('button', { name: 'Xác nhận nhận đủ toàn bộ hàng' }).click();
  await desktop.getByText('Đã đóng · Có chênh lệch', { exact: true }).waitFor();
  await desktop.getByRole('button', { name: 'Nhật ký', exact: true }).click();
  await desktop.getByText('Xuất chuyển', { exact: true }).first().waitFor();
  assert.equal(await desktop.getByText('Xuất chuyển', { exact: true }).count(), 2);
  await desktop.getByRole('button', { name: 'Báo cáo tuần' }).click();
  const teaReport = desktop.getByRole('row').filter({ hasText: 'Trà xanh' });
  await teaReport.getByRole('button', { name: 'Đặt giá' }).click();
  await desktop.getByLabel('Đơn giá USD', { exact: true }).fill('2');
  await desktop.getByRole('dialog').getByRole('button', { name: 'Lưu', exact: true }).click();
  await teaReport.getByText('$72.00', { exact: true }).waitFor();

  const addItem = db.prepare("INSERT INTO items (id, sku, name, category, base_unit, units) VALUES (?, ?, ?, 'Trà', 'bag', ?)");
  const addStock = db.prepare("INSERT INTO stock (location_id, item_id, on_hand) VALUES ('duluth', ?, 1000)");
  for (let index = 1; index <= 22; index++) {
    addItem.run('fixture-' + index, 'FIX-' + index, 'Mặt hàng ' + index, '{"bag":1}');
    addStock.run('fixture-' + index);
  }
  await desktop.getByRole('button', { name: 'Tồn kho', exact: true }).click();
  await desktop.getByRole('button', { name: 'Làm mới' }).click();
  await desktop.getByText('1–20 / 25', { exact: true }).waitFor();
  assert.equal(await desktop.locator('.stock-table tbody tr:visible').count(), 20);
  await desktop.getByRole('button', { name: 'Sau', exact: true }).click();
  assert.equal(await desktop.locator('.stock-table tbody tr:visible').count(), 5);
  await desktop.getByLabel('Tìm mặt hàng').fill('mat hang 22');
  assert.equal(await desktop.locator('.stock-table tbody tr:visible').count(), 1);
  assert.equal(await desktop.locator('[data-list-pages]:visible').count(), 0);
  await desktop.getByLabel('Tìm mặt hàng').fill('khong co mat hang nay');
  await desktop.getByText('Không có kết quả', { exact: true }).waitFor();
  assert.equal(await desktop.locator('[data-list-pages]:visible').count(), 0);
  assert.equal(await desktop.locator('.stock-table tbody tr:visible').count(), 0);

  await desktop.getByRole('button', { name: 'Đơn giao', exact: true }).click();
  await desktop.getByRole('button', { name: 'Tạo đơn giao', exact: true }).click();
  await desktop.getByLabel('Nhà cung cấp').fill('Nhà cung cấp thử autocomplete');
  const orderSearch = desktop.getByRole('combobox', { name: 'Tìm mặt hàng' });
  await orderSearch.fill('tra xanh');
  await desktop.getByRole('option', { name: /Trà xanh/ }).waitFor();
  await orderSearch.press('ArrowDown');
  await orderSearch.press('Enter');
  await desktop.getByLabel('Số lượng dự kiến').fill('2');
  await desktop.getByRole('button', { name: 'Thêm mặt hàng', exact: true }).click();
  const newLine = desktop.locator('.order-row').last();
  await newLine.getByRole('button', { name: 'Tạo mặt hàng mới' }).click();
  await newLine.getByLabel('Tên mặt hàng mới').fill('Bột khoai tím');
  await newLine.getByLabel('Danh mục').fill('POWDER');
  await newLine.locator('[name="newUnit"]').selectOption('bag');
  await newLine.getByRole('spinbutton', { name: /Số đơn vị gốc/ }).fill('3');
  await newLine.locator('[name="unit"]').selectOption('case');
  await newLine.getByLabel('Số lượng dự kiến').fill('1');
  await desktop.getByRole('dialog').getByRole('button', { name: 'Lưu', exact: true }).click();
  const created = desktop.locator('.ticket').filter({ has: desktop.getByRole('heading', { name: 'Nhà cung cấp thử autocomplete' }) });
  await created.getByRole('heading', { name: 'Bột khoai tím' }).waitFor();
  await created.getByRole('heading', { name: 'Trà xanh' }).waitFor();
  await created.getByText('3 túi', { exact: true }).first().waitFor();

  await desktop.getByRole('button', { name: 'Tồn kho', exact: true }).click();
  await desktop.getByRole('searchbox', { name: 'Tìm mặt hàng' }).fill('');
  await desktop.getByRole('button', { name: 'Tạo mặt hàng mới', exact: true }).click();
  const catalog = desktop.getByRole('dialog', { name: 'Tạo mặt hàng mới' });
  await catalog.getByLabel('Tên mặt hàng mới').fill('Siro thử');
  await catalog.getByLabel('Danh mục').fill('Syrup');
  await catalog.locator('[name="newUnit"]').selectOption('bottle');
  await catalog.getByRole('spinbutton', { name: /Số đơn vị gốc/ }).fill('6');
  await catalog.getByRole('button', { name: 'Lưu', exact: true }).click();
  await desktop.getByText('Đã tạo mặt hàng mới.', { exact: true }).waitFor();

  await phone.getByRole('button', { name: 'Phiếu kiểm kê', exact: true }).click();
  await phone.getByRole('button', { name: 'Làm mới' }).click();
  await phone.locator('#count-category').selectOption('Trà');
  await phone.getByLabel('Tìm trong nhóm').fill('Mặt hàng 22');
  await phone.getByLabel('Số đếm Mặt hàng 22', { exact: true }).waitFor();
  assert.equal(await phone.getByLabel('Đơn vị đếm Mặt hàng 22', { exact: true }).count(), 0);
  await phone.locator('#count-category').selectOption('Syrup');
  await phone.getByLabel('Đơn vị đếm Siro thử').selectOption('case');
  await phone.getByLabel('Số đếm Siro thử').fill('1');
  await phone.getByLabel('Người kiểm kê').fill('Nhân viên quy đổi');
  await phone.reload();
  assert.equal(await phone.locator('#count-category').inputValue(), 'Syrup');
  assert.equal(await phone.getByLabel('Đơn vị đếm Siro thử').inputValue(), 'case');
  await phone.getByRole('button', { name: 'Kiểm tra và gửi' }).click();
  await phone.getByRole('button', { name: 'Gửi kiểm kê', exact: true }).click();
  await phone.locator('.count-history summary').filter({ hasText: 'Nhân viên quy đổi' }).waitFor();
  await phone.context().setOffline(true);
  await phone.getByRole('button', { name: 'Làm mới' }).click();
  await phone.getByText('Mất kết nối với máy chủ. Kiểm tra mạng rồi thử lại.').waitFor();
  await phone.context().setOffline(false);
  const recovered = phone.waitForResponse(response => response.url().endsWith('/api/snapshot') && response.ok());
  await phone.getByRole('button', { name: 'Làm mới' }).click();
  await recovered;
  await desktop.getByRole('button', { name: 'Làm mới' }).click();
  await desktop.getByRole('searchbox', { name: 'Tìm mặt hàng' }).fill('Siro thử');
  await desktop.getByRole('row').filter({ hasText: 'Siro thử' }).getByText('6', { exact: true }).waitFor();

  await desktop.goto(url + '/staff');
  await desktop.getByRole('combobox', { name: 'Lọc địa điểm' }).waitFor();
  const brand = desktop.locator('.brand strong');
  assert.equal(await brand.textContent(), 'The Bếp Teahouse');
  assert.match(await brand.evaluate(node => getComputedStyle(node).fontFamily), /Segoe UI/);
  assert.equal(await phone.getByRole('button', { name: 'Tài khoản', exact: true }).count(), 0);
  await locationFilter.selectOption('duluth');
  await desktop.getByRole('button', { name: 'Tài khoản', exact: true }).click();
  assert.equal(await desktop.getByRole('button', { name: 'Đổi mật khẩu', exact: true }).count(), 5);
  await desktop.getByRole('row').filter({ hasText: 'Duluth' }).getByRole('button', { name: 'Đổi mật khẩu' }).click();
  const passwordDialog = desktop.getByRole('dialog', { name: 'Đổi mật khẩu nhân viên' });
  const updatedPassword = randomUUID();
  await passwordDialog.getByLabel('Mật khẩu mới', { exact: true }).fill(updatedPassword);
  const confirmation = passwordDialog.getByLabel('Nhập lại mật khẩu mới');
  await confirmation.fill(randomUUID());
  await passwordDialog.getByRole('button', { name: 'Lưu mật khẩu mới' }).click();
  await passwordDialog.getByText('Hai mật khẩu không khớp.').waitFor();
  await confirmation.fill(updatedPassword);
  await passwordDialog.getByRole('button', { name: 'Lưu mật khẩu mới' }).click();
  await desktop.getByText('Đã đổi mật khẩu và thu hồi các phiên đăng nhập cũ.').waitFor();
  await phone.getByRole('button', { name: 'Làm mới' }).click();
  await phone.getByRole('heading', { name: 'Đăng nhập', exact: true }).waitFor();
  await phone.getByLabel('Tên đăng nhập').fill('duluth');
  await phone.getByLabel('Mật khẩu', { exact: true }).fill(updatedPassword);
  await phone.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await phone.getByRole('heading', { name: 'Phiếu kiểm kê', exact: true }).waitFor();

  // Simulate the native bridge with storage shared by successive WebViews on one device.
  async function nativeDevice() {
    const context = await browser.newContext();
    const vault = new Map();
    let offline = false;
    await context.route('**/api/**', route => offline ? route.abort() : route.continue());
    await context.exposeBinding('testSecureStorage', (_, plugin, method, options) => {
      assert.equal(plugin, 'SecureStorage');
      assert.equal(options.sync, false);
      if (method === 'internalGetItem') return { data: vault.get(options.prefixedKey) ?? null };
      if (method === 'internalSetItem') {
        assert.equal(options.access, 1);
        assert.deepEqual(Object.keys(JSON.parse(options.data)).sort(),
          JSON.parse(options.data).logout ? ['logout', 'token'] : ['token']);
        vault.set(options.prefixedKey, options.data);
      } else if (method === 'internalRemoveItem') vault.delete(options.prefixedKey);
      else throw new Error('Unexpected native storage method');
      return {};
    });
    await context.addInitScript(() => {
      window.Capacitor = { isNativePlatform: () => true, nativePromise: window.testSecureStorage };
    });
    return { context, vault, setOffline: value => { offline = value; } };
  }
  const nativeFirst = await nativeDevice();
  const nativeSecond = await nativeDevice();
  let nativePage = await nativeFirst.context.newPage();
  const otherNativePage = await nativeSecond.context.newPage();
  await login(nativePage, 'norcross');
  await login(otherNativePage, 'norcross');
  assert.equal(await nativePage.evaluate(() => sessionStorage.getItem('bep-session')), null);
  assert.equal(nativeFirst.vault.size, 1);
  await nativePage.close();
  nativeFirst.setOffline(true);
  nativePage = await nativeFirst.context.newPage();
  await nativePage.goto(url);
  await nativePage.getByText(/Mất kết nối với máy chủ/).waitFor();
  assert.equal(await nativePage.getByRole('heading', { name: 'Phiếu kiểm kê' }).count(), 0);
  nativeFirst.setOffline(false);
  await nativePage.evaluate(() => window.dispatchEvent(new Event('online')));
  await nativePage.getByRole('heading', { name: 'Phiếu kiểm kê' }).waitFor();
  nativeFirst.setOffline(true);
  await nativePage.getByRole('button', { name: 'Đăng xuất' }).click();
  await nativePage.getByText(/Chưa thể hoàn tất đăng xuất/).waitFor();
  await nativePage.close();
  nativeFirst.setOffline(false);
  nativePage = await nativeFirst.context.newPage();
  await nativePage.goto(url);
  await nativePage.getByRole('heading', { name: 'Đăng nhập', exact: true }).waitFor();
  assert.equal(nativeFirst.vault.size, 0);
  await otherNativePage.getByRole('button', { name: 'Làm mới' }).click();
  await otherNativePage.getByRole('heading', { name: 'Phiếu kiểm kê' }).waitFor();
  await login(nativePage, 'norcross');

  const resetNorcross = desktop.getByRole('row').filter({ hasText: 'Norcross' });
  await resetNorcross.getByRole('button', { name: 'Đổi mật khẩu' }).click();
  const norcrossPassword = randomUUID();
  await passwordDialog.getByLabel('Mật khẩu mới', { exact: true }).fill(norcrossPassword);
  await passwordDialog.getByLabel('Nhập lại mật khẩu mới').fill(norcrossPassword);
  await passwordDialog.getByRole('button', { name: 'Lưu mật khẩu mới' }).click();
  await passwordDialog.waitFor({ state: 'hidden' });
  await nativePage.getByRole('button', { name: 'Làm mới' }).click();
  await nativePage.getByRole('heading', { name: 'Đăng nhập', exact: true }).waitFor();
  nativeSecond.setOffline(true);
  await otherNativePage.reload();
  await otherNativePage.getByText(/Mất kết nối với máy chủ/).waitFor();
  nativeSecond.setOffline(false);
  await otherNativePage.getByRole('button', { name: 'Thử lại' }).click();
  await otherNativePage.getByRole('heading', { name: 'Đăng nhập', exact: true }).waitFor();
  assert.equal(nativeFirst.vault.size + nativeSecond.vault.size, 0);
  await nativeFirst.context.close();
  await nativeSecond.context.close();
  await desktop.getByRole('row').filter({ hasText: 'Duluth' }).getByRole('button', { name: 'Chuyển tài khoản' }).click();
  const accountSwitch = desktop.getByRole('combobox', { name: 'Chuyển tài khoản nhân viên' });
  await accountSwitch.waitFor();
  assert.equal(await accountSwitch.inputValue(), 'duluth');
  assert.equal(await desktop.getByRole('button', { name: 'Tài khoản', exact: true }).count(), 0);
  await accountSwitch.selectOption('johns-creek');
  await desktop.getByText('Đang dùng tài khoản johns-creek với phiên quản lý').waitFor();
  await desktop.getByRole('button', { name: 'Về quản lý' }).click();
  await desktop.getByRole('heading', { name: 'Tài khoản', exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS inventory smoke and native session restore, offline logout and two-device revocation.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  db.close();
}
