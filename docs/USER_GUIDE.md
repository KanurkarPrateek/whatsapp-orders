# User Guide

This guide is for the people who run the restaurant: owners, managers and counter staff. No technical knowledge is needed.

---

## 1. What this app does

- Customers send a WhatsApp message to the restaurant's number.
- A bot replies with the menu. The customer picks items by typing numbers.
- The order appears on the **Orders** screen of the dashboard, with a "ding" sound.
- Staff press **Accept → Mark ready → Mark done**. The customer gets a WhatsApp message at every step.

The restaurant's normal WhatsApp number is used. It is linked to the app once by scanning a QR code, the same way you link WhatsApp Web on a computer.

---

## 2. Opening the dashboard

1. Open the dashboard address in a browser (for example `http://localhost:3300` on the computer running the app).
2. Enter the **PIN** and press **Log in**.

You stay logged in on that browser. If the app is restarted you will need to log in again.

The top bar shows:

| Item | Meaning |
|---|---|
| Restaurant name | Set in Settings |
| **Orders / Menu / WhatsApp / Settings** | The four screens |
| **Open** tick box | Untick to stop taking orders (customers are told you're closed) |
| WhatsApp badge | Green "WhatsApp connected", orange "Scan QR to connect", or grey "Connecting…". Click it to open the WhatsApp screen |

---

## 3. Connecting WhatsApp (one time)

1. Go to the **WhatsApp** screen. A QR code is shown.
2. On the restaurant's phone open WhatsApp.
   - Android: **⋮ → Linked devices → Link a device**
   - iPhone: **Settings → Linked devices → Link a device**
3. Point the phone at the QR code.
4. The screen changes to **✅ Connected** and shows the number.

The link is remembered, so you don't need to scan again after a restart.
The phone can stay in your pocket; it only needs internet now and then (at least once every 14 days, a WhatsApp rule for linked devices).

**To disconnect:** WhatsApp screen → **Unlink this number**, or on the phone: Linked devices → tap the device → Log out. A new QR code appears.

> ⚠️ **If you link a personal number** (one friends and family also message), the bot will reply to *everyone*. While testing, fill in **Settings → Test numbers** first (see section 6).

---

## 4. Taking orders (Orders screen)

Orders are shown in four columns:

| Column | What it means | Buttons |
|---|---|---|
| **New** | Just placed, waiting for you | **Accept**, **Reject** |
| **Preparing** | Kitchen is making it | **Mark ready** |
| **Ready / Out** | Ready for pickup, or out for delivery | **Mark done** |
| **Done today** | Finished or rejected orders from the last 24 hours | none |

Each order card shows: order number, time, customer name and number, items with quantities, **Pickup** or **Delivery + address**, and the total.

New orders appear by themselves. You don't need to refresh. You hear a short "ding", a pop-up says "🔔 New order", and the browser tab title shows the number waiting, e.g. **(2) New orders**.

> 🔊 Browsers only play sound after you've clicked somewhere on the page once. Logging in counts.

### What the customer receives when you press a button

| You press | Customer gets |
|---|---|
| **Accept** | "👨‍🍳 Your order #12 from Spice Hut has been accepted and is being prepared." |
| **Mark ready** (pickup) | "🛍️ Your order #12 is ready for pickup!" |
| **Mark ready** (delivery) | "🛵 Your order #12 is out for delivery!" |
| **Mark done** | "🙏 Thank you for ordering from Spice Hut! Enjoy your meal." |
| **Reject** (asks you to confirm first) | "😔 Sorry, Spice Hut can't take order #12 right now." |

If WhatsApp is not connected when you press a button, the order still moves. A message tells you the customer could not be messaged.

---

## 5. Managing the menu (Menu screen)

- **Add an item:** type the name, price (whole rupees) and category, then press **Add item**. Categories you've used before are suggested as you type.
- **Change an item:** edit the name, price or category directly in the table. It saves when you click away ("Saved" appears).
- **Sold out:** untick **Available**. The item disappears from the customer menu but is kept for later. Tick it again to bring it back.
- **Delete:** removes the item for good (asks first).

**Item numbers.** Customers order by number. The **#** column shows the number customers currently see. Numbers are given in order: categories in the order they were first added, then items in the order they were added. Hidden (unavailable) items have no number, so **numbers after a hidden item shift up by one**. Customers always get a fresh menu when they say "hi", so this is fine. Just avoid changing the menu while someone is in the middle of ordering, if you can.

---

## 6. Settings

| Setting | What it does |
|---|---|
| **Restaurant name** | Shown in the menu message, status messages and the dashboard title |
| **Welcome line** | First line of the menu message, e.g. "Welcome! 👋" or "Namaste 🙏 Fresh lunch till 3pm" |
| **Test numbers** | If filled, the bot replies **only** to these numbers and ignores everyone else. Write numbers with country code, separated by commas: `919876543210, 919812345678`. **Empty = everyone is served.** |
| **Log out of dashboard** | Logs this browser out |

The **Open** tick box in the top bar is the open/closed switch.
- **Open:** the bot takes orders.
- **Closed:** anyone who messages gets "Sorry, Spice Hut is closed right now. Please try again later." Customers can still check their order with STATUS.

---

## 7. What the customer does

The customer only needs WhatsApp. Example chat:

```
Customer:  hi
Bot:       Welcome! 👋
           🍽️ Spice Hut — Menu

           STARTERS
           1. Paneer Tikka — ₹220
           2. Veg Manchurian — ₹180

           MAINS
           3. Butter Chicken — ₹320
           4. Dal Makhani — ₹240
           ...
           Reply with item numbers, e.g. 1, 3x2, 5
           (3x2 = two of item 3)

Customer:  1, 3x2
Bot:       🛒 Your order
           1 × Paneer Tikka — ₹220
           2 × Butter Chicken — ₹640
           Total: ₹860

           Reply YES to place it, send more numbers to add, or CANCEL.

Customer:  yes
Bot:       Almost done! Reply 1 for Pickup, or send your delivery address for Delivery.

Customer:  Flat 4, MG Road, Pune
Bot:       ✅ Order #12 placed!
           Total ₹860 · Delivery
           We'll message you here when it's being prepared. Send STATUS any time.
```

### Everything a customer can send

| Message | What happens |
|---|---|
| `hi`, `hello`, `menu`, `order`, `start` | Shows the menu (keeps anything already in the cart) |
| Item numbers: `1`, `1, 3`, `1 3 5`, `3x2`, `3 x 2`, `3*2` | Adds items to the cart. `3x2` = two of item 3. Sending the same item again adds to it |
| `cart` | Shows the cart |
| `yes`, `ok`, `confirm`, `done` | Goes to checkout |
| `1` / `pickup` (at checkout) | Places a pickup order |
| `2` / `delivery` (at checkout) | Asks for the address |
| Any address of 8+ characters (at checkout) | Places a delivery order to that address |
| `cancel` | Empties the cart |
| `status` | Shows their open orders and where each one is |
| Anything else | Shows the menu (if the cart is empty) or the cart with a hint |

Limits: up to 50 of one item; numbers that aren't on the menu get "There's no item 99 on the menu".

---

## 8. Good to know

- **The bot only replies.** It never messages anyone first, except order updates to customers who ordered.
- **Groups are ignored.** Only one-to-one chats are answered.
- **The computer running the app must stay on.** If it's off, messages wait on WhatsApp and are *not* answered later.
- **Unofficial WhatsApp method.** This uses WhatsApp Web linking, not the paid WhatsApp Business API. Normal reply-only use is usually fine, but don't send bulk/promotional messages from this number: WhatsApp may block numbers that look like spam.
- **No tap buttons.** WhatsApp only shows buttons and lists for the paid Business API. Over QR linking they don't appear on phones (tested 2026-10-21), so the menu uses numbers.
- **Payments are not handled.** Collect cash/UPI at pickup or delivery.

---

## 9. Quick troubleshooting

| Problem | What to do |
|---|---|
| Customer says the bot doesn't reply | Check the WhatsApp badge is green. Check **Open** is ticked. Check **Test numbers** is empty (or contains their number). |
| Badge says "Scan QR to connect" | The phone was unlinked. Scan again on the WhatsApp screen. |
| No sound for new orders | Click anywhere on the dashboard once; make sure the computer isn't muted. |
| "Customer could not be messaged" | WhatsApp was disconnected at that moment. Reconnect, then message the customer yourself if needed. |
| Asked to log in again | The app was restarted. Enter the PIN. |
