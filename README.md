# WhatsApp Orders

Customers order food by chatting with the restaurant's WhatsApp number. Orders appear live on a web dashboard. See `PLAN.md` for the full design.

## Run

```bash
npm install
PIN=4321 npm start          # PIN for the dashboard (default 1234)
```

Open http://localhost:3000 → log in with the PIN → **WhatsApp** tab → scan the QR with the restaurant's phone (WhatsApp → Linked devices → Link a device).

Options (environment variables): `PORT` (3000), `PIN` (1234), `DB_FILE` (./data.db), `AUTH_DIR` (./auth, the saved WhatsApp login).

## Testing safely

If the linked number is also used by friends/family, first put your test number(s) in **Settings → Test numbers**. The bot then replies only to those numbers. Clear the field when you go live.

## What a customer sends

| Message | Bot does |
|---|---|
| `hi` / `menu` | Sends the numbered menu |
| `1, 3x2, 5` | Adds items (3x2 = two of item 3) and shows the cart |
| `yes` | Asks: 1 for pickup, or the delivery address |
| `1` or an address | Places the order → it pops up on the dashboard |
| `status` | Shows their open orders |
| `cart` / `cancel` | Shows / clears the cart |

When the restaurant presses **Accept → Mark ready → Mark done** (or **Reject**), the customer gets a WhatsApp message each time.
The **Open** switch in the header turns ordering off ("we're closed").

## Files

- `server.js`: dashboard API, PIN login, live updates
- `whatsapp.js`: QR linking (Baileys), receiving and sending messages
- `bot.js`: the chat flow
- `db.js`: SQLite tables (built into Node, no setup)
- `public/`: the dashboard page
- `npm test`: runs a full simulated conversation (no WhatsApp needed)

## Notes

- This uses WhatsApp Web linking, not the official Business API. Reply-only use is normally fine, but don't send bulk messages from the number.
- The server must stay running for the bot to answer.
- Restarting the server logs you out of the dashboard (the WhatsApp link is kept).
