import { apiBase } from './config.js';
import { button, date, esc, itemSearch, listControls, number, option, renderDashboard, renderLogin, transferGroups, unitChoice, unitLabel, units } from './view.js';

const app = document.querySelector('#app');
const dialog = document.querySelector('#dialog');
const toast = document.querySelector('#toast');
const storageKey = 'bep-session';
const capacitor = window.Capacitor;
const native = capacitor?.isNativePlatform?.() === true;
const token = native ? null : sessionStorage.getItem(storageKey) ?? sessionStorage.getItem('bep-manager-session') ?? sessionStorage.getItem('bep-staff-session');
if (token) sessionStorage.setItem(storageKey, token);
if (native) sessionStorage.removeItem(storageKey);
sessionStorage.removeItem('bep-manager-session');
sessionStorage.removeItem('bep-staff-session');
const state = { token, data: null, page: 'stock', location: '', lowOnly: false,
  history: { entries: [], next: null }, historyQuery: '', category: '', draft: null, report: null, reportWeek: '',
  sessionMessage: '', pendingLogout: false, persistent: false };
let restoring = false;
let signingIn = false;
let toastTimer;
let photoUrl;
let orderLineId = 0;
let invoiceObserver;
const invoiceUrls = new Map();
let busy = false;
let readVersion = 0;
const listStates = new Map();
const pageSize = 20;
const mobileNav = matchMedia('(max-width: 650px)');
const searchText = value => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').trim();

function setupLists(root, saved = new Map()) {
  for (const controls of root.querySelectorAll('[data-list-controls]')) {
    const list = controls.closest('[data-list]');
    const key = controls.dataset.listControls;
    const state = saved.get(key) ?? { query: '', page: 0 };
    saved.set(key, state);
    const input = controls.querySelector('[data-list-search]');
    const prev = controls.querySelector('[data-list-prev]');
    const next = controls.querySelector('[data-list-next]');
    const pagination = controls.querySelector('[data-list-pages]');
    const status = controls.querySelector('[data-list-status]');
    const empty = controls.querySelector('[data-list-empty]');
    if (input) input.value = state.query;
    function render() {
      const query = searchText(state.query);
      const rows = [...list.querySelectorAll('[data-list-row]')].filter(row => row.closest('[data-list]') === list);
      const matches = rows.filter(row => searchText(row.dataset.search ?? row.textContent).includes(query));
      const pages = Math.max(1, Math.ceil(matches.length / pageSize));
      state.page = Math.max(0, Math.min(state.page, pages - 1));
      const start = state.page * pageSize;
      const visible = new Set(matches.slice(start, start + pageSize));
      rows.forEach(row => { row.hidden = !visible.has(row); });
      prev.disabled = state.page === 0;
      next.disabled = state.page + 1 === pages;
      pagination.hidden = pages < 2;
      empty.hidden = matches.length > 0 || (!rows.length && Boolean(list.querySelector(':scope > .empty')));
      controls.hidden = !input && pagination.hidden && empty.hidden;
      status.textContent = pagination.hidden ? '' : (start + 1) + '–' + (start + visible.size) + ' / ' + matches.length;
    }
    input?.addEventListener('input', () => { state.query = input.value; state.page = 0; render(); });
    input?.addEventListener('keydown', event => { if (event.key === 'Enter') event.preventDefault(); });
    prev.addEventListener('click', () => { state.page--; render(); });
    next.addEventListener('click', () => { state.page++; render(); });
    list.addEventListener('refresh-list', render);
    render();
  }
}

function notify(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 6000);
}

function updateManagerNav(scroll = 0, focusedTab) {
  const nav = app.querySelector('[data-manager-nav]');
  if (!nav || !mobileNav.matches) return;
  const active = nav.querySelector('[aria-current="page"]');
  if (focusedTab) nav.querySelector(`[data-id="${CSS.escape(focusedTab)}"]`)?.focus({ preventScroll: true });
  nav.scrollLeft = scroll;
  const bounds = nav.getBoundingClientRect();
  const tab = active.getBoundingClientRect();
  const padding = 4;
  if (tab.left < bounds.left + padding) nav.scrollLeft += tab.left - bounds.left - padding;
  else if (tab.right > bounds.right - padding) nav.scrollLeft += tab.right - bounds.right + padding;
  app.querySelector('.nav-scroll-hint').hidden = nav.scrollWidth <= nav.clientWidth;
}

window.addEventListener('resize', () => updateManagerNav(app.querySelector('[data-manager-nav]')?.scrollLeft));

function draw() {
  if (state.page === 'counts' && state.data) state.draft = readDraft();
  const nav = app.querySelector('[data-manager-nav]');
  const navScroll = nav?.scrollLeft;
  const focusedTab = nav?.contains(document.activeElement) ? document.activeElement.dataset.id : undefined;
  document.body.classList.toggle('staff', state.data?.user.role === 'staff');
  invoiceObserver?.disconnect();
  invoiceUrls.forEach(({ url }) => URL.revokeObjectURL(url));
  invoiceUrls.clear();
  app.innerHTML = state.sessionMessage
    ? `<section class="loading" role="status"><p>${esc(state.sessionMessage)}</p>
      ${button('Thử lại', 'restore-session')}</section>`
    : state.data ? renderDashboard(state) : renderLogin();
  updateManagerNav(navScroll, focusedTab);
  setupLists(app, listStates);
  observeInvoices();
  app.removeAttribute('aria-busy');
  if (state.page === 'counts' && state.data) updateCountView();
}

async function secureSession(method, record) {
  // Capacitor injects this bridge into both packaged pages and the Android demo WebView.
  // These native method names and Keychain access values are from Secure Storage 8.0.1.
  try {
    const options = { prefixedKey: 'bep-session-v1:' + (apiBase || location.origin), sync: false };
    if (record) Object.assign(options, { data: JSON.stringify(record), access: 1 });
    return await capacitor.nativePromise('SecureStorage', method, options);
  } catch {
    throw new Error('Không thể truy cập kho lưu phiên an toàn. Mở khóa thiết bị rồi thử lại.');
  }
}

async function clearSession() {
  state.token = null;
  state.persistent = state.pendingLogout = false;
  state.sessionMessage = '';
  state.data = null;
  state.page = 'stock';
  state.location = '';
  state.lowOnly = false;
  state.history = { entries: [], next: null };
  state.category = state.historyQuery = state.reportWeek = '';
  state.draft = state.report = null;
  listStates.clear();
  if (dialog.open) dialog.close();
  if (native) {
    try {
      await secureSession('internalRemoveItem');
    } catch (error) {
      state.sessionMessage = error.message;
    }
  } else sessionStorage.removeItem(storageKey);
  draw();
}

async function restoreNativeSession() {
  if (restoring) return;
  restoring = true;
  state.sessionMessage = 'Đang xác minh phiên đăng nhập…';
  draw();
  try {
    if (!state.token) {
      const { data } = await secureSession('internalGetItem');
      if (!data) {
        state.sessionMessage = '';
        draw();
        return;
      }
      const record = JSON.parse(data);
      if (typeof record?.token !== 'string' || !/^[a-f0-9]{64}$/.test(record.token)) {
        await clearSession();
        return;
      }
      state.token = record.token;
      state.persistent = true;
      state.pendingLogout = record.logout === true;
    }
    if (state.pendingLogout) {
      await api('logout', { method: 'POST' });
      await clearSession();
      return;
    }
    await refresh();
  } catch (error) {
    if (error.status === 401) {
      if (!state.sessionMessage && !state.pendingLogout) notify(error.message);
      return;
    }
    state.sessionMessage = state.pendingLogout
      ? 'Chưa thể hoàn tất đăng xuất. Kết nối lại với máy chủ để thu hồi phiên.'
      : error instanceof SyntaxError ? 'Không thể đọc phiên đã lưu. Vui lòng thử lại.' : error.message;
    draw();
  } finally {
    restoring = false;
  }
}

async function api(path, { method = 'GET', data, key, binary = false } = {}) {
  const headers = {};
  const token = state.token;
  if (token) headers.Authorization = 'Bearer ' + token;
  if (data !== undefined) headers['Content-Type'] = 'application/json';
  if (key) headers['Idempotency-Key'] = key;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(apiBase + '/api/' + path, {
      method, headers, body: data === undefined ? undefined : JSON.stringify(data),
      signal: controller.signal,
    });
    if (!response.ok) {
      if (response.status === 401 && path !== 'login' && token === state.token) await clearSession();
      const body = await response.json().catch(() => ({}));
      throw Object.assign(new Error(body.error ?? 'Máy chủ trả về lỗi.'), { status: response.status });
    }
    return await (binary ? response.blob() : response.json());
  } catch (error) {
    if (error.status) throw error;
    throw new Error('Mất kết nối với máy chủ. Kiểm tra mạng rồi thử lại.');
  } finally {
    clearTimeout(timeout);
  }
}

async function loadHistory(before = null) {
  const params = new URLSearchParams();
  if (state.location) params.set('location', state.location);
  if (before) params.set('before', before);
  if (state.historyQuery) params.set('q', state.historyQuery);
  return api('history?' + params);
}

async function refresh() {
  const version = ++readVersion;
  const params = new URLSearchParams();
  if (state.location) params.set('location', state.location);
  if (state.reportWeek) params.set('week', state.reportWeek);
  const [data, history, report] = await Promise.all([
    api('snapshot'), state.page === 'history' ? loadHistory() : null,
    state.page === 'report' ? api('report?' + params) : null,
  ]);
  if (version !== readVersion || !state.token) return;
  const initial = !state.data;
  state.sessionMessage = '';
  state.data = data;
  if (initial) restoreCountPage();
  if (history) state.history = history;
  if (report) state.report = report;
  draw();
}

function getItem(id) {
  return state.data.items.find(item => item.id === id);
}

function getLocation(id) {
  return state.data.locations.find(place => place.id === id)?.name;
}

function unitOptions(item, selected = item.base_unit) {
  return Object.keys(item.units).map(unit => option(unit, unitChoice(item, unit), selected)).join('');
}

function qtyText(value, item) {
  return value === null ? 'chưa biết' : number(value) + ' ' + esc(unitLabel(item.base_unit));
}

function quantityFields(item, { label = 'Số lượng', value = '', required = true } = {}) {
  return `<div class="field-row"><label>${esc(label)}<input name="quantity" type="number" inputmode="decimal"
    min="0" max="1000000000" step="0.001" value="${esc(value)}" ${required ? 'required' : ''}></label>
    <label>Đơn vị<select name="unit">${unitOptions(item)}</select></label></div>`;
}

function locationField(name, label, places, selected) {
  return `<label>${esc(label)}<select name="${name}" required>
    ${places.map(place => option(place.id, place.name, selected)).join('')}</select></label>`;
}

function itemCategories() {
  const categories = [...new Set(state.data.items.map(item => item.category).filter(Boolean))].sort();
  return `<datalist id="item-categories">${categories.map(category => option(category, category)).join('')}</datalist>`;
}

function catalogFields() {
  return `<label>Tên mặt hàng mới<input name="newName" maxlength="150" required></label>
    <div class="field-row"><label>Danh mục<input name="newCategory" list="item-categories" maxlength="150" required></label>
    <label>SKU (tùy chọn)<input name="newSku" maxlength="80"></label></div>
    <label>Đơn vị gốc<select name="newUnit" required>${option('', 'Chọn đơn vị gốc')}
      ${Object.keys(units).map(unit => option(unit, unitLabel(unit))).join('')}</select></label>
    <label data-case-size hidden>Số đơn vị gốc trong 1 thùng (tùy chọn)
      <input name="newCaseSize" type="number" inputmode="numeric" min="1" max="1000000000" step="1" disabled>
      <small class="hint" data-case-hint></small></label>`;
}

function catalogValues(container) {
  const value = name => container.querySelector('[name="' + name + '"]').value.trim();
  const unit = value('newUnit');
  return { name: value('newName'), category: value('newCategory'), sku: value('newSku'), unit,
    caseSize: unit === 'case' ? '' : value('newCaseSize') };
}

function updateCatalogUnits(container) {
  const { unit, caseSize } = catalogValues(container);
  const conversion = container.querySelector('[data-case-size]');
  conversion.hidden = conversion.querySelector('input').disabled = !unit || unit === 'case';
  conversion.querySelector('[data-case-hint]').textContent = caseSize
    ? '1 thùng = ' + caseSize + ' ' + unitLabel(unit) : 'Để trống nếu chỉ đếm theo ' + unitLabel(unit) + '.';
  const deliveryUnit = container.closest('.order-row')?.querySelector('[name="unit"]');
  if (!deliveryUnit) return;
  const choices = { [unit]: 1 };
  if (unit !== 'case' && /^[1-9]\d*$/.test(caseSize)) choices.case = Number(caseSize);
  const selected = Object.hasOwn(choices, deliveryUnit.value) ? deliveryUnit.value : unit;
  deliveryUnit.innerHTML = unit ? unitOptions({ base_unit: unit, units: choices }, selected) : option('', 'Chọn đơn vị gốc trước');
}

function orderLine(removable) {
  const id = ++orderLineId;
  return `<section class="order-row">
    <div class="order-line-head"><h4>Mặt hàng</h4>${removable ? button('Bỏ dòng', 'remove-line') : ''}</div>
    <div class="order-picker">
      <label for="order-search-${id}">Tìm mặt hàng</label>
      <input id="order-search-${id}" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false"
        aria-controls="order-matches-${id}" data-order-search autocomplete="off" placeholder="Tên mặt hàng hoặc SKU" required>
      <input type="hidden" name="item">
      <div class="order-matches" hidden><ul id="order-matches-${id}" role="listbox" aria-label="Mặt hàng gợi ý"></ul>
        <p class="hint" role="status"></p></div>
    </div>
    <div><button type="button" class="text-button" data-edit data-action="toggle-new-item" aria-expanded="false">Tạo mặt hàng mới</button></div>
    <fieldset class="new-order-item" hidden disabled>
      <legend>Thông tin mặt hàng mới</legend>${catalogFields()}
    </fieldset>
    <div class="field-row"><label>Số lượng dự kiến<input name="quantity" type="number" inputmode="decimal" min=".001"
      max="1000000000" step=".001" required></label>
    <label>Đơn vị<select name="unit" required>${option('', 'Chọn mặt hàng trước')}</select></label></div>
  </section>`;
}

function closeOrderMatches(picker) {
  picker.querySelector('.order-matches').hidden = true;
  const input = picker.querySelector('[data-order-search]');
  input.setAttribute('aria-expanded', 'false');
  input.removeAttribute('aria-activedescendant');
}

function showOrderMatches(input) {
  const picker = input.closest('.order-picker');
  const query = searchText(input.value);
  const matches = state.data.items.filter(item => item.base_unit && searchText(itemSearch(item)).includes(query));
  const list = picker.querySelector('[role="listbox"]');
  list.innerHTML = matches.slice(0, 20).map((item, index) => `<li id="${list.id}-${index}" role="option" aria-selected="false"
    data-action="choose-order-item" data-id="${esc(item.id)}"><strong>${esc(item.name)}</strong>
    <small>${esc([item.sku, item.category, unitLabel(item.base_unit)].filter(Boolean).join(' · '))}</small></li>`).join('');
  picker.querySelector('[role="status"]').textContent = !matches.length ? 'Không tìm thấy mặt hàng.'
    : matches.length > 20 ? 'Gõ thêm để thu hẹp kết quả.' : '';
  input.removeAttribute('aria-activedescendant');
  input.setAttribute('aria-expanded', 'true');
  picker.querySelector('.order-matches').hidden = false;
}

function chooseOrderItem(id, target) {
  const row = target.closest('.order-row');
  const item = getItem(id);
  const input = row.querySelector('[data-order-search]');
  input.value = item.name;
  input.setCustomValidity('');
  row.querySelector('[name="item"]').value = id;
  row.querySelector('[name="unit"]').innerHTML = unitOptions(item);
  input.focus();
  closeOrderMatches(input.closest('.order-picker'));
}

function toggleNewOrderItem(_, target) {
  const row = target.closest('.order-row');
  const picker = row.querySelector('.order-picker');
  const search = picker.querySelector('[data-order-search]');
  const fields = row.querySelector('.new-order-item');
  const creating = fields.hidden;
  const unit = row.querySelector('[name="unit"]');
  const selected = getItem(row.querySelector('[name="item"]').value);
  picker.hidden = search.disabled = creating;
  fields.hidden = fields.disabled = !creating;
  target.textContent = creating ? 'Chọn mặt hàng có sẵn' : 'Tạo mặt hàng mới';
  target.setAttribute('aria-expanded', String(creating));
  if (creating) {
    updateCatalogUnits(fields);
    fields.querySelector('[name="newName"]').focus();
  } else {
    unit.innerHTML = selected ? unitOptions(selected) : option('', 'Chọn mặt hàng trước');
    search.focus();
  }
}

function noteField(label = 'Ghi chú') {
  return `<label>${esc(label)}<textarea name="note" maxlength="500" rows="2"></textarea></label>`;
}

function newKey() {
  return Array.from(crypto.getRandomValues(new Uint8Array(20)), value => value.toString(16).padStart(2, '0')).join('');
}

function formError(form, message) {
  const error = form.querySelector('.error');
  error.textContent = message;
  error.hidden = !message;
}

function showForm({ title, fields, action, collect, save = pending => api(action, { method: 'POST', ...pending }),
  submit = 'Lưu', success = 'Đã lưu.', onSuccess }) {
  dialog.innerHTML = `<h2 id="dialog-title">${esc(title)}</h2><form>
    ${fields}<p class="error" role="alert" hidden></p>
    <div class="actions">${button('Hủy', 'close')}<button class="button primary" type="submit">${esc(submit)}</button></div>
  </form>`;
  const form = dialog.querySelector('form');
  const submitButton = form.querySelector('[type="submit"]');
  const receiver = form.elements.receiver;
  const updateSubmit = () => { submitButton.disabled = busy || Boolean(receiver && !receiver.value.trim()); };
  receiver?.addEventListener('input', updateSubmit);
  updateSubmit();
  let pending;
  let lockedFields = [];
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    const cancel = form.querySelector('[data-action="close"]');
    submitButton.disabled = cancel.disabled = true;
    formError(form, '');
    try {
      pending ??= { data: await collect(new FormData(form), form), key: newKey() };
      await save(pending);
      onSuccess?.();
      dialog.close();
      notify(success);
      await refresh().catch(error => notify('Đã lưu. ' + error.message));
    } catch (error) {
      if (pending && (!error.status || error.status >= 500)) {
        submitButton.textContent = 'Thử lại lần lưu này';
        if (!lockedFields.length) {
          lockedFields = [...form.querySelectorAll('input, select, textarea, [data-edit], [data-action="add-line"], [data-action="remove-line"]')]
            .filter(element => !element.disabled);
          lockedFields.forEach(element => { element.disabled = true; });
        }
        formError(form, error.message + ' Thử lại để dùng cùng mã xác nhận.');
      } else {
        pending = null;
        submitButton.textContent = submit;
        lockedFields.forEach(element => { element.disabled = false; });
        lockedFields = [];
        formError(form, error.message);
      }
    } finally {
      busy = false;
      cancel.disabled = false;
      updateSubmit();
    }
  });
  dialog.showModal();
  setupLists(dialog);
}

function countLocation() {
  return state.location || state.data.user.location_id;
}

function staffPasswordForm(id) {
  const account = state.data.accounts?.find(candidate => candidate.id === id);
  if (!account) return;
  showForm({
    title: 'Đổi mật khẩu nhân viên',
    fields: `<p><strong>${esc(account.id)}</strong> · ${esc(getLocation(account.location_id))}</p>
      <p class="hint">Sau khi lưu, tất cả thiết bị đang dùng tài khoản này sẽ phải đăng nhập lại.</p>
      <label>Mật khẩu mới<input type="password" name="password" autocomplete="new-password" required minlength="12" maxlength="256"></label>
      <label>Nhập lại mật khẩu mới<input type="password" name="confirmation" autocomplete="new-password" required minlength="12" maxlength="256"></label>`,
    action: 'staff-passwords',
    collect: form => {
      const password = form.get('password');
      if (password !== form.get('confirmation')) throw new Error('Hai mật khẩu không khớp.');
      return { account: id, password };
    },
    submit: 'Lưu mật khẩu mới',
    success: 'Đã đổi mật khẩu và thu hồi các phiên đăng nhập cũ.',
  });
}

function draftScope() {
  return ['bep-count-draft', apiBase, state.data.items[0]?.id, state.data.user.id];
}

function draftKey(place = countLocation(), category = state.category) {
  return JSON.stringify([...draftScope(), place, category]);
}

function readStored(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function readDraft(place = countLocation(), category = state.category) {
  const draft = readStored(draftKey(place, category));
  const values = draft?.values;
  return { values: values && typeof values === 'object' && !Array.isArray(values) ? values : {},
    performedBy: typeof draft?.performedBy === 'string' ? draft.performedBy : '',
    note: typeof draft?.note === 'string' ? draft.note : '' };
}

function countDrafts(place, activeDraft) {
  const items = new Map(state.data.items.map(item => [item.id, item]));
  const groups = new Map();
  for (const row of state.data.stock) {
    if (row.location_id !== place) continue;
    const item = items.get(row.item_id);
    if (!item?.base_unit) continue;
    const { category } = item;
    if (!groups.has(category)) {
      const draft = category === state.category && activeDraft ? activeDraft : readDraft(place, category);
      groups.set(category, { category, draft, entries: [] });
    }
    const group = groups.get(category);
    const entry = group.draft.values[item.id];
    if (typeof entry?.quantity === 'string' && entry.quantity.trim()) group.entries.push({ item, row, entry });
  }
  return [...groups.values()].filter(group => group.entries.length);
}

function rememberCountGroup() {
  try {
    localStorage.setItem(JSON.stringify(draftScope()), JSON.stringify({ place: countLocation(), category: state.category }));
  } catch { /* Draft storage may be unavailable. */ }
}

function restoreCountGroup(place, previous = readStored(JSON.stringify(draftScope()))) {
  const groups = countDrafts(place);
  return (previous?.place === place && groups.find(group => group.category === previous.category)?.category)
    || groups[0]?.category || '';
}

function restoreCountPage() {
  const previous = readStored(JSON.stringify(draftScope()));
  const { user, locations } = state.data;
  if (user.role === 'staff') {
    state.page = 'counts';
    state.category = restoreCountGroup(user.location_id, previous);
    return;
  }
  // Older drafts have no saved location preference. Restore only when their location is unambiguous.
  const candidates = locations.filter(place => !previous || place.id === previous.place)
    .map(place => ({ id: place.id, category: restoreCountGroup(place.id, previous) }))
    .filter(place => place.category);
  if (candidates.length !== 1) return;
  state.page = 'counts';
  state.location = candidates[0].id;
  state.category = candidates[0].category;
}

function updateCountView() {
  const progress = app.querySelector('#count-progress');
  if (progress) {
    const fields = [...app.querySelectorAll('[data-count-item]')];
    const count = fields.length;
    const entered = fields.filter(field => field.value.trim()).length;
    progress.textContent = entered + '/' + count + ' đã nhập' + (count ? ' · ' + (count - entered) + ' chưa đếm' : '');
  }
}

const receiverField = () => '<label>Tên người nhận / Người chịu trách nhiệm<input name="receiver" maxlength="150" required></label>';
const photoField = () => '<label>Ảnh hóa đơn hoặc phiếu giao<input name="photo" type="file" accept="image/jpeg,image/png,image/webp"></label>';

async function receiptPhoto(data) {
  const file = data.get('photo');
  if (file?.size > 5 * 1024 * 1024) throw new Error('Chọn ảnh tối đa 5 MB.');
  return file?.size ? { photo: await readFile(file) } : {};
}

function fullReceiptForm(kind, id) {
  const delivery = kind === 'delivery' && state.data.deliveries.find(ticket => ticket.id === id);
  const group = kind === 'transfer' && transferGroups(state.data.transfers).find(ticket => ticket.id === id);
  const lines = delivery ? delivery.lines.filter(line => line.outstanding > 0) : group.lines.filter(line => !line.closed_at);
  const outstanding = line => delivery ? line.outstanding : line.in_transit;
  const place = delivery ? delivery.location_id : group.lines[0].destination;
  showForm({
    title: 'Xác nhận cả lô hàng',
    fields: `<p><strong>${esc(getLocation(place))}</strong> · ${lines.length} mặt hàng còn chờ</p>
      <p class="hint">Chỉ xác nhận cả lô khi đã kiểm đủ số bên dưới. Nếu thiếu hoặc đã tính hàng vào phiếu kiểm kê, hãy xác nhận từng mặt hàng.</p>
      <div class="transfer-picker" data-list>${listControls('full-receipt')}<ul>
        ${lines.map(line => {
          const item = getItem(line.item_id);
          return `<li data-list-row data-search="${esc(itemSearch(item))}">${esc(item.name)} · ${qtyText(outstanding(line), item)}</li>`;
        }).join('')}</ul></div>
      ${receiverField()}${delivery ? photoField() : ''}${noteField()}`,
    action: delivery ? 'delivery-receipts-all' : 'transfer-receipts-all',
    collect: async data => ({ [kind]: id, receiver: data.get('receiver').trim(), note: data.get('note').trim(),
      lines: lines.map(line => ({ id: line.id, outstanding: outstanding(line) })), ...await receiptPhoto(data) }),
    submit: 'Xác nhận nhận đủ toàn bộ hàng',
    success: 'Đã xác nhận toàn bộ số hàng còn chờ.',
  });
}

function submitCount() {
  const place = countLocation();
  const groups = countDrafts(place, state.draft);
  const defaultName = state.draft.performedBy.trim() || groups.find(group => group.draft.performedBy.trim())?.draft.performedBy.trim();
  if (!defaultName || !groups.length) throw new Error('Nhập tên người kiểm kê và ít nhất một số đếm.');
  const requests = groups.map(({ category, draft, entries }) => {
    const lines = entries.map(({ item, row, entry }) => {
      const label = item.name + ' (' + category + ')';
      const unit = entry.unit ?? item.base_unit;
      if (!/^\d{1,10}(\.\d{1,3})?$/.test(entry.quantity) || !Object.hasOwn(item.units, unit)) {
        throw new Error('Kiểm tra lại số đếm và đơn vị của ' + label + '.');
      }
      if (entry.revision !== row.revision) throw new Error('Kiểm và nhập lại số của ' + label + ' vì tồn đã thay đổi.');
      return { item: item.id, quantity: entry.quantity, unit, revision: entry.revision };
    });
    return { draft, key: newKey(), data: { location: place, category, lines,
      performedBy: draft.performedBy.trim() || defaultName, note: draft.note.trim() } };
  });
  const queue = [...requests];
  showForm({
    title: 'Xác nhận gửi phiếu',
    fields: `<p><strong>${esc(getLocation(place))} · ${requests.length} nhóm đã đếm</strong></p>
      <ul>${requests.map(({ data }) => `<li>${esc(data.category)} · ${data.lines.length} mặt hàng · ${esc(data.performedBy)}</li>`).join('')}</ul>
      <p>Các ô bỏ trống giữ nguyên số dư.</p>`,
    collect: () => queue,
    save: async ({ data: remaining }) => {
      while (remaining.length) {
        const { data, key, draft } = remaining[0];
        try {
          await api('count-sheets', { method: 'POST', data, key });
        } catch (error) {
          const sent = requests.length - remaining.length;
          if (sent || error.status === 409) await refresh().catch(() => {});
          throw Object.assign(new Error(`Đã gửi ${sent}/${requests.length} nhóm. Nhóm ${data.category}: ${error.message}`),
            { status: error.status });
        }
        clearSubmittedDraft(place, data.category, draft, data.lines);
        remaining.shift();
      }
    },
    submit: 'Gửi kiểm kê',
    success: `Đã gửi ${requests.length} phiếu và cập nhật tồn.`,
  });
}

function clearSubmittedDraft(place, category, draft, lines) {
  try {
    const current = readDraft(place, category);
    if (JSON.stringify(current) !== JSON.stringify(draft)) return;
    const key = draftKey(place, category);
    for (const line of lines) delete current.values[line.item];
    if (Object.keys(current.values).length) localStorage.setItem(key, JSON.stringify(current));
    else localStorage.removeItem(key);
  } catch { /* Storage may be unavailable. */ }
}

function priceForm(id) {
  const item = getItem(id);
  showForm({
    title: 'Đặt đơn giá USD',
    fields: `<p>${esc(item.name)} · giá cho 1 ${esc(unitLabel(item.base_unit))}</p>
      <label>Đơn giá USD<input name="cost" type="number" min="0" max="9999999.9999" step="0.0001" value="${esc(item.cost)}"></label>
      <p class="hint">Để trống nếu chưa có giá. Giá này dùng cho mặt hàng ở mọi địa điểm.</p>`,
    action: 'prices',
    collect: form => ({ item: id, cost: form.get('cost') || null }),
    success: 'Đã lưu đơn giá.',
  });
}

function countUnitForm(id) {
  showForm({
    title: 'Bổ sung đơn vị kiểm kê',
    fields: `<p>${esc(getItem(id).name)}</p><label>Đơn vị tồn kho<select name="unit" required>
      ${option('', 'Chọn đơn vị')}${Object.keys(units).map(unit => option(unit, unitLabel(unit))).join('')}</select></label>`,
    action: 'count-units',
    collect: form => ({ item: id, unit: form.get('unit') }),
  });
}

function countOrThreshold(kind, id) {
  const [place, itemId] = id.split('/');
  const item = getItem(itemId);
  const row = state.data.stock.find(row => row.location_id === place && row.item_id === itemId);
  const isCount = kind === 'count';
  showForm({
    title: isCount ? 'Ghi kiểm kê' : 'Đặt ngưỡng tồn thấp',
    fields: `<p><strong>${esc(item.name)}</strong> · ${esc(getLocation(place))}</p>
      <p class="hint">Đang có ${qtyText(row.on_hand, item)}. ${isCount ? 'Nhập tổng số thực tế sau khi đếm.' : 'Để trống để tắt cảnh báo.'}</p>
      ${quantityFields(item, isCount ? { label: 'Tổng số đếm được' } :
        { label: 'Ngưỡng', value: row.threshold ?? '', required: false })}
      ${isCount ? noteField() : ''}`,
    action: isCount ? 'counts' : 'thresholds',
    collect: form => ({ location: place, item: itemId, unit: form.get('unit'),
      quantity: form.get('quantity') === '' ? null : form.get('quantity'),
      ...(isCount ? { revision: row.revision, note: form.get('note').trim() } : {}) }),
    success: isCount ? 'Đã ghi kiểm kê.' : 'Đã cập nhật ngưỡng.',
  });
}

function systemThresholdForm(id) {
  const item = getItem(id);
  const locations = state.data.locations;
  const balances = new Map(state.data.stock.filter(row => row.item_id === id).map(row => [row.location_id, row]));
  const field = (name, label, value, maximum) => `<label>${esc(label)}
    <input name="${esc(name)}" type="number" inputmode="decimal" min="0" max="${maximum}"
      step="${item.base_unit === 'each' ? '1' : '.001'}" value="${esc(value ?? '')}"></label>`;
  showForm({
    title: 'Đặt ngưỡng tồn kho',
    fields: `<p><strong>${esc(item.name)}</strong> · ${esc(unitLabel(item.base_unit))}</p>
      <p class="hint">Cảnh báo khi tồn bằng hoặc thấp hơn ngưỡng. Để trống để tắt từng cảnh báo.</p>
      <section class="delivery-form-section">${field('total', 'Ngưỡng tổng toàn hệ thống', item.system_threshold, locations.length * 1e9)}
        <p class="hint">Cảnh báo tổng dựa trên số tồn đã ghi nhận. Địa điểm chưa có số tồn sẽ được bỏ qua.</p></section>
      <section class="delivery-form-section"><h3>Ngưỡng theo địa điểm</h3><div class="field-row">
      ${locations.map(place => field(place.id, place.name, balances.get(place.id)?.threshold, 1e9)).join('')}</div></section>`,
    action: 'system-thresholds',
    collect: data => ({ item: id, total: data.get('total') || null,
      locations: Object.fromEntries(locations.map(place => [place.id, data.get(place.id) || null])) }),
    success: 'Đã cập nhật ngưỡng tồn kho.',
  });
}

function accessibleLocations() {
  const { user, locations } = state.data;
  return user.role === 'manager' ? locations : locations.filter(place => place.id === user.location_id);
}

function deliveryForm() {
  showForm({
    title: 'Tạo đơn giao',
    fields: `<section class="delivery-form-section"><h3>Thông tin đơn giao</h3>
      <div class="field-row">${locationField('location', 'Nơi nhận', accessibleLocations(), state.location)}
      <label>Nhà cung cấp<input name="supplier" maxlength="150" required></label></div></section>
      <section class="delivery-form-section"><h3>Mặt hàng dự kiến</h3>
      ${itemCategories()}
      <div id="order-lines">${orderLine(false)}</div><div>${button('Thêm mặt hàng', 'add-line')}</div></section>
      <section class="delivery-form-section">${noteField()}</section>`,
    action: 'deliveries',
    collect: (data, form) => ({ location: data.get('location'), supplier: data.get('supplier'), note: data.get('note').trim(),
      lines: Array.from(form.querySelectorAll('.order-row'), row => {
        const value = name => row.querySelector('[name="' + name + '"]').value.trim();
        const unit = value('unit');
        const selection = row.querySelector('.new-order-item').hidden
          ? { item: value('item') }
          : { newItem: catalogValues(row) };
        return { ...selection, quantity: value('quantity'), unit };
      }) }),
    success: 'Đã tạo đơn giao.',
  });
}

function createItemForm() {
  showForm({
    title: 'Tạo mặt hàng mới',
    fields: `${itemCategories()}<section class="delivery-form-section" data-catalog-fields>${catalogFields()}
      <label>Nhà cung cấp (tùy chọn)<input name="supplier" maxlength="150"></label></section>
      <p class="hint">Mặt hàng có trong danh mục chung. Số tồn ban đầu để Chưa biết cho đến khi kiểm kê.</p>`,
    action: 'items',
    collect: (data, form) => ({ ...catalogValues(form), supplier: data.get('supplier').trim() }),
    success: 'Đã tạo mặt hàng mới.',
  });
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Không đọc được ảnh.'));
    reader.readAsDataURL(file);
  });
}

function receiptCountOption(place, item, earliest = '') {
  const count = state.data.stock.find(row => row.location_id === place && row.item_id === item.id)?.latest_count;
  if (!count || !count.counted || count.submitted_at < earliest) {
    return '<p class="hint">Chưa có phiếu kiểm kê phù hợp. Nếu lô hàng đã được đếm, hãy đợi gửi phiếu rồi làm mới trang.</p>';
  }
  return `<label>Hàng này đã được đếm chưa?<select name="countSheet">
    ${option('', 'Nhận bình thường · cộng tồn')}
    ${option(count.sheet_id, 'Đã tính trong phiếu ' + date(count.submitted_at) + ' · thực đếm ' +
      number(count.counted) + ' ' + unitLabel(item.base_unit))}</select></label>`;
}

function supplierReceiptForm(id) {
  const delivery = state.data.deliveries.find(ticket => ticket.lines.some(line => line.id === id));
  const line = delivery.lines.find(line => line.id === id);
  const item = getItem(line.item_id);
  showForm({
    title: 'Xác nhận nhận hàng',
    fields: `<p><strong>${esc(item.name)}</strong> · ${esc(delivery.supplier)}</p>
      <p class="hint">${esc(getLocation(delivery.location_id))} · Còn chờ ${qtyText(line.outstanding, item)}.</p>
      ${quantityFields(item, { label: 'Thực nhận lần này' })}
      ${state.data.user.role === 'manager' ? receiptCountOption(delivery.location_id, item) : ''}
      ${receiverField()}${photoField()}
      <p class="hint">Tùy chọn · JPG, PNG hoặc WebP · Tối đa 5 MB.</p>${noteField()}`,
    action: 'receipts',
    collect: async data => ({ line: id, quantity: data.get('quantity'), unit: data.get('unit'), note: data.get('note').trim(),
      countSheet: data.get('countSheet'), receiver: data.get('receiver').trim(), ...await receiptPhoto(data) }),
    submit: 'Xác nhận nhận hàng',
    success: 'Đã ghi nhận hàng.',
  });
}

function dispatchForm() {
  const places = accessibleLocations();
  const source = state.location || places[0].id;
  const items = state.data.items.filter(item => item.base_unit);
  showForm({
    title: 'Xuất chuyển kho',
    fields: `<div class="field-row">${locationField('source', 'Nơi gửi', places, source)}
      ${locationField('destination', 'Nơi nhận', state.data.locations.filter(place => place.id !== source))}</div>
      <fieldset><legend>Chọn nhiều mặt hàng</legend><div class="transfer-picker" data-list>${listControls('transfer-picker')}
      ${items.map(item => `<label class="check" data-list-row data-search="${esc(itemSearch(item))}">
        <input type="checkbox" data-pick-item value="${esc(item.id)}">${esc(item.name)}</label>`).join('')}</div>
      <button type="button" class="button" data-action="add-transfer-items" data-edit>Thêm mặt hàng đã chọn</button></fieldset>
      <div data-list>${listControls('transfer-selected', 'Tìm trong các mặt hàng đã thêm')}<div id="transfer-lines"></div></div>
      ${noteField()}`,
    action: 'transfers',
    collect: (data, form) => {
      const lines = [...form.querySelectorAll('[data-transfer-line]')].map(row => {
        const item = row.dataset.transferLine;
        const quantity = row.querySelector('[name="quantity"]').value.trim().replace(',', '.');
        if (!/^\d{1,10}(\.\d{1,3})?$/.test(quantity) || Number(quantity) === 0) {
          throw new Error('Nhập số lượng xuất hợp lệ cho ' + getItem(item).name + '.');
        }
        return { item, quantity, unit: row.querySelector('[name="unit"]').value };
      });
      if (!lines.length) throw new Error('Thêm ít nhất một mặt hàng vào phiếu chuyển.');
      if (form.querySelector('[data-pick-item]:checked')) throw new Error('Bấm Thêm mặt hàng đã chọn trước khi gửi phiếu.');
      return { source: data.get('source'), destination: data.get('destination'), lines, note: data.get('note').trim() };
    },
    submit: 'Xác nhận và trừ tồn',
    success: 'Đã xuất kho và ghi hàng đang vận chuyển.',
  });
}

function updateTransferAvailability() {
  const source = dialog.querySelector('[name="source"]')?.value;
  for (const row of dialog.querySelectorAll('[data-transfer-line]')) {
    const item = getItem(row.dataset.transferLine);
    const stock = state.data.stock.find(balance => balance.location_id === source && balance.item_id === item.id);
    row.querySelector('[data-available]').textContent = stock?.on_hand == null
      ? 'Tồn tại nơi gửi chưa biết.' : 'Có thể xuất ' + number(stock.on_hand) + ' ' + unitLabel(item.base_unit) + '.';
  }
}

function addTransferItems() {
  const container = dialog.querySelector('#transfer-lines');
  const selected = [...dialog.querySelectorAll('[data-pick-item]:checked')];
  if (!selected.length) throw new Error('Chọn mặt hàng muốn thêm.');
  for (const input of selected) {
    const item = getItem(input.value);
    container.insertAdjacentHTML('beforeend', `<section class="line" data-list-row data-transfer-line="${esc(item.id)}"
      data-search="${esc(itemSearch(item))}"><h3>${esc(item.name)}</h3><p class="hint" data-available></p>
      <div class="field-row"><label>Số lượng xuất<input name="quantity" type="text" inputmode="decimal" maxlength="16"></label>
      <label>Đơn vị<select name="unit">${unitOptions(item)}</select></label></div>
      <button class="button" type="button" data-action="remove-transfer-item" data-edit>Bỏ mặt hàng</button></section>`);
    input.checked = false;
    input.disabled = true;
  }
  updateTransferAvailability();
  container.closest('[data-list]').dispatchEvent(new Event('refresh-list'));
}

function transferReceiptForm(id) {
  const ticket = state.data.transfers.find(ticket => ticket.id === id);
  const item = getItem(ticket.item_id);
  showForm({
    title: 'Xác nhận thực nhận',
    fields: `<p><strong>${esc(item.name)}</strong> · ${esc(getLocation(ticket.source))} → ${esc(getLocation(ticket.destination))}</p>
      <p class="hint">Đang đi ${qtyText(ticket.in_transit, item)}.</p>
      ${quantityFields(item, { label: 'Thực nhận lần này' })}
      ${state.data.user.role === 'manager' ? receiptCountOption(ticket.destination, item, ticket.dispatched_at) : ''}
      ${receiverField()}
      <label class="check"><input name="final" type="checkbox"> Đóng phiếu sau lần nhận này</label>
      <p class="hint">Bỏ chọn nếu còn hàng trên đường. Khi đóng thiếu hoặc dư, nhập lý do vào ghi chú. Phiếu tự đóng khi nhận đủ.</p>
      ${noteField('Ghi chú hoặc lý do chênh lệch')}`,
    action: 'transfer-receipts',
    collect: data => ({ transfer: id, quantity: data.get('quantity'), unit: data.get('unit'),
      final: data.has('final'), countSheet: data.get('countSheet'), receiver: data.get('receiver').trim(), note: data.get('note').trim() }),
    submit: 'Xác nhận thực nhận',
    success: 'Đã xác nhận thực nhận.',
  });
}

async function showPhoto(id) {
  const photo = invoiceUrls.get(id)?.photo ?? await api('photos/' + id, { binary: true });
  if (!state.data || dialog.open) return;
  photoUrl = URL.createObjectURL(photo);
  dialog.innerHTML = `<h2 id="dialog-title">Ảnh chứng từ</h2><img alt="Ảnh hóa đơn hoặc phiếu giao hàng">
    <div class="actions">${button('Đóng', 'close')}</div>`;
  dialog.querySelector('img').src = photoUrl;
  dialog.showModal();
}

function observeInvoices() {
  const images = app.querySelectorAll('[data-invoice-thumb]');
  if (!images.length) return;
  invoiceObserver = new IntersectionObserver((entries, observer) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      loadInvoicePreview(entry.target);
    }
  });
  images.forEach(image => invoiceObserver.observe(image.parentElement));
}

async function loadInvoicePreview(button) {
  const image = button.querySelector('img');
  const label = button.querySelector('span');
  const id = image.dataset.invoiceThumb;
  try {
    const photo = await api('photos/' + id, { binary: true });
    if (!button.isConnected) return;
    const url = URL.createObjectURL(photo);
    invoiceUrls.set(id, { photo, url });
    image.src = url;
    image.hidden = false;
    label.hidden = true;
  } catch {
    label.textContent = 'Mở ảnh chứng từ';
  }
}

app.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.target;
  if (form.id === 'history-search') {
    state.historyQuery = form.elements.query.value.trim();
    state.history = { entries: [], next: null };
    listStates.delete('history');
    await refresh().catch(error => notify(error.message));
    return;
  }
  if (form.id !== 'login-form') return;
  const submit = form.querySelector('button');
  if (signingIn) return;
  signingIn = true;
  submit.disabled = true;
  formError(form, '');
  try {
    const data = Object.fromEntries(new FormData(form));
    if (native) data.native = true;
    const result = await api('login', { method: 'POST', data });
    state.token = result.token;
    if (native) {
      if (result.persistent) {
        try {
          await secureSession('internalSetItem', { token: result.token });
          state.persistent = true;
        } catch (error) {
          await api('logout', { method: 'POST' }).catch(() => {});
          state.token = null;
          throw error;
        }
      }
      await restoreNativeSession();
    } else {
      await refresh();
      if (state.token) sessionStorage.setItem(storageKey, state.token);
    }
  } catch (error) {
    formError(form, error.message);
    if (!form.isConnected) notify(error.message);
  } finally {
    signingIn = false;
    submit.disabled = false;
  }
});

app.addEventListener('change', async event => {
  if (event.target.id === 'location-filter') {
    state.location = event.target.value;
    state.category = state.page === 'counts' ? restoreCountGroup(countLocation()) : '';
    if (state.page === 'counts') rememberCountGroup();
    if (state.page === 'history' || state.page === 'report') {
      state.history = { entries: [], next: null };
      state.report = null;
      draw();
      await refresh().catch(error => notify(error.message));
    } else draw();
  }
  if (event.target.id === 'low-filter') {
    state.lowOnly = event.target.checked;
    draw();
    document.querySelector('#low-filter')?.focus();
  }
  if (event.target.id === 'count-category') {
    state.category = event.target.value;
    rememberCountGroup();
    draw();
    app.querySelector('#count-category')?.focus();
  }
  if (event.target.id === 'report-week' && event.target.value) {
    const day = new Date(event.target.value + 'T00:00:00Z');
    day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
    state.reportWeek = day.toISOString().slice(0, 10);
    await refresh().catch(error => notify(error.message));
  }
});

app.addEventListener('input', event => {
  const field = event.target;
  if (state.page !== 'counts' || !state.draft) return;
  if (field.id === 'count-performed') state.draft.performedBy = field.value;
  else if (field.id === 'count-note') state.draft.note = field.value;
  else if (field.matches('[data-count-unit]')) {
    const item = field.closest('.count-item').querySelector('[data-count-item]').dataset.countItem;
    if (state.draft.values[item]) state.draft.values[item].unit = field.value;
  } else if (field.dataset.countItem) {
    const item = field.dataset.countItem;
    const row = state.data.stock.find(row => row.location_id === countLocation() && row.item_id === item);
    const quantity = field.value.trim().replace(',', '.');
    const unit = field.closest('.count-item').querySelector('[data-count-unit]')?.value ?? getItem(item).base_unit;
    if (quantity) state.draft.values[item] = { quantity, unit, revision: row.revision };
    else delete state.draft.values[item];
    app.querySelector('[data-count-stale="' + CSS.escape(item) + '"]').hidden = true;
    updateCountView();
  } else return;
  try { localStorage.setItem(draftKey(), JSON.stringify(state.draft)); } catch { /* The active form still retains the values. */ }
  rememberCountGroup();
});

dialog.addEventListener('change', event => {
  const field = event.target;
  if (field.name === 'source') {
    const destination = dialog.querySelector('[name="destination"]');
    const selected = destination.value;
    destination.innerHTML = state.data.locations.filter(place => place.id !== field.value)
      .map(place => option(place.id, place.name, selected)).join('');
  }
  updateTransferAvailability();
});
dialog.addEventListener('input', event => {
  const field = event.target;
  if (field.matches('[name="newUnit"], [name="newCaseSize"]')) {
    updateCatalogUnits(field.closest('.new-order-item, [data-catalog-fields]'));
    return;
  }
  if (!field.matches('[data-order-search]')) return;
  const row = field.closest('.order-row');
  row.querySelector('[name="item"]').value = '';
  row.querySelector('[name="unit"]').innerHTML = option('', 'Chọn mặt hàng trước');
  field.setCustomValidity('Chọn một mặt hàng trong danh sách gợi ý.');
  showOrderMatches(field);
});
dialog.addEventListener('focusin', event => {
  dialog.querySelectorAll('.order-picker').forEach(picker => {
    if (!picker.contains(event.target)) closeOrderMatches(picker);
  });
});
dialog.addEventListener('click', event => {
  const field = event.target.closest('[data-order-search]');
  if (field && field.getAttribute('aria-expanded') === 'false') showOrderMatches(field);
  dialog.querySelectorAll('.order-picker').forEach(picker => {
    if (!picker.contains(event.target)) closeOrderMatches(picker);
  });
});
dialog.addEventListener('keydown', event => {
  const input = event.target;
  if (!input.matches('[data-order-search]') || event.isComposing) return;
  const picker = input.closest('.order-picker');
  const expanded = input.getAttribute('aria-expanded') === 'true';
  if (event.key === 'Escape' && expanded) {
    event.preventDefault();
    closeOrderMatches(picker);
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if (!expanded) showOrderMatches(input);
    const options = [...picker.querySelectorAll('[role="option"]')];
    if (!options.length) return;
    const current = options.findIndex(option => option.getAttribute('aria-selected') === 'true');
    const next = current < 0 ? (event.key === 'ArrowDown' ? 0 : options.length - 1)
      : Math.max(0, Math.min(options.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)));
    options[current]?.setAttribute('aria-selected', 'false');
    options[next].setAttribute('aria-selected', 'true');
    input.setAttribute('aria-activedescendant', options[next].id);
    options[next].scrollIntoView({ block: 'nearest' });
  } else if (event.key === 'Enter') {
    event.preventDefault();
    const match = expanded && picker.querySelector('[role="option"][aria-selected="true"], [role="option"]:only-child');
    if (match) chooseOrderItem(match.dataset.id, match);
  }
});
dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
dialog.addEventListener('close', () => {
  dialog.querySelectorAll('input[type="password"]').forEach(input => { input.value = ''; });
  if (photoUrl) URL.revokeObjectURL(photoUrl);
  photoUrl = null;
});

const actions = {
  'restore-session': restoreNativeSession,
  'staff-password': staffPasswordForm,
  page: async id => {
    state.page = id;
    if (id === 'counts' && !state.category) state.category = restoreCountGroup(countLocation());
    if (id === 'history') state.history = { entries: [], next: null };
    draw();
    if (id === 'history' || id === 'report') await refresh();
  },
  refresh,
  'more-history': async () => {
    const location = state.location;
    const cursor = state.history.next;
    const query = state.historyQuery;
    const next = await loadHistory(cursor);
    if (state.page !== 'history' || state.location !== location || state.history.next !== cursor || state.historyQuery !== query) return;
    state.history = { entries: [...state.history.entries, ...next.entries], next: next.next };
    draw();
  },
  'low-stock': () => { state.lowOnly = true; draw(); },
  'all-stock': () => { state.lowOnly = false; draw(); },
  logout: async () => {
    if (native && state.persistent) {
      if (restoring) return;
      busy = true;
      try {
        await secureSession('internalSetItem', { token: state.token, logout: true });
        state.pendingLogout = true;
        await restoreNativeSession();
      } finally {
        busy = false;
      }
      return;
    }
    await api('logout', { method: 'POST' });
    await clearSession();
  },
  count: id => countOrThreshold('count', id),
  threshold: id => countOrThreshold('threshold', id),
  'system-threshold': systemThresholdForm,
  'submit-count': submitCount,
  price: priceForm,
  'count-unit': countUnitForm,
  'create-item': createItemForm,
  delivery: deliveryForm,
  receipt: supplierReceiptForm,
  'receive-delivery-all': id => fullReceiptForm('delivery', id),
  'receive-transfer-all': id => fullReceiptForm('transfer', id),
  dispatch: dispatchForm,
  'add-transfer-items': addTransferItems,
  'remove-transfer-item': (_, target) => {
    const row = target.closest('[data-transfer-line]');
    const list = row.closest('[data-list]');
    dialog.querySelector('[data-pick-item][value="' + CSS.escape(row.dataset.transferLine) + '"]').disabled = false;
    row.remove();
    list.dispatchEvent(new Event('refresh-list'));
  },
  'transfer-receipt': transferReceiptForm,
  photo: showPhoto,
  close: () => dialog.close(),
  'add-line': () => dialog.querySelector('#order-lines').insertAdjacentHTML('beforeend', orderLine(true)),
  'choose-order-item': chooseOrderItem,
  'toggle-new-item': toggleNewOrderItem,
  'remove-line': (_, target) => target.closest('.order-row').remove(),
};

document.addEventListener('click', async event => {
  const target = event.target.closest('[data-action]');
  if (!target || busy) return;
  const action = actions[target.dataset.action];
  if (!action) return;
  try {
    await action(target.dataset.id, target);
  } catch (error) {
    notify(error.message);
  }
});

if (native) {
  const resume = () => {
    if (!signingIn && !busy && document.visibilityState === 'visible' && (state.token || state.sessionMessage)) void restoreNativeSession();
  };
  window.addEventListener('online', resume);
  document.addEventListener('visibilitychange', resume);
  void restoreNativeSession();
} else if (state.token) refresh().catch(error => { draw(); notify(error.message); });
else draw();
