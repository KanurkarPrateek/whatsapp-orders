// Web dashboard + API. Run: npm start, then open http://localhost:3000
import express from "express";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { statusMessage } from "./bot.js";
import * as db from "./db.js";
import { connect, events, logout, send, wa } from "./whatsapp.js";

const PORT = Number(process.env.PORT || 3000);
const PIN = process.env.PIN || "1234";
if (!process.env.PIN) console.warn("⚠️  Using default PIN 1234. Set PIN=... to change it.");

const app = express();
app.use(express.json());

// ---------- PIN login (cookie session, kept in memory) ----------
const sessions = new Set();
const cookieToken = (req) => /(?:^|;\s*)session=([a-f0-9]+)/.exec(req.headers.cookie ?? "")?.[1];

app.post("/api/login", (req, res) => {
  const given = Buffer.from(String(req.body?.pin ?? ""));
  const want = Buffer.from(PIN);
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    return res.status(401).json({ error: "Wrong PIN" });
  }
  const token = randomBytes(24).toString("hex");
  sessions.add(token);
  res.setHeader("Set-Cookie", `session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000`);
  res.json({ ok: true });
});

app.use("/api", (req, res, next) => {
  if (sessions.has(cookieToken(req))) return next();
  res.status(401).json({ error: "Please log in" });
});

app.post("/api/logout", (req, res) => {
  sessions.delete(cookieToken(req));
  res.json({ ok: true });
});

// ---------- WhatsApp connection ----------
app.get("/api/whatsapp", (req, res) => res.json(wa));
app.post("/api/whatsapp/unlink", async (req, res) => {
  await logout();
  res.json({ ok: true });
});

// ---------- orders ----------
const STATUSES = ["new", "preparing", "ready", "done", "rejected"];

app.get("/api/orders", (req, res) => res.json(db.listOrders()));

app.post("/api/orders/:id/status", async (req, res) => {
  const { status } = req.body ?? {};
  if (!STATUSES.includes(status)) return res.status(400).json({ error: "Unknown status" });
  if (!db.getOrder(Number(req.params.id))) return res.status(404).json({ error: "Order not found" });
  const order = db.setOrderStatus(Number(req.params.id), status);
  broadcast("order", order);

  let notified = false;
  const text = statusMessage(order);
  if (text) {
    try {
      await send(order.jid, text);
      notified = true;
    } catch (error) {
      console.error("Could not message customer:", error.message);
    }
  }
  res.json({ order, notified });
});

// ---------- menu ----------
function menuInput(body, partial = false) {
  const out = {};
  if (body.name !== undefined || !partial) {
    out.name = String(body.name ?? "").trim();
    if (!out.name) throw new Error("Name is required");
  }
  if (body.price !== undefined || !partial) {
    out.price = Math.round(Number(body.price));
    if (!Number.isFinite(out.price) || out.price < 0) throw new Error("Price must be a number");
  }
  if (body.category !== undefined) out.category = String(body.category).trim() || "Menu";
  if (body.available !== undefined) out.available = Boolean(body.available);
  return out;
}

app.get("/api/menu", (req, res) => res.json(db.listMenu()));

app.post("/api/menu", (req, res) => {
  try {
    res.json(db.addMenuItem(menuInput(req.body ?? {})));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put("/api/menu/:id", (req, res) => {
  try {
    const item = db.updateMenuItem(Number(req.params.id), menuInput(req.body ?? {}, true));
    item ? res.json(item) : res.status(404).json({ error: "Item not found" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete("/api/menu/:id", (req, res) => {
  db.deleteMenuItem(Number(req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: "Item not found" });
});

// ---------- settings ----------
app.get("/api/settings", (req, res) => res.json(db.getSettings()));
app.put("/api/settings", (req, res) => res.json(db.saveSettings(req.body ?? {})));

// ---------- live updates (Server-Sent Events) ----------
const clients = new Set();
function broadcast(type, data) {
  const line = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(line);
}

app.get("/api/events", (req, res) => {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.write(`event: status\ndata: ${JSON.stringify(wa)}\n\n`);
  clients.add(res);
  const ping = setInterval(() => res.write(": ping\n\n"), 25000);
  req.on("close", () => {
    clearInterval(ping);
    clients.delete(res);
  });
});

events.on("status", (s) => broadcast("status", s));
events.on("order", (o) => broadcast("new-order", o));

app.use(express.static(new URL("./public", import.meta.url).pathname));

app.listen(PORT, () => console.log(`Dashboard: http://localhost:${PORT}`));
connect().catch((error) => console.error("WhatsApp failed to start:", error));
