# WhatsApp Bot (Baileys) — g4f or official Claude

A minimal WhatsApp bot that forwards incoming messages to an AI backend and replies with the
generated answer. Built on [Baileys](https://github.com/WhiskeySockets/Baileys), an unofficial
WhatsApp Web client library. Two backends are supported:

- `g4f` (default) — a local [g4f](https://github.com/xtekky/gpt4free) API server, any supported model/provider.
- `anthropic` — the **official** Anthropic Claude API, using your own API key from
  [console.anthropic.com](https://console.anthropic.com/). Recommended if you specifically want Claude:
  it's the real API, not a reverse-engineered claude.ai session, so there's no ToS risk or dependency
  on a third-party proxy.

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
                                          <-> HTTPS <-> api.anthropic.com (official Claude API)
```

## Setup

1. Install the bot's dependencies:

   ```bash
   cd etc/examples/whatsapp-bot
   npm install
   ```

2. Pick a backend (see below) and set its environment variables.

3. Run the bot:

   ```bash
   npm start
   ```

4. A QR code will be printed in the terminal. On your phone: **WhatsApp > Settings > Linked
   Devices > Link a device**, then scan it.

5. Once you see `Connected to WhatsApp.`, send a message to that number from another phone/account
   and the bot will reply.

The session credentials are saved under `auth/` (git-ignored) so you don't need to re-scan the QR
on every restart. Delete that folder to unlink the device.

## Backend: official Claude API (recommended for Claude)

1. Create an API key at [console.anthropic.com](https://console.anthropic.com/) (pay-as-you-go billing).
2. Run:

   ```bash
   BACKEND=anthropic ANTHROPIC_API_KEY=sk-ant-... npm start
   ```

No g4f server needed for this backend — the bot talks straight to `api.anthropic.com`.

| Variable               | Default                | Description                                    |
|------------------------|-------------------------|--------------------------------------------------|
| `ANTHROPIC_API_KEY`    | *(required)*             | Your key from console.anthropic.com               |
| `ANTHROPIC_MODEL`      | `claude-sonnet-4-5`      | Claude model name                                 |
| `ANTHROPIC_MAX_TOKENS` | `1024`                   | Max tokens per reply                              |

## Backend: g4f (free, multi-provider)

1. Start the g4f API server (from the repo root): `python -m g4f api` (listens on `http://localhost:1337`).
2. Run the bot with `BACKEND=g4f` (or just omit `BACKEND`, it's the default).

| Variable         | Default                                          | Description                                             |
|------------------|---------------------------------------------------|-----------------------------------------------------------|
| `G4F_API_URL`    | `http://localhost:1337/v1/chat/completions`       | g4f chat completions endpoint                             |
| `G4F_MODEL`      | `gpt-4o-mini`                                     | Model name passed to g4f                                  |
| `G4F_API_KEY`    | *(empty)*                                          | Bearer token, only needed if the g4f API requires one     |

> g4f also ships a `Claude` provider, but it works by reusing a logged-in claude.ai browser
> session cookie through a third-party proxy (`claude.gpt4free.workers.dev`), not the official API.
> That violates Anthropic's ToS and hands your session to a server you don't control — use the
> `anthropic` backend above instead if you want Claude specifically.

## Shared configuration

| Variable         | Default                                          | Description                                             |
|------------------|---------------------------------------------------|-----------------------------------------------------------|
| `SYSTEM_PROMPT`  | `You are a helpful assistant...`                  | System prompt for every reply                              |
| `ALLOWED_NUMBERS`| *(empty = anyone)*                                | Comma-separated phone numbers (no `+`) allowed to use the bot |

Example:

```bash
BACKEND=anthropic ANTHROPIC_API_KEY=sk-ant-... ALLOWED_NUMBERS=15551234567,15557654321 npm start
```

## Notes

- Requires Node.js 18+ (for the built-in `fetch`).
- Group chats and status broadcasts are ignored by default; only direct messages are answered.
- This is a demo/reference implementation, not a hardened production bot — add your own rate
  limiting, logging, and error handling before exposing it broadly.
