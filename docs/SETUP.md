# Setup & Running

How to install, run and look after the app.

---

## 1. Requirements

- **Node.js 22.13 or newer** (uses the built-in `node:sqlite`; developed on Node 25).
- A WhatsApp account on a phone (normal or WhatsApp Business app) to link.
- Nothing else: no database server, no Chrome/Puppeteer, no build step.

## 2. Install and start

```bash
git clone <repo-url> whatsapp-orders
cd whatsapp-orders
npm install
PIN=4321 PORT=3300 npm start
```

Output:

```
Dashboard: http://localhost:3300
{"msg":"WhatsApp connected", ...}     ← after the first QR scan
```

Open the dashboard, log in with the PIN, and scan the QR on the **WhatsApp** screen (see the [User Guide](USER_GUIDE.md#3-connecting-whatsapp-one-time)).

On the first start a sample menu (Spice Hut: 8 items) is created. Edit or delete it on the Menu screen.

## 3. Configuration (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | Port the dashboard listens on |
| `PIN` | `1234` | Dashboard PIN. **Always set this**; a warning is printed when the default is used |
| `DB_FILE` | `./data.db` | SQLite database file |
| `AUTH_DIR` | `./auth` | Folder holding the saved WhatsApp login |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |

Everything else (restaurant name, welcome line, open/closed, test numbers) is changed on the dashboard's Settings screen and stored in the database.

## 4. Files the app creates

| Path | What | Keep it safe? |
|---|---|---|
| `data.db` (+ `data.db-wal`, `data.db-shm`) | Menu, orders, chats, settings | Yes: back it up |
| `auth/` | The WhatsApp login (encryption keys). Anyone with this folder can act as your WhatsApp number | **Yes, secret**: never share or commit |

Both are in `.gitignore`.

## 5. Logs

Logs are JSON lines on standard output:

```
{"from":"919800000001","name":"Asha","text":"Hi","msg":"message in"}
{"to":"123456789012345@lid","count":1,"msg":"replied"}
{"order":3,"total":860,"msg":"order placed"}
{"phone":"9198...","msg":"ignored message (not in test numbers)"}
{"code":428,"msg":"WhatsApp connection closed, reconnecting"}
```

To keep a log file: `npm start >> app.log 2>&1`.

## 6. Keeping it running

The bot only answers while the process runs. Options:

- **Your laptop** (testing): `npm start` in a terminal. Stops when the laptop sleeps.
- **Always-on machine / VPS** with a process manager, e.g. pm2:
  ```bash
  npm install -g pm2
  PIN=4321 PORT=3300 pm2 start npm --name whatsapp-orders -- start
  pm2 save && pm2 startup
  ```
- **Hosted (Render, Railway, Fly.io…)**: you need a **persistent disk** mounted for `data.db` and `auth/` (set `DB_FILE=/data/data.db`, `AUTH_DIR=/data/auth`). Without one, every redeploy loses orders and asks for a new QR scan. Run only **one** copy at a time: two copies with the same login keep kicking each other off WhatsApp.

Put the dashboard behind HTTPS (most hosts do this for you) so the PIN and session cookie aren't sent in plain text.

## 7. Backups

`data.db` is a single SQLite file. A safe copy while running:

```bash
sqlite3 data.db ".backup backup-$(date +%F).db"
```

(or stop the app and copy `data.db`). Backing up `auth/` saves you a QR re-scan when moving machines. Store it privately.

## 8. Moving to another computer

1. Stop the app on the old machine.
2. Copy `data.db` and the `auth/` folder to the new machine's app folder.
3. `npm install && npm start` there. It reconnects without a new QR.

Never run both machines at once with the same `auth/`.

## 9. Resetting

| To… | Do |
|---|---|
| Link a different WhatsApp number | Dashboard → WhatsApp → **Unlink this number**, then scan with the new phone |
| Start with an empty database | Stop the app, delete `data.db*`, start again (sample menu is recreated) |
| Forget the WhatsApp login by hand | Stop the app, delete `auth/` |

## 10. Running the tests

```bash
npm test
```

Simulates full customer conversations against a temporary database (no WhatsApp needed): ordering, pickup, delivery, bad numbers, cancel and closed.
