import assert from 'node:assert/strict';
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

  await login(desktop, 'manager');
  const locationFilter = desktop.getByRole('combobox', { name: 'Lọc địa điểm' });
  assert.equal(await locationFilter.locator('option').count(), 6);
  assert.equal(await desktop.locator('.stock-table tbody tr').count(), 3);
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
  await phone.locator('#count-category').selectOption('Topping');
  await phone.getByLabel('Đơn vị đếm Trân châu').selectOption('case');
  await phone.getByLabel('Số đếm Trân châu').fill('1');
  await phone.getByLabel('Người kiểm kê').fill('Người đếm');
  await phone.getByRole('button', { name: 'Kiểm tra và gửi' }).click();
  await phone.getByRole('button', { name: 'Gửi kiểm kê', exact: true }).click();
  await phone.getByText('Người đếm', { exact: false }).waitFor();
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
  await phone.locator('#count-category').selectOption('Trà');
  await phone.getByLabel('Số đếm Trà xanh').fill('29');
  await phone.getByLabel('Người kiểm kê').fill('Nhân viên thử');
  await phone.reload();
  await phone.getByRole('button', { name: 'Phiếu kiểm kê', exact: true }).click();
  await phone.locator('#count-category').selectOption('Trà');
  assert.equal(await phone.getByLabel('Số đếm Trà xanh').inputValue(), '29');
  await phone.getByRole('button', { name: 'Kiểm tra và gửi' }).click();
  await phone.getByRole('button', { name: 'Gửi kiểm kê', exact: true }).click();
  await phone.getByText('Nhân viên thử', { exact: false }).waitFor();

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
  await desktop.getByText('1–1 / 1', { exact: true }).waitFor();
  assert.equal(await desktop.locator('.stock-table tbody tr:visible').count(), 1);

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
  await phone.locator('#count-category').selectOption('Syrup');
  assert.equal(await phone.getByLabel('Đơn vị đếm Siro thử').inputValue(), 'case');
  await phone.getByRole('button', { name: 'Kiểm tra và gửi' }).click();
  await phone.getByRole('button', { name: 'Gửi kiểm kê', exact: true }).click();
  await phone.getByText('Nhân viên quy đổi', { exact: false }).waitFor();
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
  assert.deepEqual(errors, []);
  console.log('PASS stock, alerts, receipt, transfer, valuation, invoices, item forms, staff drafts and offline recovery.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  db.close();
}
