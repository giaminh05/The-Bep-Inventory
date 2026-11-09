import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { locations, maxStock, openDatabase, passwordHash, scale, transaction } from '../server/db.mjs';

const sourceId = '17HM8yPfOMDpZdvSe46a8_9M3kJlKwurJVfe1eAatucg';
const locationTabs = ['Duluth', 'JC', 'NC storage', 'House DL', 'Extra storage'];
const aliases = new Map(Object.entries({
  bags: 'bag', cases: 'case', pieces: 'each', piece: 'each', units: 'each', unit: 'each',
  bottles: 'bottle', jars: 'jar', boxes: 'box', packs: 'pack', cans: 'can', rolls: 'roll', cups: 'cup',
  containers: 'container',
}));
const clean = value => String(value ?? '').trim();
const unit = value => aliases.get(clean(value).toLowerCase()) ?? clean(value).toLowerCase();

function readRows(tabs, name, columns) {
  const rows = tabs[name];
  if (!Array.isArray(rows) || !columns.every((column, index) => rows[0]?.[index] === column)) {
    throw new Error('Unexpected columns in ' + name);
  }
  return rows.slice(1).filter(row => row.some(value => clean(value)));
}

function conversion(base, pack) {
  const units = base ? { [base]: 1 } : {};
  const equation = /^1 (.+?) = (\d+) (.+)$/i.exec(pack);
  const perPack = /^(\d+) (.+?)\/(.+)$/i.exec(pack);
  const from = unit(equation?.[1] ?? perPack?.[3]);
  const to = unit(equation?.[3] ?? perPack?.[2]);
  const factor = Number(equation?.[2] ?? perPack?.[1]);
  if (base && to === base && from && from !== base && Number.isSafeInteger(factor) && factor > 0) units[from] = factor;
  return units;
}

function readOpening(input) {
  const { source, capturedAt, tabs } = input;
  if (source !== sourceId || !Number.isFinite(Date.parse(capturedAt))) throw new Error('Invalid Google Sheets snapshot.');
  const catalog = new Map();
  for (const [rawId, sku, name, category, countUnit, , supplier, reference] of readRows(tabs, 'Catalog',
    ['Internal ID', 'SKU', 'Item', 'Category', 'Count unit', 'Total min', 'Suppliers', 'Reference pack'])) {
    const id = clean(rawId);
    const base = unit(countUnit);
    const pack = clean(reference);
    if (!/^INV\d+$/.test(id) || catalog.has(id) || !clean(name) || !clean(category) || !clean(supplier)) {
      throw new Error('Incomplete or duplicate catalog entry ' + id);
    }
    catalog.set(id, { id, sku: /^N\/A$/i.test(clean(sku)) ? null : clean(sku) || null, name: clean(name),
      category: clean(category), base, units: conversion(base, pack), supplier: clean(supplier), pack });
  }
  const stock = locationTabs.flatMap((tab, index) => {
    const seen = new Set();
    const rows = readRows(tabs, tab, ['Item ID', 'Category', 'Item', 'Unit', 'On Hand']).map(row => {
      const [rawId, , , countUnit, raw] = row;
      const item = catalog.get(clean(rawId));
      if (!item || seen.has(item.id) || unit(countUnit) !== item.base) {
        throw new Error('Unknown item, duplicate or mismatched unit in ' + tab + ': ' + rawId);
      }
      seen.add(item.id);
      const unknown = !clean(raw) || clean(raw).toUpperCase() === 'NOT COUNTED';
      const amount = typeof raw === 'number' ? Math.round(raw * scale) : null;
      if (!unknown && (amount === null || !item.base || amount < 0 || amount > maxStock ||
        Math.abs(raw * scale - amount) > 0.000001 || (item.base === 'each' && amount % scale))) {
        throw new Error('Invalid opening balance in ' + tab + ': ' + item.id);
      }
      return [locations[index][0], item.id, unknown ? null : amount];
    });
    if (seen.size !== catalog.size) throw new Error('Missing catalog entries in ' + tab);
    return rows;
  });
  return { catalog, stock, capturedAt: new Date(capturedAt).toISOString() };
}

const [sourceFile = 'data/sheet-opening.json', databaseFile = 'data/inventory.sqlite', loginsFile = 'data/inventory-logins.json'] = process.argv.slice(2);
const opening = readOpening(JSON.parse(readFileSync(sourceFile, 'utf8')));
if (new Set([sourceFile, databaseFile, loginsFile].map(path => resolve(path).toLowerCase())).size !== 3 ||
  existsSync(databaseFile) || existsSync(loginsFile)) throw new Error('Choose new database and login files. Import is one-time.');
const accounts = [['manager', 'Quản lý', 'manager', null], ...locations.map(([id, name]) => [id, 'Nhân viên ' + name, 'staff', id])];
const logins = Object.fromEntries(accounts.map(([id]) => [id, randomBytes(18).toString('base64url')]));
const db = openDatabase(databaseFile);
try {
  transaction(db, () => {
    const addLocation = db.prepare('INSERT INTO locations VALUES (?, ?, ?)');
    const addItem = db.prepare('INSERT INTO items (id, sku, name, category, base_unit, units, supplier, pack) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    const addStock = db.prepare('INSERT INTO stock (location_id, item_id, on_hand, known) VALUES (?, ?, ?, ?)');
    const addOpening = db.prepare('INSERT INTO opening_balances VALUES (?, ?, ?, ?)');
    const addUser = db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?)');
    for (const location of locations) addLocation.run(...location);
    for (const item of opening.catalog.values()) {
      addItem.run(item.id, item.sku, item.name, item.category, item.base, JSON.stringify(item.units), item.supplier, item.pack);
    }
    for (const [location, item, amount] of opening.stock) {
      addStock.run(location, item, amount ?? 0, Number(amount !== null));
      if (amount !== null) addOpening.run(location, item, amount, opening.capturedAt);
    }
    for (const account of accounts) addUser.run(...account, passwordHash(logins[account[0]]));
    writeFileSync(loginsFile, JSON.stringify(logins, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  });
} finally {
  db.close();
}
const unknown = opening.stock.filter(row => row[2] === null).length;
console.log(JSON.stringify({ items: opening.catalog.size, locations: locations.length, openingBalances: opening.stock.length - unknown,
  unknown, missingUnits: [...opening.catalog.values()].filter(item => !item.base).length }, null, 2));
