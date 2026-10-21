# WhatsApp Orders

Take restaurant orders over WhatsApp. Customers chat with the restaurant's number, pick dishes by typing item numbers, and their orders appear live on a web dashboard. The restaurant's WhatsApp is linked by scanning a QR code, like WhatsApp Web. No paid WhatsApp Business API needed.

```
Customer:  hi                 →  numbered menu
Customer:  1, 3x2             →  cart + total
Customer:  yes                →  pickup or delivery?
Customer:  Flat 4, MG Road    →  ✅ Order #12 placed   →  🔔 dashboard
Staff:     Accept → Mark ready → Mark done             →  customer gets a WhatsApp update each time
```

## Quick start

```bash
npm install
PIN=4321 PORT=3300 npm start
```

Open http://localhost:3300 → log in with the PIN → **WhatsApp** tab → scan the QR from the restaurant's phone (WhatsApp → Linked devices → Link a device).

> Linking a number that friends/family also message? Put your test number in **Settings → Test numbers** first. The bot then replies only to that number.

## Features

- WhatsApp bot: numbered menu, cart with quantities, pickup or delivery address, `STATUS`, `CANCEL`
- Live order board (New → Preparing → Ready → Done) with sound, status messages to customers
- Menu editor with categories and sold-out switch
- Open/closed switch, restaurant name, welcome line, test-number mode
- PIN-protected dashboard that works on phones
- One Node process + one SQLite file; no build step, no browser automation

## Documentation

| Doc | For |
|---|---|
| [User Guide](docs/USER_GUIDE.md) | Restaurant staff: connecting WhatsApp, handling orders, menu, settings, customer commands, troubleshooting |
| [Setup & Running](docs/SETUP.md) | Install, configuration, logs, hosting, backups, moving machines |
| [Developer Guide](docs/DEVELOPER.md) | Architecture, conversation state machine, data model, HTTP API, design decisions |
| [Original plan](PLAN.md) | The first design |

## Tests

```bash
npm test
```

## Note

This uses WhatsApp Web linking ([Baileys](https://github.com/WhiskeySockets/Baileys)), not the official WhatsApp Business API. Reply-only use is normally fine; don't send bulk messages from the linked number.
