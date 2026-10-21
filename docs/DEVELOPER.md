# Developer Guide

How the code works, for anyone changing it.

---

## 1. Overview

```
 Customer phones                 Restaurant phone (WhatsApp, linked by QR)
       │  WhatsApp messages              │
       ▼                                 ▼
 ┌──────────────────────── Node process (server.js) ─────────────────────────┐
 │  whatsapp.js  ── Baileys socket: QR, connection, receive/send            │
 │      │ incoming text                                                      │
 │      ▼                                                                    │
 │  bot.js       ── conversation logic (pure): text in → replies (+ order)  │
 │      │                                                                    │
 │      ▼                                                                    │
 │  db.js        ── SQLite (node:sqlite): menu, orders, chats, settings     │
 │      ▲                                                                    │
 │  server.js    ── Express: PIN login, REST API, Server-Sent Events,       │
 │                  static dashboard (public/)                              │
 └───────────────────────────────────────────────────────────────────────────┘
       ▲ HTTP + SSE
 Dashboard in a browser (public/index.html + app.js + style.css)
```

One process, one SQLite file, no build step. ES modules throughout (`"type": "module"`).

| File | Responsibility |
|---|---|
| `server.js` | Express app, PIN sessions, API routes, SSE broadcast, starts WhatsApp |
| `whatsapp.js` | Baileys connection, QR → data URL, reconnects, message filtering, test-number gate, calls the bot, sends replies |
| `bot.js` | The chat state machine and message texts. No WhatsApp or HTTP code, so it's easy to test |
| `db.js` | Schema, sample menu, all queries |
| `public/` | Dashboard: plain HTML/CSS/JS, no framework |
| `test/bot.test.js` | `node:test` conversation tests on a temp DB |

Dependencies: `@whiskeysockets/baileys` 6.7.24 (WhatsApp Web protocol, no browser needed), `express` 5, `qrcode`, `pino`.

---

## 2. WhatsApp connection (`whatsapp.js`)

- `useMultiFileAuthState(AUTH_DIR)` stores the login as JSON files in `auth/`.
- `connection.update`:
  - `qr` → converted to a PNG data URL, state `qr`.
  - `open` → state `connected`, number taken from `sock.user.id`.
  - `close` → if `loggedOut` (unlinked from the phone) delete `auth/`. In every case reconnect after 3 s, which shows a fresh QR when there is no login. Code `515` right after scanning is normal (WhatsApp asks for a restart).
- State `{ state, qr, number }` is exported as `wa` and every change is emitted on `events` (`"status"`), which `server.js` forwards to dashboards.

### Incoming messages

`messages.upsert` with `type === "notify"` only (skips history synced on connect). A message is handled when:

1. It's not `fromMe`, and the chat id ends in `@s.whatsapp.net` or `@lid` (one-to-one). Groups (`@g.us`), status, channels are ignored.
2. It has text: `conversation`, `extendedTextMessage.text` or an image caption (also unwrapped from disappearing/view-once messages).
3. If **Test numbers** is set, the sender matches one of them (digit suffix match against the phone number, or the chat id).

**Phone numbers and LIDs.** Newer WhatsApp accounts appear as `<id>@lid` instead of `<phone>@s.whatsapp.net`. Replies always go to `remoteJid` as received (works for both). The phone number shown on orders comes from the jid, or from `msg.key.senderPn` for `@lid` chats.

Each reply is sent with `sock.sendMessage(jid, { text })`. When the bot returns an order, `events.emit("order", order)` triggers the dashboard "ding".

---

## 3. Conversation state machine (`bot.js`)

`handleMessage({ jid, phone, name, text })` → `{ replies: string[], order? }`

Per-customer state lives in the `chats` table: `step` and `cart` (`[{ id, qty }]`, menu item ids).

```
        hi / menu / anything (empty cart)
idle ─────────────────────────────────────► (menu sent) idle
  │ item numbers "1, 3x2"
  ▼
cart ──── more numbers ───► cart (quantities add up, max 50)
  │ yes / ok / confirm / done
  ▼
address ── "1"/pickup ───────────────► order(pickup)   → idle, cart emptied
        ── "2"/delivery ─► ask address
        ── text ≥ 8 chars ────────────► order(delivery) → idle, cart emptied
        ── other ─► repeat the question

cancel (any step) → idle, cart emptied
status (any step, even when closed) → open orders
restaurant closed → "we're closed" for everything except status
```

Order of checks inside `handleMessage` matters: `status` → closed → `cancel` → menu words → `cart` → **address step** → yes-words → item numbers → fallback. The address step comes before item parsing so that `1` means "pickup" there, not "item 1".

**Item numbers** are positions in `db.numberedMenu()` (available items only, categories in first-added order). The cart stores item **ids**, so the price and name are looked up fresh when the cart is shown and when the order is created. Items made unavailable mid-order are dropped from the cart.

`parseItems(text)` accepts `1`, `1,3`, `1 3`, `3x2`, `3 x 2`, `3×2`, `3*2`; returns `null` if any token isn't of that form (so normal sentences fall through to the fallback).

`statusMessage(order)` returns the WhatsApp text for a status change (or `null` for `new`).

---

## 4. Data model (`db.js`)

```sql
menu_items (id, name, price INTEGER rupees, category, available 0/1, sort)
orders     (id, jid, phone, name, items JSON, total, type pickup|delivery,
            address, status, created_at, updated_at)   -- times in UTC
chats      (jid PK, step idle|cart|address, cart JSON, updated_at)
settings   (key PK, value)
```

- `orders.items` is a snapshot: `[{ id, name, price, qty }]` at the time of ordering, so later menu edits don't change past orders.
- `orders.status`: `new → preparing → ready → done`, or `rejected`.
- Settings keys and defaults: `restaurant_name` "Spice Hut", `open` "1", `welcome` "Welcome! 👋", `test_numbers` "". Unknown keys are ignored by `saveSettings`.
- `listOrders()` = open orders + anything created in the last 24 h.
- WAL mode is on.

---

## 5. HTTP API (`server.js`)

All `/api/*` routes except `POST /api/login` need the `session` cookie.

| Method & path | Body | Returns |
|---|---|---|
| `POST /api/login` | `{ pin }` | `{ ok }` + `Set-Cookie: session=…` (HttpOnly, SameSite=Strict, 30 days). `401` on wrong PIN |
| `POST /api/logout` | none | `{ ok }` |
| `GET /api/whatsapp` | none | `{ state: "starting"\|"qr"\|"connected", qr: dataURL\|null, number }` |
| `POST /api/whatsapp/unlink` | none | `{ ok }`: logs out of WhatsApp and deletes `auth/` |
| `GET /api/orders` | none | Orders (open + last 24 h), newest first |
| `POST /api/orders/:id/status` | `{ status }` one of `new, preparing, ready, done, rejected` | `{ order, notified }`: `notified=false` if the WhatsApp message failed |
| `GET /api/menu` | none | All items, in customer order |
| `POST /api/menu` | `{ name, price, category? }` | The new item. `400` if name empty / price invalid |
| `PUT /api/menu/:id` | any of `{ name, price, category, available }` | The updated item |
| `DELETE /api/menu/:id` | none | `{ ok }` |
| `GET /api/settings` | none | Settings object |
| `PUT /api/settings` | any of the setting keys | Updated settings |
| `GET /api/events` | none | Server-Sent Events stream (below) |

**SSE events** (`/api/events`):

| Event | Data | When |
|---|---|---|
| `status` | WhatsApp state | On connect and every state change |
| `new-order` | order | Customer placed an order (dashboard dings) |
| `order` | order | Status changed from a dashboard |

A comment ping is sent every 25 s to keep proxies from closing the stream. The dashboard reloads `/api/orders` whenever the stream (re)opens, so it catches up after a server restart.

**Sessions** are random tokens kept in memory, so a restart logs everyone out. The PIN check uses `timingSafeEqual`.

---

## 6. Dashboard (`public/`)

- `index.html`: login form + four tab sections.
- `app.js`: `api()` fetch helper (shows login on 401), renders the order board from an in-memory `orders` array, menu table with save-on-change, settings form, SSE listeners, Web Audio "ding".
- All customer-supplied text (names, addresses, item names) is HTML-escaped with `esc()` before rendering.
- `style.css`: light/dark via `prefers-color-scheme`; board is 4 columns → 2 (≤1000px) → 1 (≤600px); the menu table turns into stacked rows on phones. `[hidden] { display: none !important }` is required because some sections set `display`.

---

## 7. Tests

`npm test` runs `node --test test/*.test.js`. The test sets `DB_FILE` to a temp file **before** importing `db.js`, then drives `handleMessage` directly:

- item parsing
- full pickup order + status message
- delivery with address
- unknown item numbers, cancel, closed restaurant

Add a test here for any change to the conversation.

---

## 8. Decisions and things we tried

| Topic | Decision | Why |
|---|---|---|
| WhatsApp library | Baileys (WebSocket) over whatsapp-web.js (Puppeteer) | No Chrome, low memory, same version already proven in the gym-management sender |
| Menu selection | Typed numbers | **Tap buttons / list messages** (`interactiveMessage` + `nativeFlowMessage`, with the `biz` node) were tried on 2026-10-21: WhatsApp accepted them but the phone showed **nothing**. Buttons only render for the official Business API. **Polls** (with a "How many?" poll for quantities) were built next and then removed at the owner's request in favour of the simpler text flow |
| Storage | `node:sqlite` | Zero setup, one file, no native module to compile |
| Live updates | Server-Sent Events | One-way server→browser is all that's needed; simpler than WebSockets |
| Frontend | Plain JS | Small app, no build step |

## 9. Ideas for later

- Tap-to-order **web menu page**: the bot sends a link, the customer taps items in a browser, the order lands in the same chat.
- UPI payment link in the order confirmation.
- Opening hours (auto open/close).
- Several restaurants on one server (add `restaurant_id` and one Baileys socket per restaurant, as in the gym sender).
- Persist dashboard sessions so restarts don't log staff out.
- Order history / daily sales report and CSV export.
