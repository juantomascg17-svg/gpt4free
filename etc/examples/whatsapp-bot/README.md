# g4f WhatsApp Bot (Baileys)

A minimal WhatsApp bot that forwards incoming messages to a local [g4f](https://github.com/xtekky/gpt4free)
API server and replies with the generated answer. Built on
[Baileys](https://github.com/WhiskeySockets/Baileys), an unofficial WhatsApp Web client library.

## ⚠️ Important disclaimer

Baileys (like every other "WhatsApp connector" you'll find on GitHub — whatsapp-web.js, venom-bot,
WPPConnect, etc.) works by reverse-engineering the WhatsApp Web protocol. It is **not** an official
Meta product or API.

- Using it **violates WhatsApp's Terms of Service** and can get the linked phone number
  **banned or rate-limited**, especially for bot-like/automated behavior.
- Only link a number you're OK losing access to (e.g. a spare/test number), never your main one.
- For production or business use, use the official
  [WhatsApp Business Platform (Cloud API)](https://developers.facebook.com/docs/whatsapp/cloud-api/)
  instead, which requires a Meta Developer account and a verified business number but carries no
  ban risk.

This example is provided for research/educational purposes.

## How it works

```
WhatsApp <-> Baileys (this bot, Node.js) <-> HTTP <-> g4f API server (Python) <-> AI providers
```

The bot itself does not talk to any AI model directly — it calls g4f's OpenAI-compatible
`/v1/chat/completions` endpoint, so it works with any model/provider g4f supports.

## Setup

1. Start the g4f API server (from the repo root):

   ```bash
   python -m g4f api
   ```

   By default it listens on `http://localhost:1337`.

2. Install the bot's dependencies:

   ```bash
   cd etc/examples/whatsapp-bot
   npm install
   ```

3. Run the bot:

   ```bash
   npm start
   ```

4. A QR code will be printed in the terminal. On your phone: **WhatsApp > Settings > Linked
   Devices > Link a device**, then scan it.

5. Once you see `Connected to WhatsApp.`, send a message to that number from another phone/account
   and the bot will reply using g4f.

The session credentials are saved under `auth/` (git-ignored) so you don't need to re-scan the QR
on every restart. Delete that folder to unlink the device.

## Configuration (environment variables)

| Variable         | Default                                          | Description                                             |
|------------------|---------------------------------------------------|-----------------------------------------------------------|
| `G4F_API_URL`    | `http://localhost:1337/v1/chat/completions`       | g4f chat completions endpoint                             |
| `G4F_MODEL`      | `gpt-4o-mini`                                     | Model name passed to g4f                                  |
| `G4F_API_KEY`    | *(empty)*                                          | Bearer token, only needed if the g4f API requires one     |
| `SYSTEM_PROMPT`  | `You are a helpful assistant...`                  | System prompt for every reply                              |
| `ALLOWED_NUMBERS`| *(empty = anyone)*                                | Comma-separated phone numbers (no `+`) allowed to use the bot |

Example:

```bash
G4F_MODEL=gpt-4o ALLOWED_NUMBERS=15551234567,15557654321 npm start
```

## Notes

- Requires Node.js 18+ (for the built-in `fetch`).
- Group chats and status broadcasts are ignored by default; only direct messages are answered.
- This is a demo/reference implementation, not a hardened production bot — add your own rate
  limiting, logging, and error handling before exposing it broadly.
