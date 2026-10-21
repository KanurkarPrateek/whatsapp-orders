import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

process.env.DB_FILE = join(mkdtempSync(join(tmpdir(), "orders-")), "test.db");
const db = await import("../db.js");
const { handleMessage, parseItems, statusMessage } = await import("../bot.js");

const jid = "919800000001@s.whatsapp.net";
const say = (text) => handleMessage({ jid, phone: "919800000001", name: "Asha", text });

test("parses item lists", () => {
  assert.deepEqual(parseItems("1, 3x2 5"), [{ n: 1, qty: 1 }, { n: 3, qty: 2 }, { n: 5, qty: 1 }]);
  assert.deepEqual(parseItems("3 x 2"), [{ n: 3, qty: 2 }]);
  assert.equal(parseItems("hello"), null);
});

test("full order: menu -> cart -> yes -> pickup", () => {
  const menu = say("hi").replies[0];
  assert.match(menu, /1\. Paneer Tikka — ₹220/);
  const cart = say("1, 7x2").replies[0];
  assert.match(cart, /Total: ₹/);
  assert.match(say("yes").replies[0], /Pickup/);
  const done = say("1");
  assert.ok(done.order, "order created");
  assert.equal(done.order.type, "pickup");
  assert.equal(done.order.items.length, 2);
  assert.equal(db.getChat(jid).cart.length, 0);
  assert.match(say("status").replies[0], new RegExp(`#${done.order.id}`));
  const updated = db.setOrderStatus(done.order.id, "ready");
  assert.match(statusMessage(updated), /ready for pickup/);
});

test("delivery with address", () => {
  say("2");
  say("yes");
  const r = say("Flat 4, MG Road, Pune");
  assert.equal(r.order.type, "delivery");
  assert.equal(r.order.address, "Flat 4, MG Road, Pune");
});

test("bad numbers, cancel and closed", () => {
  assert.match(say("99").replies[0], /no item 99/);
  say("1");
  assert.match(say("cancel").replies[0], /Cart cleared/);
  db.saveSettings({ open: "0" });
  assert.match(say("hi").replies[0], /closed/);
  db.saveSettings({ open: "1" });
});
