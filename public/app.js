// Dashboard logic. Plain JS, no build step.
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

async function api(path, options = {}) {
  const res = await fetch("/api" + path, {
    ...options,
    headers: { "Content-Type": "application/json" },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 401 && path !== "/login") {
    showLogin();
    throw new Error("Please log in");
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Something went wrong");
  return data;
}

function toast(text) {
  const t = $("#toast");
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 3500);
}

// ---------- login ----------
function showLogin() {
  $("#app").hidden = true;
  $("#login").hidden = false;
}

$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api("/login", { method: "POST", body: { pin: $("#pin").value } });
    $("#pin").value = "";
    $("#login-error").textContent = "";
    start();
  } catch (error) {
    $("#login-error").textContent = error.message;
  }
});

// ---------- tabs ----------
$$(".tabs button").forEach((b) =>
  b.addEventListener("click", () => {
    $$(".tabs button").forEach((x) => x.classList.toggle("active", x === b));
    $$(".tab").forEach((t) => (t.hidden = t.id !== "tab-" + b.dataset.tab));
  }),
);

// ---------- orders ----------
let orders = [];

const time = (sqlDate) =>
  new Date(sqlDate.replace(" ", "T") + "Z").toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

const ACTIONS = {
  new: [["preparing", "Accept", "primary"], ["rejected", "Reject", "danger"]],
  preparing: [["ready", "Mark ready", "primary"]],
  ready: [["done", "Mark done", "primary"]],
};

function orderCard(o) {
  const items = o.items.map((i) => `<li>${i.qty} × ${esc(i.name)}</li>`).join("");
  const where =
    o.type === "pickup" ? "🛍️ Pickup" : `🛵 Delivery<br><span class="addr">${esc(o.address)}</span>`;
  const phone = o.phone ? `+${esc(o.phone)}` : "";
  const buttons = (ACTIONS[o.status] ?? [])
    .map(([s, label, cls]) => `<button class="btn ${cls}" data-id="${o.id}" data-status="${s}">${label}</button>`)
    .join("");
  return `
    <article class="card order ${o.status}">
      <div class="order-head"><b>#${o.id}</b><span>${time(o.created_at)}</span></div>
      <div class="who">${esc(o.name || "Customer")} <small>${phone}</small></div>
      <ul>${items}</ul>
      <div class="where">${where}</div>
      <div class="total">₹${o.total}${o.status === "rejected" ? ' <span class="tag">Rejected</span>' : ""}</div>
      <div class="actions">${buttons}</div>
    </article>`;
}

function renderOrders() {
  const cols = { new: [], preparing: [], ready: [], done: [] };
  for (const o of orders) (cols[o.status] ?? cols.done).push(o);
  cols.new.reverse(); // oldest first, so the kitchen works top to bottom
  cols.preparing.reverse();
  cols.ready.reverse();
  for (const [col, list] of Object.entries(cols)) {
    $(`[data-col="${col}"]`).innerHTML = list.map(orderCard).join("") || '<p class="empty">Nothing here</p>';
    $(`[data-count="${col}"]`).textContent = list.length || "";
  }
  const waiting = cols.new.length;
  document.title = waiting ? `(${waiting}) New orders` : "Restaurant Orders";
}

$("#tab-orders").addEventListener("click", async (e) => {
  const b = e.target.closest("button[data-status]");
  if (!b) return;
  if (b.dataset.status === "rejected" && !confirm("Reject this order? The customer will be told.")) return;
  b.disabled = true;
  try {
    const { order, notified } = await api(`/orders/${b.dataset.id}/status`, {
      method: "POST",
      body: { status: b.dataset.status },
    });
    upsertOrder(order);
    if (!notified) toast("Saved, but the customer could not be messaged (is WhatsApp connected?)");
  } catch (error) {
    toast(error.message);
    b.disabled = false;
  }
});

function upsertOrder(order) {
  const i = orders.findIndex((o) => o.id === order.id);
  if (i >= 0) orders[i] = order;
  else orders.unshift(order);
  renderOrders();
}

// Short "ding" for new orders.
function ding() {
  try {
    const ctx = (ding.ctx ??= new AudioContext());
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.connect(gain).connect(ctx.destination);
      const t = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.start(t);
      osc.stop(t + 0.3);
    });
  } catch {
    // Sound is a nice-to-have.
  }
}

// ---------- WhatsApp ----------
function renderWhatsApp(s) {
  const pill = $("#wa-pill");
  pill.className = "pill " + s.state;
  pill.textContent = s.state === "connected" ? "WhatsApp connected" : s.state === "qr" ? "Scan QR to connect" : "Connecting…";
  $("#wa-qr-box").hidden = s.state === "connected";
  $("#wa-connected").hidden = s.state !== "connected";
  $("#wa-number").textContent = s.number ? "+" + s.number : "";
  $("#wa-qr").hidden = !s.qr;
  if (s.qr) $("#wa-qr").src = s.qr;
  $("#wa-wait").hidden = !!s.qr;
}

$("#wa-pill").addEventListener("click", () => $('[data-tab="whatsapp"]').click());

$("#wa-unlink").addEventListener("click", async () => {
  if (!confirm("Unlink WhatsApp? The bot stops replying until you scan again.")) return;
  await api("/whatsapp/unlink", { method: "POST" });
});

// ---------- menu ----------
let menu = [];

function renderMenu() {
  let n = 0;
  $("#menu-body").innerHTML = menu
    .map((m) => {
      const num = m.available ? ++n : "–";
      return `<tr data-id="${m.id}">
        <td class="num">${num}</td>
        <td><input data-field="name" value="${esc(m.name)}" /></td>
        <td><input data-field="price" type="number" min="0" value="${m.price}" class="price" /></td>
        <td><input data-field="category" value="${esc(m.category)}" list="categories" /></td>
        <td><input data-field="available" type="checkbox" ${m.available ? "checked" : ""} /></td>
        <td><button class="btn small danger" data-delete>Delete</button></td>
      </tr>`;
    })
    .join("");
  $("#categories").innerHTML = [...new Set(menu.map((m) => m.category))]
    .map((c) => `<option value="${esc(c)}">`)
    .join("");
}

async function loadMenu() {
  menu = await api("/menu");
  renderMenu();
}

$("#menu-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    await api("/menu", {
      method: "POST",
      body: { name: f.name.value, price: f.price.value, category: f.category.value },
    });
    f.name.value = "";
    f.price.value = "";
    f.name.focus();
    await loadMenu();
  } catch (error) {
    toast(error.message);
  }
});

$("#menu-body").addEventListener("change", async (e) => {
  const input = e.target.closest("[data-field]");
  if (!input) return;
  const id = input.closest("tr").dataset.id;
  const value = input.type === "checkbox" ? input.checked : input.value;
  try {
    await api(`/menu/${id}`, { method: "PUT", body: { [input.dataset.field]: value } });
    await loadMenu();
    toast("Saved");
  } catch (error) {
    toast(error.message);
    await loadMenu();
  }
});

$("#menu-body").addEventListener("click", async (e) => {
  if (!e.target.matches("[data-delete]")) return;
  const row = e.target.closest("tr");
  if (!confirm(`Delete “${row.querySelector('[data-field="name"]').value}”?`)) return;
  await api(`/menu/${row.dataset.id}`, { method: "DELETE" });
  await loadMenu();
});

// ---------- settings ----------
function renderSettings(s) {
  const f = $("#settings-form");
  for (const key of ["restaurant_name", "welcome", "test_numbers"]) f[key].value = s[key] ?? "";
  $("#title").textContent = s.restaurant_name || "Restaurant Orders";
  $("#open-toggle").checked = s.open === "1";
  $("#open-label").textContent = s.open === "1" ? "Open" : "Closed";
  document.body.classList.toggle("closed", s.open !== "1");
}

$("#settings-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const s = await api("/settings", {
    method: "PUT",
    body: { restaurant_name: f.restaurant_name.value, welcome: f.welcome.value, test_numbers: f.test_numbers.value },
  });
  renderSettings(s);
  toast("Settings saved");
});

$("#open-toggle").addEventListener("change", async (e) => {
  renderSettings(await api("/settings", { method: "PUT", body: { open: e.target.checked ? "1" : "0" } }));
});

$("#logout").addEventListener("click", async () => {
  await api("/logout", { method: "POST" });
  location.reload();
});

// ---------- start ----------
let stream;
async function start() {
  let w;
  try {
    let o, s;
    [o, s, w] = await Promise.all([api("/orders"), api("/settings"), api("/whatsapp")]);
    orders = o;
    renderOrders();
    renderSettings(s);
    renderWhatsApp(w);
    await loadMenu();
  } catch {
    return; // showLogin() already ran
  }
  $("#login").hidden = true;
  $("#app").hidden = false;
  // Not linked yet: start on the WhatsApp tab so the QR is the first thing seen.
  if (w.state !== "connected") $('[data-tab="whatsapp"]').click();

  stream?.close();
  stream = new EventSource("/api/events");
  stream.addEventListener("status", (e) => renderWhatsApp(JSON.parse(e.data)));
  stream.addEventListener("order", (e) => upsertOrder(JSON.parse(e.data)));
  stream.addEventListener("new-order", (e) => {
    const o = JSON.parse(e.data);
    upsertOrder(o);
    ding();
    toast(`🔔 New order #${o.id} — ₹${o.total}`);
  });
  // After a server restart, reload the orders we may have missed.
  stream.addEventListener("open", async () => {
    orders = await api("/orders");
    renderOrders();
  });
}

start();
