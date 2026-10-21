# WhatsApp Orders — Plan

A tiny app for one restaurant. Customers order by chatting on WhatsApp. Orders show up live on a web dashboard. The restaurant's WhatsApp number is linked by scanning a QR code (same as WhatsApp Web).

---

## 1. How it works (big picture)

```
Customer's WhatsApp  ──►  Restaurant's WhatsApp number
                                │  (linked by QR, like WhatsApp Web)
                                ▼
                        Our small server (Node)
                          • reads messages, replies with menu / cart
                          • saves orders
                                │
                                ▼
                     Web dashboard (browser)
                       • scan QR to connect
                       • see orders live, change status
                       • edit menu
```

One server, one process, one small database file. Nothing else to run.

---

## 2. Customer flow (on WhatsApp)

1. Customer sends anything ("hi").
   Bot replies with the menu, numbered:
   ```
   🍽️ Spice Hut — Menu
   STARTERS
    1. Paneer Tikka — ₹220
    2. Veg Manchurian — ₹180
   MAINS
    3. Butter Chicken — ₹320
    4. Dal Makhani — ₹240
   DRINKS
    5. Masala Chai — ₹40

   Reply with item numbers, e.g.  1, 3x2, 5
   ```
2. Customer replies `1, 3x2, 5`.
   Bot shows the cart and total:
   ```
   🛒 Your order
   1 × Paneer Tikka ......... ₹220
   2 × Butter Chicken ....... ₹640
   1 × Masala Chai .......... ₹40
   Total: ₹900

   Reply YES to place it, add more numbers, or CANCEL.
   ```
3. Customer replies `YES`.
   Bot asks one question: **"Pickup or delivery? For delivery, send your address."**
4. Customer answers → order is placed.
   Bot: `✅ Order #12 placed. We'll message you when it's ready.`
5. As the restaurant updates the order, the customer gets a message:
   - Accepted → "👨‍🍳 Order #12 is being prepared"
   - Ready → "🛍️ Order #12 is ready" (pickup) / "🛵 Out for delivery"
   - Rejected → "Sorry, we can't take order #12 right now"

Simple commands any time: `MENU`, `CART`, `CANCEL`, `STATUS`.
If the restaurant is marked **Closed**, the bot replies "We're closed now" instead of the menu.

### Why numbers instead of tap buttons
WhatsApp's tap buttons and pick-lists only work through the paid, official WhatsApp Business API. With the QR / WhatsApp Web method they are often not delivered. Numbered replies work on every phone.

**Optional extra (phase 2):** the bot also sends a link to a small menu page. The customer taps items there, presses "Order", and the order lands in the same WhatsApp chat. This gives a "tap to select" feel without the paid API.

---

## 3. Restaurant dashboard (web)

Login with a simple PIN.

**Pages:**
1. **Connect** — shows the QR code. Restaurant opens WhatsApp on the phone → Linked devices → scan. Shows "Connected as +91…" after that. Login is saved, so no rescan after restart.
2. **Orders** (main screen) — live board with 4 columns:
   `New` → `Preparing` → `Ready / Out for delivery` → `Done`
   Each card: order #, customer name + number, items, total, pickup/delivery address, time.
   Buttons: Accept, Reject, Mark ready, Mark done. Each sends the matching WhatsApp message to the customer.
   New orders appear instantly with a sound.
3. **Menu** — add / edit / delete items: name, price, category, available on/off (hide sold-out items).
4. **Settings** — restaurant name, Open/Closed switch, welcome message.

---

## 4. Tech choices (kept minimal)

| Part | Choice | Why |
|---|---|---|
| WhatsApp link | **Baileys** library | Connects by QR like WhatsApp Web, no Chrome needed, light. Already used in your gym worker. |
| Server | Node + Express | Simple. |
| Database | SQLite (built into Node 25) | One file, no setup. |
| Dashboard | Plain HTML + a bit of JS, live updates over Server-Sent Events | No build step. |

### Data (3 tables)
- **menu_items**: id, number, name, price, category, available
- **orders**: id, customer_phone, customer_name, items (list), total, type (pickup/delivery), address, status, created_at
- **chats**: customer_phone, step (browsing / confirming / asking address), cart — remembers where each customer is in the chat

### Folder layout
```
whatsapp-orders/
  server.js        # Express + routes + live updates
  whatsapp.js      # Baileys connect, QR, send/receive
  bot.js           # the chat flow (menu → cart → confirm → address)
  db.js            # SQLite tables
  public/          # dashboard pages (connect, orders, menu, settings)
  auth/            # saved WhatsApp login (gitignored)
  data.db          # database (gitignored)
```

Run: `npm install && npm start` → open http://localhost:3000

---

## 5. Build steps

1. Server + database + menu page (seed a sample menu).
2. WhatsApp connect page with QR; saved login.
3. Chat bot: menu → cart → confirm → pickup/delivery → order saved.
4. Orders board with live updates, status buttons, WhatsApp status messages.
5. Settings (open/closed, name, PIN).
6. Test end-to-end with your own second number only.
7. (Phase 2) Tap-to-select menu web page; deploy (e.g. Render, like the gym sender).

---

## 6. Things to know

- **Unofficial method:** QR / WhatsApp Web linking isn't the official API. Normal reply-only use is usually fine, but WhatsApp can ban numbers that look spammy. Use a spare number to test; never send bulk messages from it.
- **The bot only replies** to people who message first — it never starts chats.
- **Server must stay running** for the bot to answer (laptop for testing, a small always-on host later).
- **Groups are ignored**; only one-to-one chats are handled.
- **Payments** are not included (cash / UPI on delivery). A UPI link can be added later.

---

## 7. Questions before building

1. One restaurant, or several restaurants on one server? (Plan assumes **one**.)
2. Ask the customer's name, or just use their WhatsApp name? (Plan uses **WhatsApp name**.)
3. Pickup + delivery, or also dine-in with table number?
