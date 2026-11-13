import { createHash, randomUUID } from 'node:crypto';
import { maxStock, passwordHash, scale, transaction, verifyPassword } from './db.mjs';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const now = () => new Date().toISOString();
const show = value => value / scale;
export const digest = value => createHash('sha256').update(value).digest('hex');

function required(value, label, limit = 150) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > limit) {
    throw new HttpError(400, label + ' không hợp lệ.');
  }
  return value.trim();
}

function note(value) {
  return value === undefined || value === '' ? null : required(value, 'Ghi chú', 500);
}

function canAccess(user, location) {
  return user.role === 'manager' || user.location_id === location;
}

function allow(user, location) {
  if (!canAccess(user, location)) throw new HttpError(403, 'Bạn không có quyền tại địa điểm này.');
}

function mustFind(row, label) {
  if (!row) throw new HttpError(404, 'Không tìm thấy ' + label + '.');
  return row;
}

function stockRow(db, location, item) {
  return mustFind(db.prepare(`
    SELECT stock.*, items.base_unit, items.units FROM stock JOIN items ON items.id = stock.item_id
    WHERE location_id = ? AND item_id = ?
  `).get(required(location, 'Địa điểm'), required(item, 'Mặt hàng')), 'tồn kho');
}

const catalogUnits = new Set(['each', 'bag', 'case', 'bottle', 'jar', 'box', 'can', 'pack', 'container', 'roll', 'cup', 'large bag']);

function addCatalogItem(db, item, supplier, receivingLocation = null) {
  const name = required(item?.name, 'Tên mặt hàng');
  const category = required(item.category, 'Danh mục');
  const sku = item.sku === undefined || item.sku === '' ? null : required(item.sku, 'SKU', 80);
  const unit = item.unit;
  if (!catalogUnits.has(unit)) throw new HttpError(400, 'Chọn đơn vị tồn kho hợp lệ.');
  const units = { [unit]: 1 };
  if (item.caseSize !== undefined && item.caseSize !== '') {
    const size = typeof item.caseSize === 'number' || typeof item.caseSize === 'string' ? String(item.caseSize) : '';
    if (unit === 'case' || !/^\d{1,10}$/.test(size) || Number(size) < 1 || Number(size) > maxStock / scale) {
      throw new HttpError(400, 'Nhập số đơn vị gốc nguyên dương trong một thùng và chọn đơn vị gốc khác thùng.');
    }
    units.case = Number(size);
  }
  if (sku && db.prepare('SELECT 1 FROM items WHERE sku = ? COLLATE NOCASE').get(sku)) {
    throw new HttpError(409, 'SKU đã có trong danh mục. Hãy chọn mặt hàng hiện có.');
  }
  if (db.prepare(`
    SELECT 1 FROM items WHERE name = ? COLLATE NOCASE AND category = ? COLLATE NOCASE
      AND base_unit = ? AND (sku IS NULL OR sku = '' OR ? IS NULL)
  `).get(name, category, unit, sku)) {
    throw new HttpError(409, 'Mặt hàng này đã có trong danh mục. Hãy chọn mặt hàng hiện có hoặc nhập SKU riêng.');
  }
  const id = randomUUID();
  db.prepare('INSERT INTO items (id, sku, name, category, base_unit, units, supplier) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, sku, name, category, unit, JSON.stringify(units), supplier);
  db.prepare('INSERT INTO stock (location_id, item_id, on_hand, known) SELECT id, ?, 0, id IS ? FROM locations')
    .run(id, receivingLocation);
  return id;
}

function quantity(stock, input, unit, zero = false, maximum = maxStock) {
  const text = typeof input === 'number' || typeof input === 'string' ? String(input) : '';
  const units = JSON.parse(stock.units);
  if (!/^\d{1,10}(\.\d{1,3})?$/.test(text) || typeof unit !== 'string' || !Object.hasOwn(units, unit)) {
    throw new HttpError(400, 'Nhập số lượng hợp lệ và chọn đơn vị của mặt hàng.');
  }
  const [whole, fraction = ''] = text.split('.');
  const amount = (Number(whole) * scale + Number(fraction.padEnd(3, '0'))) * units[unit];
  if ((!zero && !amount) || amount > maximum || (stock.base_unit === 'each' && amount % scale)) {
    throw new HttpError(400, 'Số lượng ngoài phạm vi hoặc không quy đổi thành số cái nguyên.');
  }
  return amount;
}

function move(db, stock, user, type, delta, reference, memo, timestamp, known = stock.known) {
  const balance = stock.on_hand + delta;
  if (balance < 0) throw new HttpError(409, 'Tồn kho không đủ để xuất.');
  if (balance > maxStock) throw new HttpError(409, 'Vượt giới hạn tồn kho.');
  db.prepare('UPDATE stock SET on_hand = ?, known = ?, revision = revision + 1 WHERE location_id = ? AND item_id = ?')
    .run(balance, known, stock.location_id, stock.item_id);
  db.prepare(`
    INSERT INTO movements (location_id, item_id, type, delta, balance, actor, reference, note, created_at, balance_known, delta_known)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(stock.location_id, stock.item_id, type, delta, balance, user.id, reference, memo, timestamp, known,
    type === 'count' || type === 'sheet_count' ? stock.known : 1);
  return known ? show(balance) : null;
}

function managerOnly(user) {
  if (user.role !== 'manager') throw new HttpError(403, 'Chỉ quản lý được thực hiện thao tác này.');
}

function latestCount(db, location, item) {
  return db.prepare(`
    SELECT count_lines.*, count_sheets.submitted_at FROM count_lines JOIN count_sheets ON count_sheets.id = sheet_id
    WHERE count_sheets.location_id = ? AND count_lines.item_id = ?
      AND movement_id = (SELECT MAX(id) FROM movements WHERE location_id = ? AND item_id = ? AND type IN ('count','sheet_count'))
  `).get(location, item, location, item);
}

function postReceipt(db, stock, user, type, actual, id, memo, timestamp, countSheet, earliest = '') {
  if (!countSheet) return actual ? move(db, stock, user, type, actual, id, memo, timestamp) :
    stock.known ? show(stock.on_hand) : null;
  const count = latestCount(db, stock.location_id, stock.item_id);
  if (!actual || !count || count.sheet_id !== countSheet || count.submitted_at < earliest) {
    throw new HttpError(409, 'Chọn phiếu kiểm kê đã gửi gần nhất cho đúng mặt hàng và địa điểm.');
  }
  const { used } = db.prepare('SELECT COALESCE(SUM(quantity), 0) AS used FROM counted_receipts WHERE count_movement_id = ?')
    .get(count.movement_id);
  if (used + actual > count.counted) throw new HttpError(409, 'Số hàng liên kết vượt số đã đếm trên phiếu.');
  const onHand = move(db, stock, user, type, 0, id, memo, timestamp);
  db.prepare('INSERT INTO counted_receipts VALUES (last_insert_rowid(), ?, ?)').run(count.movement_id, actual);
  return onHand;
}

export function photoBytes(photo) {
  if (!photo) return [null, null];
  const match = typeof photo === 'string' && /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(photo);
  if (!match) throw new HttpError(400, 'Chọn ảnh JPG, PNG hoặc WebP.');
  const [, format, encoded] = match;
  const bytes = Buffer.from(encoded, 'base64');
  const valid = {
    jpeg: () => bytes.subarray(0, 3).toString('hex') === 'ffd8ff',
    png: () => bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a',
    webp: () => bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP',
  };
  if (bytes.length > 5 * 1024 * 1024 || !valid[format]()) {
    throw new HttpError(400, 'Ảnh không hợp lệ hoặc vượt quá 5 MB.');
  }
  return ['image/' + format, bytes];
}

function allowReceiving(user, destination, createdByManager, countSheet) {
  allow(user, destination);
  if (user.role !== 'manager' && (!createdByManager || countSheet)) managerOnly(user);
}

function receiveDeliveryLine(db, user, line, actual, receiver, memo, timestamp, photo, countSheet) {
  const stock = stockRow(db, line.location_id, line.item_id);
  const received = line.received + actual;
  if (received > line.expected) throw new HttpError(409, 'Thực nhận vượt số lượng còn chờ giao.');
  const id = randomUUID();
  db.prepare(`
    INSERT INTO receipts (id, line_id, quantity, note, created_at, actor, photo_type, photo, receiver)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, line.id, actual, memo, timestamp, user.id, ...photo, receiver);
  db.prepare('UPDATE delivery_lines SET received = ? WHERE id = ?').run(received, line.id);
  const onHand = postReceipt(db, stock, user, 'supplier_receipt', actual, id, memo, timestamp, countSheet);
  return { id, received: show(received), outstanding: show(line.expected - received), onHand };
}

function checkRemaining(expected, rows, amount) {
  const remaining = new Map(rows.map(row => [row.id, show(amount(row))]));
  if (!remaining.size || !Array.isArray(expected) || expected.length !== remaining.size) {
    throw new HttpError(409, 'Số hàng còn chờ đã thay đổi. Mở lại phiếu để kiểm tra.');
  }
  for (const line of expected) {
    if (!remaining.has(line?.id) || remaining.get(line.id) !== line.outstanding) {
      throw new HttpError(409, 'Số hàng còn chờ đã thay đổi. Mở lại phiếu để kiểm tra.');
    }
    remaining.delete(line.id);
  }
}

function receiveTransferLine(db, user, transfer, actual, final, receiver, memo, timestamp, countSheet) {
  const stock = stockRow(db, transfer.destination, transfer.item_id);
  const received = transfer.received + actual;
  const remaining = transfer.sent - received;
  if (remaining < 0 && !final) throw new HttpError(409, 'Đóng phiếu để ghi nhận hàng nhận dư.');
  const closed = final || remaining === 0;
  const discrepancy = closed ? -remaining : 0;
  if (discrepancy && !memo) throw new HttpError(400, 'Nhập lý do chênh lệch trước khi đóng phiếu.');
  const id = randomUUID();
  db.prepare(`
    INSERT INTO transfer_receipts (id, transfer_id, quantity, discrepancy, final, note, created_at, actor, receiver)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, transfer.id, actual, discrepancy, Number(closed), memo, timestamp, user.id, receiver);
  db.prepare('UPDATE transfers SET received = ?, shortage = ?, closed_at = ? WHERE id = ?')
    .run(received, closed ? Math.max(0, remaining) : 0, closed ? timestamp : null, transfer.id);
  const onHand = postReceipt(db, stock, user, 'transfer_in', actual, id, memo, timestamp, countSheet, transfer.dispatched_at);
  return { id, received: show(received), inTransit: closed ? 0 : show(remaining), discrepancy: show(discrepancy), onHand };
}

const actions = {
  'staff-passwords'(db, user, input) {
    const account = mustFind(db.prepare("SELECT id, password FROM users WHERE id = ? AND role = 'staff'")
      .get(required(input.account, 'Tài khoản')), 'tài khoản nhân viên');
    if (verifyPassword(input.password, account.password)) {
      throw new HttpError(400, 'Mật khẩu mới phải khác mật khẩu hiện tại.');
    }
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(passwordHash(input.password), account.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(account.id);
    return { ok: true };
  },

  counts(db, user, input) {
    managerOnly(user);
    allow(user, input.location);
    const stock = stockRow(db, input.location, input.item);
    if (input.revision !== stock.revision) {
      throw new HttpError(409, 'Tồn vừa thay đổi. Tải lại số dư và kiểm lại trước khi lưu.');
    }
    const counted = quantity(stock, input.quantity, input.unit, true);
    const delta = counted - stock.on_hand;
    return { onHand: move(db, stock, user, 'count', delta, null, note(input.note), now(), 1), delta: stock.known ? show(delta) : null };
  },

  'count-sheets'(db, user, input) {
    allow(user, input.location);
    const category = required(input.category, 'Nhóm hàng');
    if (!Array.isArray(input.lines) || !input.lines.length || input.lines.length > 1000 ||
      new Set(input.lines.map(line => line?.item)).size !== input.lines.length) {
      throw new HttpError(400, 'Nhập số đếm cho ít nhất một mặt hàng và không lặp dòng.');
    }
    const readCategory = db.prepare('SELECT category FROM items WHERE id = ?');
    const lines = input.lines.map(line => {
      const stock = stockRow(db, input.location, line?.item);
      if (readCategory.get(line.item).category !== category) throw new HttpError(400, 'Mặt hàng không thuộc nhóm này.');
      if (line.revision !== stock.revision) throw new HttpError(409, 'Tồn vừa thay đổi cho ' + line.item + '. Hãy kiểm lại dòng này.');
      return [stock, quantity(stock, line.quantity, line.unit === undefined ? stock.base_unit : line.unit, true)];
    });
    const id = randomUUID();
    const timestamp = now();
    const memo = note(input.note);
    db.prepare('INSERT INTO count_sheets VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      id, input.location, category, user.id, required(input.performedBy, 'Người kiểm kê'), memo, timestamp);
    const addLine = db.prepare('INSERT INTO count_lines VALUES (?, ?, ?, ?, last_insert_rowid())');
    for (const [stock, counted] of lines) {
      move(db, stock, user, 'sheet_count', counted - stock.on_hand, id, memo, timestamp, 1);
      addLine.run(id, stock.item_id, stock.known ? stock.on_hand : null, counted);
    }
    return { id, counted: lines.length };
  },

  prices(db, user, input) {
    managerOnly(user);
    const id = required(input.item, 'Mặt hàng');
    const item = mustFind(db.prepare('SELECT base_unit FROM items WHERE id = ?').get(id), 'mặt hàng');
    if (!item.base_unit) throw new HttpError(409, 'Mặt hàng chưa có đơn vị tồn kho.');
    const value = input.cost === null ? null : String(input.cost);
    if (value !== null && !/^\d{1,7}(\.\d{1,4})?$/.test(value)) throw new HttpError(400, 'Nhập đơn giá USD hợp lệ.');
    const cost = value === null ? null : Math.round(Number(value) * 10000);
    db.prepare('UPDATE items SET cost_usd = ? WHERE id = ?').run(cost, id);
    return { cost: cost === null ? null : cost / 10000 };
  },

  'count-units'(db, user, input) {
    managerOnly(user);
    const id = required(input.item, 'Mặt hàng');
    const unit = required(input.unit, 'Đơn vị', 25);
    if (!/^[a-z]+(?: [a-z]+)?$/.test(unit)) throw new HttpError(400, 'Đơn vị không hợp lệ.');
    const updated = db.prepare("UPDATE items SET base_unit = ?, units = ? WHERE id = ? AND base_unit = ''")
      .run(unit, JSON.stringify({ [unit]: 1 }), id);
    if (!updated.changes) throw new HttpError(409, 'Mặt hàng đã có đơn vị hoặc không tồn tại.');
    return { unit };
  },

  thresholds(db, user, input) {
    if (user.role !== 'manager') throw new HttpError(403, 'Chỉ quản lý được đặt ngưỡng.');
    const stock = stockRow(db, input.location, input.item);
    const threshold = input.quantity === null ? null : quantity(stock, input.quantity, input.unit, true);
    db.prepare('UPDATE stock SET threshold = ? WHERE location_id = ? AND item_id = ?')
      .run(threshold, stock.location_id, stock.item_id);
    return { threshold: threshold === null ? null : show(threshold), low: Boolean(stock.known && threshold !== null && stock.on_hand <= threshold) };
  },

  'system-thresholds'(db, user, input) {
    managerOnly(user);
    const id = required(input.item, 'Mặt hàng');
    const item = mustFind(db.prepare('SELECT base_unit, units FROM items WHERE id = ?').get(id), 'mặt hàng');
    if (!item.base_unit) throw new HttpError(409, 'Mặt hàng chưa có đơn vị tồn kho.');
    const locations = db.prepare('SELECT id FROM locations').all();
    const thresholds = input.locations;
    if (!thresholds || typeof thresholds !== 'object' || Array.isArray(thresholds) ||
      Object.keys(thresholds).length !== locations.length || locations.some(place => !Object.hasOwn(thresholds, place.id))) {
      throw new HttpError(400, 'Nhập ngưỡng hoặc để trống cho từng địa điểm.');
    }
    const total = input.total === null ? null : quantity(item, input.total, item.base_unit, true, maxStock * locations.length);
    const update = db.prepare('UPDATE stock SET threshold = ? WHERE item_id = ? AND location_id = ?');
    for (const place of locations) {
      const value = thresholds[place.id];
      const threshold = value === null ? null : quantity(item, value, item.base_unit, true);
      if (!update.run(threshold, id, place.id).changes) throw new HttpError(409, 'Mặt hàng chưa có dòng tồn tại địa điểm này.');
    }
    db.prepare('UPDATE items SET system_threshold = ? WHERE id = ?').run(total, id);
    return { ok: true };
  },

  items(db, user, input) {
    managerOnly(user);
    const supplier = input.supplier === undefined || input.supplier === '' ? '' : required(input.supplier, 'Nhà cung cấp');
    return { id: addCatalogItem(db, input, supplier) };
  },

  deliveries(db, user, input) {
    managerOnly(user);
    const location = required(input.location, 'Nơi nhận');
    mustFind(db.prepare('SELECT id FROM locations WHERE id = ?').get(location), 'nơi nhận');
    const supplier = required(input.supplier, 'Nhà cung cấp');
    if (!Array.isArray(input.lines) || !input.lines.length || input.lines.length > 50) {
      throw new HttpError(400, 'Đơn giao cần từ 1 đến 50 mặt hàng.');
    }
    const id = randomUUID();
    const lines = input.lines.map(line => {
      if (line?.item && line.newItem !== undefined) throw new HttpError(400, 'Chỉ chọn một mặt hàng cho mỗi dòng.');
      const item = line?.newItem === undefined ? line?.item : addCatalogItem(db, line.newItem, supplier, location);
      const stock = stockRow(db, location, item);
      return [randomUUID(), id, stock.item_id, quantity(stock, line.quantity, line.unit)];
    });
    if (new Set(lines.map(line => line[2])).size !== lines.length) {
      throw new HttpError(400, 'Mỗi mặt hàng chỉ xuất hiện một lần trong đơn giao.');
    }
    db.prepare('INSERT INTO deliveries VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, location, supplier, note(input.note), now(), user.id);
    const add = db.prepare('INSERT INTO delivery_lines (id, delivery_id, item_id, expected) VALUES (?, ?, ?, ?)');
    for (const line of lines) add.run(...line);
    return { id, lineIds: lines.map(line => line[0]) };
  },

  receipts(db, user, input) {
    const line = mustFind(db.prepare(`
      SELECT delivery_lines.*, deliveries.location_id, users.role = 'manager' AS manager_created
      FROM delivery_lines JOIN deliveries ON deliveries.id = delivery_id
      JOIN users ON users.id = deliveries.actor WHERE delivery_lines.id = ?
    `).get(required(input.line, 'Dòng hàng')), 'dòng hàng');
    allowReceiving(user, line.location_id, line.manager_created, input.countSheet);
    const stock = stockRow(db, line.location_id, line.item_id);
    const actual = quantity(stock, input.quantity, input.unit);
    return receiveDeliveryLine(db, user, line, actual, required(input.receiver, 'Tên người nhận'),
      note(input.note), now(), photoBytes(input.photo), input.countSheet);
  },

  'delivery-receipts-all'(db, user, input) {
    const delivery = mustFind(db.prepare(`
      SELECT deliveries.*, users.role = 'manager' AS manager_created
      FROM deliveries JOIN users ON users.id = deliveries.actor WHERE deliveries.id = ?
    `).get(required(input.delivery, 'Đơn giao')), 'đơn giao');
    allowReceiving(user, delivery.location_id, delivery.manager_created);
    const receiver = required(input.receiver, 'Tên người nhận');
    const lines = db.prepare('SELECT * FROM delivery_lines WHERE delivery_id = ? AND expected > received ORDER BY rowid')
      .all(delivery.id);
    checkRemaining(input.lines, lines, row => row.expected - row.received);
    const photo = photoBytes(input.photo);
    const timestamp = now();
    const memo = note(input.note);
    return { receipts: lines.map((line, index) => receiveDeliveryLine(db, user, { ...line, location_id: delivery.location_id },
      line.expected - line.received, receiver, memo, timestamp, index ? [null, null] : photo)) };
  },

  transfers(db, user, input) {
    allow(user, input.source);
    if (input.source === input.destination) throw new HttpError(400, 'Chọn hai địa điểm khác nhau.');
    const batch = input.lines !== undefined;
    const lines = batch ? input.lines : [input];
    if (!Array.isArray(lines) || !lines.length || lines.length > 150 ||
      new Set(lines.map(line => line?.item)).size !== lines.length) {
      throw new HttpError(400, 'Chọn từ 1 đến 150 mặt hàng, mỗi mặt hàng một dòng.');
    }
    const batchId = batch ? randomUUID() : null;
    const timestamp = now();
    const memo = note(input.note);
    const insert = db.prepare(`
      INSERT INTO transfers (id, source, destination, item_id, sent, dispatched_at, note, actor, batch_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const posted = lines.map(line => {
      const source = stockRow(db, input.source, line?.item);
      if (!source.known) throw new HttpError(409, 'Chưa biết tồn tại nơi gửi cho ' + source.item_id + '.');
      stockRow(db, input.destination, line.item);
      const sent = quantity(source, line.quantity, line.unit);
      if (sent > source.on_hand) throw new HttpError(409, 'Tồn kho không đủ để xuất ' + source.item_id + '.');
      const id = randomUUID();
      insert.run(id, input.source, input.destination, source.item_id, sent, timestamp, memo, user.id, batchId);
      return { id, inTransit: show(sent), onHand: move(db, source, user, 'transfer_out', -sent, id, memo, timestamp) };
    });
    return batch ? { id: batchId, lines: posted } : posted[0];
  },

  'transfer-receipts'(db, user, input) {
    const transfer = mustFind(db.prepare(`
      SELECT transfers.*, users.role = 'manager' AS manager_created
      FROM transfers JOIN users ON users.id = transfers.actor WHERE transfers.id = ?
    `)
      .get(required(input.transfer, 'Phiếu chuyển')), 'phiếu chuyển');
    allowReceiving(user, transfer.destination, transfer.manager_created, input.countSheet);
    if (transfer.closed_at) throw new HttpError(409, 'Phiếu chuyển đã đóng.');
    if (typeof input.final !== 'boolean') throw new HttpError(400, 'Chọn có đóng phiếu chuyển hay không.');
    const stock = stockRow(db, transfer.destination, transfer.item_id);
    const actual = quantity(stock, input.quantity, input.unit, input.final);
    return receiveTransferLine(db, user, transfer, actual, input.final, required(input.receiver, 'Tên người nhận'),
      note(input.note), now(), input.countSheet);
  },

  'transfer-receipts-all'(db, user, input) {
    const id = required(input.transfer, 'Phiếu chuyển');
    const group = db.prepare(`
      SELECT transfers.*, users.role = 'manager' AS manager_created FROM transfers
      JOIN users ON users.id = transfers.actor WHERE COALESCE(batch_id, transfers.id) = ? ORDER BY transfers.rowid
    `).all(id);
    const first = mustFind(group[0], 'phiếu chuyển');
    allowReceiving(user, first.destination, first.manager_created);
    const receiver = required(input.receiver, 'Tên người nhận');
    const open = group.filter(row => !row.closed_at);
    checkRemaining(input.lines, open, row => row.sent - row.received);
    const timestamp = now();
    const memo = note(input.note);
    return { receipts: open.map(row => receiveTransferLine(db, user, row, row.sent - row.received, true, receiver, memo, timestamp)) };
  },
};

export function applyAction(db, user, action, key, input, managerId = null) {
  if (!Object.hasOwn(actions, action)) throw new HttpError(404, 'Không tìm thấy thao tác.');
  if (typeof key !== 'string' || !/^[A-Za-z0-9-]{16,100}$/.test(key)) {
    throw new HttpError(400, 'Thiếu mã chống lưu trùng hợp lệ.');
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'Dữ liệu không hợp lệ.');
  const resetsPassword = action === 'staff-passwords';
  if (resetsPassword) {
    managerOnly(user);
    if (typeof input.password !== 'string' || input.password.trim().length < 12 || input.password.length > 256) {
      throw new HttpError(400, 'Mật khẩu mới phải có từ 12 đến 256 ký tự.');
    }
  }
  const payload = (managerId === null ? '' : JSON.stringify(managerId) + '\n') + action + '\n' + JSON.stringify(input);
  const fingerprint = resetsPassword ? null : digest(payload);
  return transaction(db, () => {
    const previous = db.prepare('SELECT fingerprint, result FROM requests WHERE actor = ? AND key = ?').get(user.id, key);
    if (previous) {
      const matches = resetsPassword
        ? previous.fingerprint.includes(':') && verifyPassword(payload, previous.fingerprint)
        : previous.fingerprint === fingerprint;
      if (!matches) throw new HttpError(409, 'Mã lưu đã được dùng cho dữ liệu khác.');
      return JSON.parse(previous.result);
    }
    const result = actions[action](db, user, input);
    db.prepare('INSERT INTO requests VALUES (?, ?, ?, ?)').run(user.id, key, fingerprint ?? passwordHash(payload), JSON.stringify(result));
    if (managerId !== null) {
      db.prepare('INSERT INTO delegated_actions VALUES (?, ?, ?, ?, ?)').run(managerId, user.id, key, action, now());
    }
    return result;
  });
}

export function readPhoto(db, user, id) {
  const receipt = mustFind(db.prepare(`
    SELECT receipts.photo_type, receipts.photo, deliveries.location_id, users.role = 'manager' AS manager_created
    FROM receipts JOIN delivery_lines ON delivery_lines.id = line_id
    JOIN deliveries ON deliveries.id = delivery_id JOIN users ON users.id = deliveries.actor WHERE receipts.id = ?
  `).get(id), 'ảnh');
  allowReceiving(user, receipt.location_id, receipt.manager_created);
  if (!receipt.photo) throw new HttpError(404, 'Lần nhận này chưa có ảnh.');
  return receipt;
}

export function readHistory(db, user, location, before, query = '') {
  managerOnly(user);
  if (location) allow(user, location);
  const scope = location || (user.role === 'manager' ? null : user.location_id);
  const cursor = before === null ? Number.MAX_SAFE_INTEGER : Number(before);
  if (!Number.isSafeInteger(cursor) || cursor < 1) throw new HttpError(400, 'Mốc lịch sử không hợp lệ.');
  const rows = db.prepare(`
    SELECT movements.*, users.name AS actor_name
    FROM movements JOIN users ON users.id = movements.actor JOIN items ON items.id = movements.item_id
    JOIN locations ON locations.id = movements.location_id
    WHERE movements.id < ? AND (? IS NULL OR movements.location_id = ?)
      AND instr(search_text(items.name || ' ' || items.id || ' ' || COALESCE(items.sku, '') || ' ' ||
        locations.name || ' ' || users.name || ' ' || COALESCE(movements.note, '')), search_text(?)) > 0
    ORDER BY movements.id DESC LIMIT 51
  `).all(cursor, scope, scope, query.slice(0, 150));
  const lookup = db.prepare('SELECT quantity, count_movement_id FROM counted_receipts WHERE movement_id = ?');
  const entries = rows.slice(0, 50).map(row => {
    const counted = lookup.get(row.id);
    return { ...row, delta: row.delta_known ? show(row.delta) : null, balance: row.balance_known ? show(row.balance) : null,
      already_counted: counted ? show(counted.quantity) : null };
  });
  return { entries, next: rows.length > 50 ? entries.at(-1).id : null };
}

const atlantaDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York',
  year: 'numeric', month: '2-digit', day: '2-digit' });

function shiftDay(date, days) {
  const value = new Date(date + 'T00:00:00Z');
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function weekOf(timestamp) {
  const date = atlantaDate.format(new Date(timestamp));
  const weekday = new Date(date + 'T00:00:00Z').getUTCDay();
  return shiftDay(date, -((weekday + 6) % 7));
}

export function readReport(db, user, location, selectedWeek) {
  managerOnly(user);
  if (location) mustFind(db.prepare('SELECT id FROM locations WHERE id = ?').get(location), 'địa điểm');
  const week = selectedWeek || weekOf(now());
  const date = new Date(week + 'T00:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week) || !Number.isFinite(+date) || date.toISOString().slice(0, 10) !== week ||
    date.getUTCDay() !== 1 || date.getUTCFullYear() < 2000) throw new HttpError(400, 'Chọn ngày thứ Hai của tuần.');
  const counts = db.prepare(`
    SELECT count_lines.*, count_sheets.location_id, submitted_at
    FROM count_lines JOIN count_sheets ON count_sheets.id = sheet_id
    WHERE (? IS NULL OR count_sheets.location_id = ?) AND submitted_at >= ? AND submitted_at < ?
    ORDER BY movement_id
  `).all(location, location, week + 'T00:00:00Z', shiftDay(week, 8) + 'T00:00:00Z');
  const ends = new Map();
  const countKey = (locationId, itemId) => JSON.stringify([locationId, itemId]);
  for (const count of counts) {
    if (weekOf(count.submitted_at) === week) ends.set(countKey(count.location_id, count.item_id), count);
  }
  const previousCount = db.prepare(`
    SELECT count_lines.counted, movements.id AS movement_id, count_sheets.submitted_at
    FROM movements JOIN count_lines ON count_lines.movement_id = movements.id
    JOIN count_sheets ON count_sheets.id = count_lines.sheet_id
    WHERE movements.location_id = ? AND movements.item_id = ? AND movements.id < ?
    ORDER BY movements.id DESC LIMIT 1
  `);
  const totals = db.prepare(`
    SELECT type, SUM(COALESCE(counted_receipts.quantity, ABS(delta))) AS amount
    FROM movements LEFT JOIN counted_receipts ON counted_receipts.movement_id = movements.id
    WHERE location_id = ? AND item_id = ? AND type IN ('supplier_receipt','transfer_in','transfer_out')
      AND COALESCE(count_movement_id, movements.id) > ? AND COALESCE(count_movement_id, movements.id) <= ?
    GROUP BY type
  `);
  const openings = db.prepare('SELECT balance, imported_at FROM opening_balances WHERE location_id = ? AND item_id = ?');
  const rows = db.prepare(`
    SELECT stock.*, items.cost_usd FROM stock JOIN items ON items.id = item_id
    WHERE (? IS NULL OR location_id = ?) ORDER BY location_id, items.category, items.name
  `).all(location, location).map(row => {
    const end = ends.get(countKey(row.location_id, row.item_id));
    const start = end && previousCount.get(row.location_id, row.item_id, end.movement_id);
    const imported = end && !start && openings.get(row.location_id, row.item_id);
    const opening = imported && imported.imported_at <= end.submitted_at ? imported : null;
    const beginning = start?.counted ?? opening?.balance ?? null;
    const movements = end && beginning !== null
      ? Object.fromEntries(totals.all(row.location_id, row.item_id, start?.movement_id ?? 0, end.movement_id)
        .map(record => [record.type, record.amount])) : {};
    const { supplier_receipt: purchases = 0, transfer_in: incoming = 0, transfer_out: outgoing = 0 } = movements;
    return { location_id: row.location_id, item_id: row.item_id, beginning: beginning === null ? null : show(beginning),
      ending: end ? show(end.counted) : null, opening: Boolean(opening),
      beginningAt: start?.submitted_at ?? opening?.imported_at ?? null, endingAt: end?.submitted_at ?? null,
      usage: end && beginning !== null ? show(beginning + purchases + incoming - outgoing - end.counted) : null,
      purchases: show(purchases), incoming: show(incoming), outgoing: show(outgoing),
      onHand: row.known ? show(row.on_hand) : null,
      value: row.known && row.cost_usd !== null ? show(row.on_hand) * row.cost_usd / 10000 : null };
  });
  return { week, rows };
}

export function snapshot(db, user) {
  const scope = user.role === 'manager' ? null : user.location_id;
  const locations = db.prepare('SELECT * FROM locations ORDER BY rowid').all();
  const systemLow = new Set(user.role === 'manager' ? db.prepare(`
    SELECT stock.item_id FROM stock JOIN items ON items.id = stock.item_id
    WHERE items.system_threshold IS NOT NULL GROUP BY stock.item_id
    HAVING SUM(CASE WHEN stock.known = 1 THEN stock.on_hand END) <= items.system_threshold
  `).all().map(row => row.item_id) : []);
  const items = db.prepare('SELECT * FROM items ORDER BY rowid').all().map(({ cost_usd, system_threshold, ...item }) => ({
    ...item, sku: item.sku ?? '', units: JSON.parse(item.units),
    ...(user.role === 'manager' && { cost: cost_usd === null ? null : cost_usd / 10000,
      system_threshold: system_threshold === null ? null : show(system_threshold), system_low: systemLow.has(item.id) }),
  }));
  const stock = db.prepare('SELECT * FROM stock WHERE ? IS NULL OR location_id = ?').all(scope, scope)
    .map(row => {
      const count = user.role === 'manager' && latestCount(db, row.location_id, row.item_id);
      return { ...row, on_hand: row.known ? show(row.on_hand) : null, threshold: row.threshold === null ? null : show(row.threshold),
        low: Boolean(row.known && row.threshold !== null && row.on_hand <= row.threshold),
        latest_count: count ? { sheet_id: count.sheet_id, counted: show(count.counted), submitted_at: count.submitted_at } : null };
    });
  const deliveries = db.prepare(`
    SELECT deliveries.*, users.role = 'manager' AS manager_created FROM deliveries JOIN users ON users.id = deliveries.actor
    WHERE ? IS NULL OR (deliveries.location_id = ? AND users.role = 'manager') ORDER BY deliveries.rowid DESC
  `)
    .all(scope, scope);
  const lines = db.prepare('SELECT * FROM delivery_lines WHERE delivery_id = ? ORDER BY rowid');
  const receipts = db.prepare(`
    SELECT receipts.id, quantity, note, receiver, created_at, users.name AS actor_name, photo IS NOT NULL AS has_photo
    FROM receipts JOIN users ON users.id = receipts.actor WHERE line_id = ? ORDER BY receipts.rowid DESC
  `);
  for (const delivery of deliveries) {
    delivery.lines = lines.all(delivery.id).map(line => ({
      ...line, expected: show(line.expected), received: show(line.received), outstanding: show(line.expected - line.received),
      receipts: receipts.all(line.id).map(row => ({ ...row, quantity: show(row.quantity) })),
    }));
  }
  const transferReceipts = db.prepare(`
    SELECT transfer_receipts.*, users.name AS actor_name
    FROM transfer_receipts JOIN users ON users.id = transfer_receipts.actor
    WHERE transfer_id = ? ORDER BY transfer_receipts.rowid DESC
  `);
  const transfers = db.prepare(`
    SELECT transfers.*, users.role = 'manager' AS manager_created FROM transfers JOIN users ON users.id = transfers.actor
    WHERE ? IS NULL OR source = ? OR destination = ? ORDER BY transfers.rowid DESC
  `)
    .all(scope, scope, scope).map(row => ({
      ...row, sent: show(row.sent), received: show(row.received), shortage: show(row.shortage),
      in_transit: row.closed_at ? 0 : show(row.sent - row.received),
      discrepancy: row.closed_at ? show(row.received - row.sent) : 0,
      receipts: transferReceipts.all(row.id).map(receipt => ({
        ...receipt, quantity: show(receipt.quantity), discrepancy: show(receipt.discrepancy),
      })),
    }));
  const counts = db.prepare(`
    SELECT count_sheets.*, users.name AS actor_name FROM count_sheets JOIN users ON users.id = actor
    WHERE (? IS NULL OR count_sheets.location_id = ?) ORDER BY count_sheets.rowid DESC LIMIT 30
  `).all(scope, scope);
  const countLines = db.prepare('SELECT item_id, before, counted FROM count_lines WHERE sheet_id = ? ORDER BY rowid');
  for (const count of counts) {
    count.lines = countLines.all(count.id).map(line => ({
      ...line, before: line.before === null ? null : show(line.before), counted: show(line.counted),
    }));
  }
  const accounts = user.role === 'manager' ? db.prepare(`
    SELECT id, name, location_id FROM users WHERE role = 'staff' ORDER BY location_id, id
  `).all() : null;
  return { user, locations, items, stock, deliveries, transfers, counts, ...(accounts && { accounts }) };
}
