// Links the restaurant's WhatsApp number by QR (like WhatsApp Web) and
// passes incoming customer messages to the bot.
import {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeWASocket,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import { EventEmitter } from "node:events";
import { rm } from "node:fs/promises";
import pino from "pino";
import QRCode from "qrcode";
import { handleMessage } from "./bot.js";
import { getSettings } from "./db.js";

const AUTH_DIR = process.env.AUTH_DIR || new URL("./auth", import.meta.url).pathname;
const log = pino({ level: process.env.LOG_LEVEL || "info" });

export const events = new EventEmitter(); // "status", "order"
export const wa = { state: "starting", qr: null, number: null }; // starting | qr | connected

let sock = null;

function setState(patch) {
  Object.assign(wa, patch);
  events.emit("status", { ...wa });
}

export async function connect() {
  setState({ state: "starting", qr: null });
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));
  const current = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    browser: ["Restaurant Orders", "Chrome", "1.0"],
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });
  sock = current;
  current.ev.on("creds.update", saveCreds);

  current.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (sock !== current) return;
    if (qr) setState({ state: "qr", qr: await QRCode.toDataURL(qr, { margin: 1, width: 320 }) });
    if (connection === "open") {
      const number = current.user?.id?.split(/[:@]/)[0] ?? null;
      log.info({ number }, "WhatsApp connected");
      setState({ state: "connected", qr: null, number });
    }
    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        log.info("WhatsApp unlinked from the phone; showing a new QR");
        await rm(AUTH_DIR, { recursive: true, force: true });
      } else {
        log.info({ code }, "WhatsApp connection closed, reconnecting");
      }
      setState({ state: "starting", qr: null, number: null });
      setTimeout(() => connect().catch((e) => log.error(e, "reconnect failed")), 3000);
    }
  });

  current.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return; // skip old messages synced on connect
    for (const msg of messages) {
      try {
        await onMessage(msg);
      } catch (error) {
        log.error({ err: error.message }, "failed to handle message");
      }
    }
  });
}

function textOf(message) {
  const m = message?.ephemeralMessage?.message ?? message?.viewOnceMessage?.message ?? message;
  return m?.conversation ?? m?.extendedTextMessage?.text ?? m?.imageMessage?.caption ?? null;
}

const digits = (s) => String(s ?? "").replace(/\D/g, "");

async function onMessage(msg) {
  const jid = msg.key.remoteJid;
  // Only one-to-one chats from customers: no groups, status updates, channels or our own messages.
  if (!jid || msg.key.fromMe) return;
  if (!jid.endsWith("@s.whatsapp.net") && !jid.endsWith("@lid")) return;
  const text = textOf(msg.message);
  if (!text) return;

  const phone = jid.endsWith("@s.whatsapp.net") ? jid.split("@")[0] : msg.key.senderPn?.split("@")[0] ?? null;

  // Test mode: only answer the listed numbers.
  const allowed = getSettings().test_numbers.split(",").map(digits).filter(Boolean);
  if (allowed.length) {
    const id = digits(phone) || digits(jid.split("@")[0]);
    if (!allowed.some((a) => id.endsWith(a) || a.endsWith(id))) {
      log.info({ phone: phone ?? jid }, "ignored message (not in test numbers)");
      return;
    }
  }

  const { replies, order } = handleMessage({ jid, phone, name: msg.pushName || null, text });
  for (const r of replies) await sock.sendMessage(jid, { text: r });
  if (order) events.emit("order", order);
}

// Send a message to a customer (used for order status updates).
export async function send(jid, text) {
  if (wa.state !== "connected") throw new Error("WhatsApp is not connected");
  await sock.sendMessage(jid, { text });
}

// Unlink this server from the WhatsApp number and show a fresh QR.
export async function logout() {
  try {
    await sock?.logout();
  } catch {
    // Not connected: close the socket so connect() runs again with no login.
    sock?.end(new Error("logged out"));
  }
  await rm(AUTH_DIR, { recursive: true, force: true });
}
