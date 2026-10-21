// The WhatsApp conversation. Pure logic: takes a message, returns the replies.
import * as db from "./db.js";

const rupees = (n) => `₹${n}`;

function menuText() {
  const s = db.getSettings();
  const items = db.numberedMenu();
  if (items.length === 0) return `Sorry, ${s.restaurant_name} has nothing on the menu right now.`;
  const lines = [`${s.welcome}`, `🍽️ *${s.restaurant_name} — Menu*`];
  let category = null;
  items.forEach((item, i) => {
    if (item.category !== category) {
      category = item.category;
      lines.push("", `*${category.toUpperCase()}*`);
    }
    lines.push(`${i + 1}. ${item.name} — ${rupees(item.price)}`);
  });
  lines.push("", "Reply with item numbers, e.g. *1, 3x2, 5*", "(3x2 = two of item 3)");
  return lines.join("\n");
}

// Cart holds menu item ids; prices/names are looked up fresh.
function cartLines(cart) {
  const lines = [];
  let total = 0;
  const items = [];
  for (const { id, qty } of cart) {
    const item = db.getMenuItem(id);
    if (!item || !item.available) continue;
    total += item.price * qty;
    items.push({ id, name: item.name, price: item.price, qty });
    lines.push(`${qty} × ${item.name} — ${rupees(item.price * qty)}`);
  }
  return { lines, total, items };
}

function cartText(cart) {
  const { lines, total } = cartLines(cart);
  if (lines.length === 0) return "Your cart is empty. Send *MENU* to see the menu.";
  return [
    "🛒 *Your order*",
    ...lines,
    `*Total: ${rupees(total)}*`,
    "",
    "Reply *YES* to place it, send more numbers to add, or *CANCEL*.",
  ].join("\n");
}

// "1, 3x2 5" -> [{n:1,qty:1},{n:3,qty:2},{n:5,qty:1}]; null if it isn't an item list.
export function parseItems(text) {
  const cleaned = text.replace(/\s*[x×*]\s*/gi, "x").trim();
  if (!cleaned) return null;
  const tokens = cleaned.split(/[\s,;]+/).filter(Boolean);
  const picks = [];
  for (const token of tokens) {
    const m = token.match(/^(\d{1,3})(?:x(\d{1,2}))?$/i);
    if (!m) return null;
    picks.push({ n: Number(m[1]), qty: Number(m[2] ?? 1) });
  }
  return picks;
}

const STATUS_LABEL = {
  new: "received, waiting for the restaurant to accept",
  preparing: "being prepared 👨‍🍳",
  ready: "ready",
};

const ADDRESS_QUESTION = "Almost done! Reply *1* for Pickup, or send your delivery address for Delivery.";

const word = (text) => text.trim().toLowerCase().replace(/[.!]+$/, "");

/**
 * Handle one incoming message.
 * Returns { replies: string[], order?: object } — order is set when one was placed.
 */
export function handleMessage({ jid, phone, name, text }) {
  const settings = db.getSettings();
  const chat = db.getChat(jid);
  const w = word(text);
  const reply = (...replies) => ({ replies });

  if (w === "status") {
    const open = db.openOrdersFor(jid);
    if (open.length === 0) return reply("You have no open orders. Send *MENU* to order.");
    return reply(open.map((o) => `Order #${o.id}: ${STATUS_LABEL[o.status]}`).join("\n"));
  }

  if (settings.open !== "1") {
    return reply(`Sorry, ${settings.restaurant_name} is closed right now. Please try again later. 🙏`);
  }

  if (w === "cancel") {
    db.saveChat({ jid, step: "idle", cart: [] });
    return reply("Cart cleared. Send *MENU* whenever you'd like to order.");
  }

  if (["menu", "hi", "hello", "hey", "hii", "start", "order"].includes(w)) {
    db.saveChat({ jid, step: chat.cart.length ? "cart" : "idle", cart: chat.cart });
    return reply(menuText());
  }

  if (w === "cart") return reply(cartText(chat.cart));

  // Waiting for pickup / delivery address.
  if (chat.step === "address") {
    let type, address;
    if (["1", "pickup", "pick up", "takeaway", "take away"].includes(w)) type = "pickup";
    else if (["2", "delivery", "deliver"].includes(w)) {
      return reply("Please send your full delivery address.");
    } else if (text.trim().length >= 8) {
      type = "delivery";
      address = text.trim();
    } else {
      return reply(ADDRESS_QUESTION);
    }

    const { items, total } = cartLines(chat.cart);
    if (items.length === 0) {
      db.saveChat({ jid, step: "idle", cart: [] });
      return reply("Those items are no longer available. Send *MENU* to see the menu.");
    }
    const order = db.createOrder({ jid, phone, name, items, total, type, address });
    db.saveChat({ jid, step: "idle", cart: [] });
    return {
      replies: [
        `✅ *Order #${order.id} placed!*\n` +
          `Total ${rupees(total)} · ${type === "pickup" ? "Pickup" : "Delivery"}\n` +
          "We'll message you here when it's being prepared. Send *STATUS* any time.",
      ],
      order,
    };
  }

  if (["yes", "y", "ok", "okay", "confirm", "done"].includes(w)) {
    if (chat.cart.length === 0) return reply("Your cart is empty.\n\n" + menuText());
    db.saveChat({ jid, step: "address", cart: chat.cart });
    return reply(ADDRESS_QUESTION);
  }

  const picks = parseItems(text);
  if (picks) {
    const menu = db.numberedMenu();
    const bad = picks.filter((p) => p.n < 1 || p.n > menu.length || p.qty < 1).map((p) => p.n);
    if (bad.length) {
      return reply(`There's no item ${bad.join(", ")} on the menu. Pick numbers from 1 to ${menu.length}.`);
    }
    const cart = [...chat.cart];
    for (const { n, qty } of picks) {
      const id = menu[n - 1].id;
      const line = cart.find((c) => c.id === id);
      if (line) line.qty = Math.min(line.qty + qty, 50);
      else cart.push({ id, qty: Math.min(qty, 50) });
    }
    db.saveChat({ jid, step: "cart", cart });
    return reply(cartText(cart));
  }

  // Anything else: show the menu (new customer) or a hint (mid-order).
  if (chat.cart.length === 0) return reply(menuText());
  return reply("Sorry, I didn't get that.\n\n" + cartText(chat.cart));
}

// Message sent to the customer when the restaurant changes an order's status.
export function statusMessage(order) {
  const name = db.getSettings().restaurant_name;
  switch (order.status) {
    case "preparing":
      return `👨‍🍳 Your order #${order.id} from ${name} has been accepted and is being prepared.`;
    case "ready":
      return order.type === "pickup"
        ? `🛍️ Your order #${order.id} is ready for pickup!`
        : `🛵 Your order #${order.id} is out for delivery!`;
    case "done":
      return `🙏 Thank you for ordering from ${name}! Enjoy your meal.`;
    case "rejected":
      return `😔 Sorry, ${name} can't take order #${order.id} right now.`;
    default:
      return null;
  }
}
