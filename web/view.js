const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = value => String(value ?? '').replace(/[&<>"']/g, char => entities[char]);
export const units = { each: 'cái', bag: 'túi', case: 'thùng', bottle: 'chai', jar: 'hũ', box: 'hộp',
  can: 'lon', pack: 'gói', container: 'hộp chứa', roll: 'cuộn', cup: 'ly', 'large bag': 'túi lớn' };
export const unitLabel = unit => units[unit] ?? unit;
export const unitChoice = (item, unit) => unit === item.base_unit ? unitLabel(unit)
  : unitLabel(unit) + ' (' + number(item.units[unit]) + ' ' + unitLabel(item.base_unit) + ')';
export const number = value => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 }).format(value);
export const date = value => new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'America/New_York',
}).format(new Date(value));
const eventNames = {
  count: 'Kiểm kê', sheet_count: 'Phiếu kiểm kê', supplier_receipt: 'Nhận từ nhà cung cấp', transfer_out: 'Xuất chuyển', transfer_in: 'Nhận chuyển',
};
const sections = {
  stock: ['Tồn kho', 'Theo dõi số dư, kiểm kê và ngưỡng tồn tại từng địa điểm.'],
  counts: ['Phiếu kiểm kê', 'Chọn một nhóm hàng. Chỉ nhập những mặt hàng đã đếm.'],
  deliveries: ['Đơn giao', 'Theo dõi số lượng dự kiến, thực nhận và chứng từ.'],
  transfers: ['Chuyển kho', 'Theo dõi hàng xuất, hàng đang đi và chênh lệch thực nhận.'],
  history: ['Nhật ký', 'Xem số dư sau mỗi giao dịch, người thực hiện và thời gian Atlanta.'],
  report: ['Báo cáo tuần', 'Xem lượng tiêu hao theo tuần Atlanta và giá trị tồn hiện tại.'],
  accounts: ['Tài khoản', 'Đổi mật khẩu tài khoản nhân viên tại các địa điểm.'],
};
export const brand = `<div class="brand"><img src="./icon.svg" alt=""><div><strong>The Bếp Teahouse</strong><small>Inventory</small></div></div>`;
export const option = (value, label, selected) =>
  `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(label)}</option>`;
const badge = (text, tone = '') => `<span class="badge ${tone}">${esc(text)}</span>`;
export const button = (text, action, id = '', primary = false) =>
  `<button type="button" class="button${primary ? ' primary' : ''}" data-action="${esc(action)}" data-id="${esc(id)}">${esc(text)}</button>`;
const empty = text => `<p class="empty">${esc(text)}</p>`;
const signed = value => (value > 0 ? '+' : '') + number(value);
export const listControls = (key, label = 'Tìm mặt hàng') => `<div class="list-controls" data-list-controls="${esc(key)}">
  ${label ? `<label>${esc(label)}<input type="search" autocomplete="off" data-list-search></label>` : ''}
  <small data-list-empty role="status" hidden>Không có kết quả</small>
  <div class="list-pages" data-list-pages hidden><button class="button" type="button" data-list-prev>Trước</button>
  <small data-list-status aria-live="polite"></small><button class="button" type="button" data-list-next>Sau</button></div>
</div>`;
export const itemSearch = item => [item.name, item.id, item.sku, item.category, item.supplier].filter(Boolean).join(' ');

export function renderLogin() {
  return `<div class="login">
    <section class="login-intro">${brand}
      <div><span class="eyebrow">Vận hành cửa hàng</span><h1>Kho The Bếp</h1>
        <p>Kiểm kê, nhận hàng và chuyển kho cho ba cửa hàng và hai kho của The Bếp Teahouse.</p></div>
      <p class="locations-label">Duluth · Johns Creek · Norcross · Kho DL House · Kho Extra</p>
    </section>
    <section class="login-form"><h2>Đăng nhập</h2>
      <p class="muted">Dùng tài khoản được cấp cho bạn.</p>
      <form id="login-form">
        <label>Tên đăng nhập<input name="username" autocomplete="username" autocapitalize="none" required maxlength="80"></label>
        <label>Mật khẩu<input name="password" type="password" autocomplete="current-password" required maxlength="256"></label>
        <p class="error" role="alert" hidden></p>
        <button class="button primary">Đăng nhập</button>
      </form>
    </section></div>`;
}

export function renderDashboard(state) {
  const { data, page, location } = state;
  const manager = data.user.role === 'manager';
  const locations = Object.fromEntries(data.locations.map(location => [location.id, location.name]));
  const items = Object.fromEntries(data.items.map(item => [item.id, item]));
  const scope = id => !location || location === id;
  const stock = data.stock.filter(row => scope(row.location_id));
  const deliveries = data.deliveries.filter(row => scope(row.location_id));
  const transfers = data.transfers.filter(row => scope(row.source) || scope(row.destination));
  const [title, description] = sections[page];
  const create = { stock: manager ? button('Tạo mặt hàng mới', 'create-item', '', true) : '',
    deliveries: manager ? button('Tạo đơn giao', 'delivery', '', true) : '', transfers: button('Xuất chuyển kho', 'dispatch', '', true) };
  const tabs = Object.entries(sections).filter(([id]) => manager || ['counts', 'deliveries', 'transfers'].includes(id)).map(([id, [label]]) =>
    `<button type="button" data-action="page" data-id="${id}" ${page === id ? 'aria-current="page"' : ''}>${label}</button>`).join('');
  const body = {
    stock: () => stockView(stock, deliveries, transfers, items, locations, state.lowOnly, manager, manager && !location),
    counts: () => countView(state, stock, items, locations),
    deliveries: () => deliveriesView(deliveries, items, locations, manager),
    transfers: () => transfersView(transfers, items, locations, data.user),
    history: () => historyView(state.history, items, locations, state.historyQuery),
    report: () => reportView(state, items, locations),
    accounts: () => accountsView(data.accounts ?? [], locations),
  };
  return `<div class="shell"><aside class="sidebar">${brand}
    <nav aria-label="Chức năng kho" ${manager ? 'data-manager-nav' : ''}>${tabs}</nav>
    ${manager ? '<small class="nav-scroll-hint" aria-hidden="true" hidden>↔ Cuộn ngang để xem thêm tab</small>' : ''}
    <div class="account"><strong>${esc(data.user.name)}</strong><small>${manager ? 'Quản lý' : 'Nhân viên'}</small>
      <button type="button" data-action="logout">Đăng xuất</button>
    </div></aside>
    <section class="content"><div class="topline">
      <span class="eyebrow">${manager ? 'Vận hành kho' : 'Ứng dụng nhân viên'}</span>
      <div class="top-actions">
        ${manager ? `<select id="location-filter" aria-label="Lọc địa điểm">
          ${option('', 'Tất cả địa điểm', location)}
          ${data.locations.map(place => option(place.id, place.name, location)).join('')}
        </select>` : badge(locations[data.user.location_id])}
        ${button('Làm mới', 'refresh')}
      </div></div>
      <header class="heading"><div><h1>${title}</h1><p>${description}</p></div>${create[page] ?? ''}</header>
      ${body[page]()}
    </section></div>`;
}

function accountsView(accounts, locations) {
  if (!accounts.length) return `<div class="panel">${empty('Chưa có tài khoản nhân viên.')}</div>`;
  return `<div class="panel table-wrap" tabindex="0" aria-label="Tài khoản nhân viên"><table>
    <thead><tr><th>Tài khoản</th><th>Địa điểm</th><th>Thao tác</th></tr></thead>
    <tbody>${accounts.map(account => `<tr><td><strong>${esc(account.name)}</strong><small>${esc(account.id)}</small></td>
      <td>${esc(locations[account.location_id] ?? '—')}</td>
      <td>${button('Đổi mật khẩu', 'staff-password', account.id)}</td></tr>`).join('')}</tbody>
  </table></div>`;
}

function stockSummary(stock, items) {
  const byItem = new Map();
  for (const row of stock) {
    if (!byItem.has(row.item_id)) byItem.set(row.item_id, { item_id: row.item_id, total: 0, known: 0, lowPlaces: [] });
    const item = byItem.get(row.item_id);
    if (row.on_hand !== null) {
      item.total += row.on_hand;
      item.known++;
    }
    if (row.low) item.lowPlaces.push(row.location_id);
  }
  return [...byItem.values()].map(row => ({ ...row, low: items[row.item_id].system_low || row.lowPlaces.length > 0 }));
}

function itemCell(item) {
  return `<td><strong>${esc(item.name)}</strong><small>${esc([item.sku, item.category, item.supplier].filter(Boolean).join(' · '))}</small></td>`;
}

function summaryRow(row, item, locations) {
  const missing = Object.keys(locations).length - row.known;
  const unit = esc(unitLabel(item.base_unit));
  const threshold = item.system_threshold;
  const alerts = [
    item.system_low ? badge('Tổng tồn chạm ngưỡng', 'warn') : '',
    row.lowPlaces.length ? `<div><strong>Sắp hết tại</strong><ul class="stock-alert-places">
      ${row.lowPlaces.map(id => `<li>${badge(locations[id], 'warn')}</li>`).join('')}</ul></div>` : '',
    !row.known && threshold !== null ? '<small>Chưa có số tồn để xét ngưỡng tổng</small>' : '',
  ].filter(Boolean).join('');
  return `<tr data-list-row data-search="${esc(itemSearch(item))}">${itemCell(item)}
    <td data-label="Đang có"><strong>${row.known ? number(row.total) : 'Chưa biết'}</strong>
    ${row.known ? unit : ''}
    ${row.known && missing ? `<small>Tạm tính · ${missing} nơi chưa biết tồn</small>` : ''}</td>
    <td data-label="Ngưỡng tổng">${threshold === null ? '—' : number(threshold) + ' ' + unit}</td>
    <td data-label="Cảnh báo"><div class="stock-alerts">${!item.base_unit ? badge('Thiếu đơn vị', 'warn') : alerts || '—'}</div></td>
    <td>${item.base_unit ? button('Đặt ngưỡng', 'system-threshold', item.id) : button('Bổ sung đơn vị', 'count-unit', item.id)}</td></tr>`;
}

function stockView(stock, deliveries, transfers, items, locations, lowOnly, manager, overview) {
  const list = overview ? stockSummary(stock, items) : stock;
  const low = list.filter(row => row.low).length;
  const open = deliveries.filter(ticket => ticket.lines.some(line => line.outstanding)).length;
  const inTransit = transferGroups(transfers).filter(group => group.lines.some(ticket => ticket.in_transit)).length;
  const stats = [
    ['Mặt hàng', list.length, 'all-stock'],
    [overview ? 'Mặt hàng có cảnh báo' : 'Chạm ngưỡng tồn', low, 'low-stock'],
    ['Đơn đang chờ giao', open, 'page', 'deliveries'],
    ['Phiếu đang vận chuyển', inTransit, 'page', 'transfers'],
  ].map(([label, count, action, id]) =>
    `<button class="stat ${action === 'low-stock' && count ? 'warning' : ''}" type="button" data-action="${action}" data-id="${id ?? ''}">
      <span>${label}</span><strong>${count}</strong></button>`).join('');
  const rows = list.filter(row => !lowOnly || row.low).map(row => {
    const item = items[row.item_id];
    if (overview) return summaryRow(row, item, locations);
    const label = esc(unitLabel(item.base_unit));
    const id = row.location_id + '/' + row.item_id;
    return `<tr data-list-row data-search="${esc(itemSearch(item))}">${itemCell(item)}
      <td>${esc(locations[row.location_id])}</td><td data-label="Đang có"><strong>${row.on_hand === null ? 'Chưa biết' : number(row.on_hand)}</strong> ${row.on_hand === null ? '' : label}</td>
      <td data-label="Ngưỡng">${row.threshold === null ? '—' : number(row.threshold) + ' ' + label}</td>
      <td>${!item.base_unit ? badge('Thiếu đơn vị', 'warn') : row.low ? badge('Sắp hết', 'warn') : badge(row.on_hand === null ? 'Chưa kiểm kê' : row.threshold === null ? 'Chưa đặt ngưỡng' : 'Đủ hàng', 'neutral')}</td>
      <td><div class="actions">${item.base_unit ? button('Kiểm kê', 'count', id) : ''}${manager ? item.base_unit
        ? button('Đặt ngưỡng', 'threshold', id) : button('Bổ sung đơn vị', 'count-unit', item.id) : ''}</div></td></tr>`;
  }).join('');
  return `<div class="stats">${stats}</div><section class="panel" data-list><header class="panel-head"><div>
    <h2>${overview ? 'Tồn kho toàn hệ thống' : 'Số dư theo địa điểm'}</h2>
    ${overview ? '<small>Đặt ngưỡng tổng và ngưỡng từng nơi ngay trong bảng. Chọn một địa điểm để kiểm kê.</small>' : ''}</div>
    <label><input id="low-filter" type="checkbox" ${lowOnly ? 'checked' : ''}> Chỉ hiện cảnh báo</label></header>
    ${listControls('stock')}${rows ? `<div class="table-wrap stock-table" tabindex="0" aria-label="Bảng số dư">
      <table><thead><tr>${overview ? '<th>Mặt hàng</th><th>Đang có</th><th>Ngưỡng tổng</th><th>Cảnh báo</th><th>Thao tác</th>' :
        '<th>Mặt hàng</th><th>Địa điểm</th><th>Đang có</th><th>Ngưỡng</th><th>Trạng thái</th><th>Thao tác</th>'}</tr></thead>
      <tbody>${rows}</tbody></table></div>` : empty('Không có mặt hàng trong bộ lọc này.')}
    </section>`;
}

function receiptList(entries, unit, supplier) {
  if (!entries.length) return '';
  return `<details class="receipt-log" data-list><summary>${entries.length} lần xác nhận</summary>
    ${entries.length > 1 ? listControls('receipts-' + entries[0].id, 'Tìm lần xác nhận') : ''}<ul>
    ${entries.map(entry => `<li data-list-row>${number(entry.quantity)} ${unit} · ${esc(entry.receiver || entry.actor_name)} · ${date(entry.created_at)}
      ${entry.discrepancy ? ' · Chênh lệch ' + signed(entry.discrepancy) + ' ' + unit : ''}
      ${entry.note ? ' · ' + esc(entry.note) : ''}
      ${supplier && entry.has_photo ? `<button type="button" class="text-button" data-action="photo" data-id="${esc(entry.id)}">Xem ảnh</button>` : ''}
    </li>`).join('')}
    </ul></details>`;
}

function orderInvoices(delivery, items) {
  const invoices = delivery.lines.flatMap(line => line.receipts.filter(entry => entry.has_photo)
    .map(entry => ({ ...entry, item: items[line.item_id] })));
  invoices.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return `<details class="order-invoices" data-list><summary>Hóa đơn và phiếu giao (${invoices.length})</summary>
    ${invoices.length > 1 ? listControls('invoices-' + delivery.id, 'Tìm chứng từ') : ''}
    <div class="invoice-grid">${invoices.map((entry, index) => `<figure data-list-row
      data-search="${esc(itemSearch(entry.item) + ' ' + (entry.receiver || entry.actor_name) + ' ' + date(entry.created_at))}">
      <button type="button" class="invoice-thumb" data-action="photo" data-id="${esc(entry.id)}" aria-label="Phóng to chứng từ ${index + 1}">
        <img alt="" data-invoice-thumb="${esc(entry.id)}" hidden><span>Tải ảnh chứng từ</span></button>
      <figcaption>${date(entry.created_at)} · ${esc(entry.receiver || entry.actor_name)}</figcaption></figure>`).join('')}</div>
    ${invoices.length ? '' : '<p class="hint">Chưa có ảnh chứng từ đính kèm.</p>'}</details>`;
}

function deliveriesView(deliveries, items, locations, manager) {
  if (!deliveries.length) return `<div class="panel">${empty('Chưa có đơn giao ở địa điểm này.')}</div>`;
  return `<div class="tickets" data-list>${listControls('deliveries', 'Tìm đơn giao hoặc mặt hàng')}${deliveries.map(delivery => {
    const open = delivery.lines.some(line => line.outstanding);
    const partial = delivery.lines.some(line => line.received);
    const canReceive = manager || delivery.manager_created;
    return `<article class="ticket" data-list-row data-search="${esc([delivery.supplier, locations[delivery.location_id],
      ...delivery.lines.map(line => itemSearch(items[line.item_id]))].join(' '))}"><header class="ticket-head"><div><h2>${esc(delivery.supplier)}</h2>
      <small>${esc(locations[delivery.location_id])} · ${date(delivery.created_at)}</small></div>
      ${open ? badge(partial ? 'Đã nhận một phần' : 'Chờ giao', 'warn') : badge('Đã nhận đủ')}</header>
      ${delivery.note ? `<p class="muted">${esc(delivery.note)}</p>` : ''}
      ${manager ? orderInvoices(delivery, items) : ''}
      ${open && canReceive ? button('Xác nhận cả lô', 'receive-delivery-all', delivery.id, true) : ''}
      <div data-list>${delivery.lines.length > 1 ? listControls('delivery-' + delivery.id) : ''}
      ${delivery.lines.map(line => {
        const item = items[line.item_id];
        const unit = esc(unitLabel(item.base_unit));
        return `<section class="line" data-list-row data-search="${esc(itemSearch(item))}"><div class="line-body"><div><h3>${esc(item.name)}</h3>
          <div class="figures"><span>Dự kiến <b>${number(line.expected)} ${unit}</b></span>
          <span>Đã nhận <b>${number(line.received)} ${unit}</b></span><span>Còn chờ <b>${number(line.outstanding)} ${unit}</b></span></div></div>
          ${canReceive && line.outstanding ? button('Xác nhận nhận', 'receipt', line.id) : ''}</div>
          ${receiptList(line.receipts, unit, true)}</section>`;
      }).join('')}</div></article>`;
  }).join('')}</div>`;
}

export function transferGroups(transfers) {
  const groups = new Map();
  for (const line of transfers) {
    const id = line.batch_id || line.id;
    if (!groups.has(id)) groups.set(id, { id, lines: [] });
    groups.get(id).lines.push(line);
  }
  return [...groups.values()];
}

function transfersView(transfers, items, locations, user) {
  if (!transfers.length) return `<div class="panel">${empty('Chưa có phiếu chuyển ở địa điểm này.')}</div>`;
  return `<div class="tickets" data-list>${listControls('transfers', 'Tìm phiếu chuyển hoặc mặt hàng')}${transferGroups(transfers).map(group => {
    const first = group.lines[0];
    const canReceive = user.role === 'manager' || (first.manager_created && first.destination === user.location_id);
    const open = group.lines.some(line => !line.closed_at);
    const discrepancy = group.lines.some(line => line.discrepancy);
    const status = open ? badge('Đang vận chuyển', 'warn') :
      badge(discrepancy ? 'Đã đóng · Có chênh lệch' : 'Đã nhận đủ', discrepancy ? 'warn' : '');
    return `<article class="ticket" data-list-row data-search="${esc([locations[first.source], locations[first.destination],
      ...group.lines.map(line => itemSearch(items[line.item_id]))].join(' '))}"><header class="ticket-head"><div>
      <h2>${group.lines.length === 1 ? esc(items[first.item_id].name) : 'Phiếu chuyển · ' + group.lines.length + ' mặt hàng'}</h2>
      <small>${esc(locations[first.source])} → ${esc(locations[first.destination])} · ${date(first.dispatched_at)}</small></div>
      ${status}</header>
      ${first.note ? `<p class="muted">${esc(first.note)}</p>` : ''}
      ${open && canReceive ? button('Xác nhận cả lô', 'receive-transfer-all', group.id, true) : ''}
      <div data-list>${group.lines.length > 1 ? listControls('transfer-' + group.id) : ''}
      ${group.lines.map(line => {
        const item = items[line.item_id];
        const unit = esc(unitLabel(item.base_unit));
        return `<section class="line" data-list-row data-search="${esc(itemSearch(item))}">
          ${group.lines.length > 1 ? `<h3>${esc(item.name)}</h3>` : ''}
          <div class="line-body"><div class="figures">
            <span>Đã xuất <b>${number(line.sent)} ${unit}</b></span><span>Thực nhận <b>${number(line.received)} ${unit}</b></span>
            <span>Đang đi <b>${number(line.in_transit)} ${unit}</b></span>
            ${line.closed_at ? `<span>Chênh lệch <b>${signed(line.discrepancy)} ${unit}</b></span>` : ''}
          </div>${canReceive && !line.closed_at ? button('Xác nhận thực nhận', 'transfer-receipt', line.id) : ''}</div>
          ${receiptList(line.receipts, unit, false)}</section>`;
      }).join('')}</div></article>`;
  }).join('')}</div>`;
}

function historyView(history, items, locations, query) {
  const search = `<form id="history-search" class="list-controls">
    <label>Tìm trong nhật ký<input type="search" name="query" maxlength="150" value="${esc(query)}"></label>
    <button class="button" type="submit">Tìm</button></form>`;
  if (!history.entries.length) return `<div class="panel">${search}${empty(query ? 'Không có kết quả.' : 'Chưa có thay đổi tồn kho.')}</div>`;
  const rows = history.entries.map(row => {
    const item = items[row.item_id];
    const unit = esc(unitLabel(item.base_unit));
    return `<tr data-list-row data-search="${esc([itemSearch(item), row.actor_name, locations[row.location_id], eventNames[row.type], row.note].join(' '))}"><td>${date(row.created_at)}<small>${esc(row.actor_name)}</small></td>
      <td>${eventNames[row.type]}</td><td>${esc(item.name)}<small>${esc(locations[row.location_id])}</small></td>
      <td>${row.delta === null ? '—' : signed(row.delta) + ' ' + unit}</td>
      <td>${row.balance === null ? 'Chưa biết' : number(row.balance) + ' ' + unit}</td><td>
      ${row.already_counted !== null ? 'Đã tính trong phiếu: ' + number(row.already_counted) + ' ' + unit + ' · ' : ''}
      ${esc(row.note) || '—'}</td></tr>`;
  }).join('');
  return `<div class="panel" data-list>${search}${listControls('history', null)}<div class="table-wrap" tabindex="0" aria-label="Bảng lịch sử"><table>
    <thead><tr><th>Thời gian</th><th>Thao tác</th><th>Mặt hàng</th><th>Thay đổi</th><th>Số dư</th><th>Ghi chú</th></tr></thead>
    <tbody>${rows}</tbody></table></div></div>${history.next ? `<div class="pager">${button('Xem thêm', 'more-history')}</div>` : ''}`;
}

function countView(state, stock, items, locations) {
  const place = state.location || state.data.user.location_id;
  const scoped = stock.filter(row => row.location_id === place);
  const categories = [...new Set(scoped.map(row => items[row.item_id].category))].sort();
  const rows = scoped.filter(row => items[row.item_id].category === state.category)
    .sort((a, b) => items[a.item_id].name.localeCompare(items[b.item_id].name));
  const draft = state.draft ?? { values: {}, performedBy: '', note: '' };
  const tickets = state.data.counts.filter(ticket => !place || ticket.location_id === place);
  const history = tickets.map(ticket => `<details class="ticket" data-list-row data-search="${esc([ticket.category,
    locations[ticket.location_id], ticket.performed_by, ...ticket.lines.map(line => itemSearch(items[line.item_id]))].join(' '))}"><summary>
    <strong>${esc(ticket.category)}</strong> · ${esc(locations[ticket.location_id])} · ${date(ticket.submitted_at)}
    · ${esc(ticket.performed_by)} · ${ticket.lines.length} đã đếm</summary>
    ${ticket.note ? `<p>${esc(ticket.note)}</p>` : ''}
    <div data-list>${ticket.lines.length > 1 ? listControls('count-' + ticket.id) : ''}
    <div class="table-wrap"><table><thead><tr><th>Mặt hàng</th><th>Trước</th><th>Thực đếm</th><th>Chênh lệch</th></tr></thead><tbody>
    ${ticket.lines.map(line => `<tr data-list-row data-search="${esc(itemSearch(items[line.item_id]))}"><td>${esc(items[line.item_id].name)}</td><td>${line.before === null ? '—' : number(line.before)}</td>
      <td>${number(line.counted)} ${esc(unitLabel(items[line.item_id].base_unit))}</td>
      <td>${line.before === null ? '—' : signed(line.counted - line.before)}</td></tr>`).join('')}
    </tbody></table></div></div></details>`).join('');
  return `<section class="panel count-panel">
    ${place ? `<label>Nhóm hàng<select id="count-category">${option('', 'Chọn nhóm hàng', state.category)}
      ${categories.map(category => option(category, category, state.category)).join('')}</select></label>` : empty('Chọn địa điểm ở đầu trang.')}
    ${rows.length ? `<p class="hint">Để trống nếu chưa đếm. Nhập 0 nếu hết hàng. Chọn đơn vị tương ứng với số đã đếm.</p>
      <div class="count-items" data-list>${listControls('count-items-' + place + '-' + state.category, 'Tìm trong nhóm')}${rows.map(row => {
        const item = items[row.item_id];
        const entry = draft.values[item.id];
        const choices = Object.keys(item.units);
        return `<div class="count-item" data-list-row data-search="${esc(itemSearch(item))}">
          <span><strong>${esc(item.name)}</strong><small>${esc([item.id, item.sku].filter(Boolean).join(' · '))}</small>
          ${item.pack ? `<small>${esc(item.pack)}</small>` : ''}</span>
          ${item.base_unit ? `<div class="count-quantity"><input data-count-item="${esc(item.id)}" type="text" inputmode="decimal" maxlength="16"
            aria-label="Số đếm ${esc(item.name)}" value="${esc(entry?.quantity)}" placeholder="—">
            ${choices.length > 1 ? `<select data-count-unit aria-label="Đơn vị đếm ${esc(item.name)}">
              ${choices.map(unit => option(unit, unitChoice(item, unit), entry?.unit ?? item.base_unit)).join('')}</select>`
              : `<small>${esc(unitLabel(item.base_unit))}</small>`}</div>` : badge('Thiếu đơn vị', 'warn')}
          <small class="error" data-count-stale="${esc(item.id)}" ${entry && entry.revision !== row.revision ? '' : 'hidden'}>Tồn đã thay đổi. Kiểm và nhập lại số.</small>
        </div>`;
      }).join('')}</div>
      <label>Người kiểm kê<input id="count-performed" maxlength="150" value="${esc(draft.performedBy)}"></label>
      <label>Ghi chú<textarea id="count-note" rows="2" maxlength="500">${esc(draft.note)}</textarea></label>
      <div class="count-footer"><span id="count-progress" aria-live="polite"></span>${button('Kiểm tra và gửi', 'submit-count', '', true)}</div>
      <small>Lần gửi này gồm các nhóm đã đếm tại địa điểm đang chọn.</small>` : ''}
  </section><div class="tickets count-history" data-list><h2>Phiếu đã gửi gần đây</h2>
    ${history ? listControls('count-history', 'Tìm phiếu hoặc mặt hàng') + history : empty('Chưa có phiếu kiểm kê.')}</div>`;
}

const usd = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

function reportView(state, items, locations) {
  if (!state.report) return empty('Đang tải báo cáo…');
  const { rows, week } = state.report;
  const priced = rows.filter(row => row.value !== null);
  const missingPrices = rows.filter(row => row.onHand > 0 && items[row.item_id].cost === null).length;
  const unknown = rows.filter(row => row.onHand === null).length;
  const renderNumber = value => value === null ? '—' : number(value);
  const countTime = (timestamp, opening = false) => timestamp
    ? '<small>' + (opening ? 'Từ Sheet · ' : '') + esc(date(timestamp)) + '</small>' : '';
  return `<section class="panel" data-list>
    <header class="panel-head"><div><h2>Giá trị tồn hiện tại</h2>
      <p><strong>${priced.length || (!missingPrices && !unknown) ? usd(priced.reduce((sum, row) => sum + row.value, 0)) : '—'}</strong>
      ${missingPrices || unknown ? ' · Tạm tính' : ''}</p>
      <small>${missingPrices} dòng có tồn chưa có giá · ${unknown} dòng chưa biết tồn</small></div>
      <label>Tuần bắt đầu<input id="report-week" type="date" value="${esc(week)}"></label></header>
    <p class="report-note hint">Cuối kỳ là lần kiểm kê cuối cùng trong tuần đã chọn. Đầu kỳ là lần kiểm kê ngay trước đó của cùng mặt hàng tại cùng địa điểm, hoặc số dư nhập từ Sheet nếu đây là lần đầu. Giờ hiển thị theo Atlanta. Dòng thiếu mốc hiển thị “—”.</p>
    ${listControls('report')}<div class="table-wrap" tabindex="0" aria-label="Báo cáo tồn và tiêu hao"><table>
      <thead><tr><th>Mặt hàng</th><th>Đầu kỳ</th><th>Cuối kỳ</th><th>Đã dùng</th><th>Tồn hiện tại</th><th>Đơn giá USD</th><th>Giá trị tồn</th></tr></thead>
      <tbody>${rows.map(row => {
        const item = items[row.item_id];
        return `<tr data-list-row data-search="${esc(itemSearch(item) + ' ' + locations[row.location_id])}"><td><strong>${esc(item.name)}</strong><small>${esc(locations[row.location_id])} · ${esc(unitLabel(item.base_unit))}</small></td>
          <td>${renderNumber(row.beginning)}${countTime(row.beginningAt, row.opening)}</td><td>${renderNumber(row.ending)}${countTime(row.endingAt)}</td>
          <td>${renderNumber(row.usage)}${row.usage < 0 ? '<small class="error">Cần rà soát</small>' : ''}</td><td>${renderNumber(row.onHand)}</td>
          <td>${item.cost === null ? '—' : esc(item.cost)} ${item.base_unit ? button('Đặt giá', 'price', item.id) : ''}</td>
          <td>${row.value === null ? '—' : usd(row.value)}</td></tr>`;
      }).join('')}</tbody>
    </table></div></section>`;
}
