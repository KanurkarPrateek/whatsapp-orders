// SQLite storage (built into Node, one file, no setup).
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.env.DB_FILE || new URL("./data.db", import.meta.url).pathname);
db.exec("PRAGMA journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS menu_items (
    id        INTEGER PRIMARY KEY,
    name      TEXT NOT NULL,
    price     INTEGER NOT NULL,          -- whole rupees
    category  TEXT NOT NULL DEFAULT 'Menu',
    available INTEGER NOT NULL DEFAULT 1,
    sort      INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS orders (
    id         INTEGER PRIMARY KEY,
    jid        TEXT NOT NULL,            -- WhatsApp chat id we reply to
    phone      TEXT,
    name       TEXT,
    items      TEXT NOT NULL,            -- JSON [{id,name,price,qty}]
    total      INTEGER NOT NULL,
    type       TEXT NOT NULL,            -- pickup | delivery
    address    TEXT,
    status     TEXT NOT NULL DEFAULT 'new', -- new | preparing | ready | done | rejected
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS chats (
    jid        TEXT PRIMARY KEY,
    step       TEXT NOT NULL DEFAULT 'idle', -- idle | cart | address
    cart       TEXT NOT NULL DEFAULT '[]',   -- JSON [{id,qty}]
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// ---------- settings ----------
const DEFAULT_SETTINGS = {
  restaurant_name: "Spice Hut",
  open: "1",
  welcome: "Welcome! 👋",
  // Comma-separated numbers. When set, the bot ONLY replies to these numbers
  // (safe testing on a number other people also message).
  test_numbers: "",
};

export function getSettings() {
  const out = { ...DEFAULT_SETTINGS };
  for (const row of db.prepare("SELECT key, value FROM settings").all()) out[row.key] = row.value;
  return out;
}

export function saveSettings(values) {
  const stmt = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  );
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (values[key] !== undefined) stmt.run(key, String(values[key]));
  }
  return getSettings();
}

// ---------- menu ----------
// Categories appear in the order they were first added; items by when added.
const MENU_ORDER = `ORDER BY (SELECT MIN(id) FROM menu_items m WHERE m.category = menu_items.category), sort, id`;

export function listMenu() {
  return db.prepare(`SELECT * FROM menu_items ${MENU_ORDER}`).all();
}

// Available items in the order shown to customers; item N is index N-1.
export function numberedMenu() {
  return db.prepare(`SELECT * FROM menu_items WHERE available = 1 ${MENU_ORDER}`).all();
}

export function getMenuItem(id) {
  return db.prepare("SELECT * FROM menu_items WHERE id = ?").get(id);
}

export function addMenuItem({ name, price, category, available = 1 }) {
  const { lastInsertRowid } = db
    .prepare("INSERT INTO menu_items (name, price, category, available) VALUES (?, ?, ?, ?)")
    .run(name, price, category || "Menu", available ? 1 : 0);
  return getMenuItem(lastInsertRowid);
}

export function updateMenuItem(id, { name, price, category, available }) {
  const item = getMenuItem(id);
  if (!item) return null;
  db.prepare("UPDATE menu_items SET name = ?, price = ?, category = ?, available = ? WHERE id = ?").run(
    name ?? item.name,
    price ?? item.price,
    category ?? item.category,
    available === undefined ? item.available : available ? 1 : 0,
    id,
  );
  return getMenuItem(id);
}

export function deleteMenuItem(id) {
  return db.prepare("DELETE FROM menu_items WHERE id = ?").run(id).changes > 0;
}

// Sample menu on first run.
if (db.prepare("SELECT COUNT(*) AS n FROM menu_items").get().n === 0) {
  const sample = [
    ["Paneer Tikka", 220, "Starters"],
    ["Veg Manchurian", 180, "Starters"],
    ["Butter Chicken", 320, "Mains"],
    ["Dal Makhani", 240, "Mains"],
    ["Butter Naan", 50, "Breads"],
    ["Jeera Rice", 140, "Breads"],
    ["Masala Chai", 40, "Drinks"],
    ["Sweet Lassi", 80, "Drinks"],
  ];
  for (const [name, price, category] of sample) addMenuItem({ name, price, category });
}

// ---------- chats (where each customer is in the conversation) ----------
export function getChat(jid) {
  const row = db.prepare("SELECT * FROM chats WHERE jid = ?").get(jid);
  return row ? { ...row, cart: JSON.parse(row.cart) } : { jid, step: "idle", cart: [] };
}

export function saveChat({ jid, step, cart }) {
  db.prepare(
    `INSERT INTO chats (jid, step, cart, updated_at) VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(jid) DO UPDATE SET step = excluded.step, cart = excluded.cart, updated_at = excluded.updated_at`,
  ).run(jid, step, JSON.stringify(cart));
}

// ---------- orders ----------
function parseOrder(row) {
  return row ? { ...row, items: JSON.parse(row.items) } : null;
}

export function createOrder({ jid, phone, name, items, total, type, address }) {
  const { lastInsertRowid } = db
    .prepare("INSERT INTO orders (jid, phone, name, items, total, type, address) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(jid, phone, name, JSON.stringify(items), total, type, address ?? null);
  return getOrder(lastInsertRowid);
}

export function getOrder(id) {
  return parseOrder(db.prepare("SELECT * FROM orders WHERE id = ?").get(id));
}

// Open orders, plus finished ones from the last 24 hours.
export function listOrders() {
  return db
    .prepare(
      `SELECT * FROM orders
       WHERE status IN ('new','preparing','ready') OR created_at >= datetime('now','-1 day')
       ORDER BY id DESC`,
    )
    .all()
    .map(parseOrder);
}

export function openOrdersFor(jid) {
  return db
    .prepare("SELECT * FROM orders WHERE jid = ? AND status IN ('new','preparing','ready') ORDER BY id")
    .all(jid)
    .map(parseOrder);
}

export function setOrderStatus(id, status) {
  db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
  return getOrder(id);
}

export default db;
