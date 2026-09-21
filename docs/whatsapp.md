# WhatsApp Business Cloud API integration

This integrates the **official** Meta WhatsApp Business Platform (Cloud API) —
not an unofficial/reverse-engineered library. It lets you send messages
(notifications, order confirmations, etc.) and receive incoming messages via
webhook, which you can wire into your own sales/analytics logic.

Code: [`g4f/integration/whatsapp.py`](../g4f/integration/whatsapp.py)

## 1. Create the Meta app and a test number

1. Go to [Meta for Developers](https://developers.facebook.com/apps) and create
   an account if you don't have one (needs a Facebook account).
2. **Create App** → type **Business** → give it a name.
3. In the app dashboard, **Add Product** → **WhatsApp** → **Set up**.
4. Under **WhatsApp → API Setup** you get, for free, immediately:
   - A **temporary access token** (valid ~24h, for testing only).
   - A **test phone number** with a **Phone number ID**.
   - A field to add up to 5 **recipient numbers** you own, to test sends to.
5. Send a test message from that page to confirm the number works.

This is enough to test sending/receiving. For production (your own number,
tokens that don't expire every 24h) you additionally:

- Verify a **Meta Business Portfolio** (Business Manager) and attach the app.
- Add your **own phone number** (a number that isn't already active on
  WhatsApp/WhatsApp Business) under **WhatsApp → API Setup → Add phone number**.
- Generate a **permanent token**: **App settings → System users** (in Business
  Manager) → create a system user → **Generate token** with the
  `whatsapp_business_messaging` and `whatsapp_business_management` permissions.
- Submit the app for **App Review** to move out of development mode if you
  need to message numbers outside your allowed test list.

## 2. Configure this repo

Copy `example.env` to `.env` (see the comment at the top of that file for
where it needs to live) and fill in:

```
WHATSAPP_TOKEN=<your temporary or permanent access token>
WHATSAPP_PHONE_NUMBER_ID=<Phone number ID from API Setup>
WHATSAPP_VERIFY_TOKEN=<any random string you choose>
WHATSAPP_APP_SECRET=<App settings > Basic > App Secret>
```

- `WHATSAPP_VERIFY_TOKEN` is not issued by Meta — you invent it yourself and
  enter the *same* value on both sides (here and in the Meta webhook config
  in step 4). It's just a shared secret for the handshake.
- `WHATSAPP_APP_SECRET` is optional but strongly recommended: it lets the
  webhook verify that incoming requests really came from Meta (HMAC
  signature check), not from anyone who finds your webhook URL.

## 3. Run it

`g4f/api/__init__.py` automatically mounts the WhatsApp routes on the
existing g4f API server when both `WHATSAPP_TOKEN` and
`WHATSAPP_PHONE_NUMBER_ID` are set — no separate process needed:

```bash
python -m g4f.api.run
```

This exposes:
- `GET  /whatsapp/webhook` — verification handshake (used by Meta, see step 4)
- `POST /whatsapp/webhook` — incoming messages/status updates

For local testing, Meta needs to reach your webhook over **public HTTPS** —
use a tunnel such as `ngrok http 1337` and use the `https://...ngrok...` URL
in the next step.

## 4. Register the webhook in Meta

In **WhatsApp → Configuration → Webhook**:
- **Callback URL**: `https://<your-public-host>/whatsapp/webhook`
- **Verify token**: the same value you put in `WHATSAPP_VERIFY_TOKEN`
- Subscribe to the `messages` field.

Meta calls the `GET` endpoint once to confirm the handshake, then sends
incoming events as `POST`.

## 5. Send messages from your own code

```python
from g4f.integration.whatsapp import WhatsAppClient

client = WhatsAppClient()  # reads WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID from env

# Free-form text — only allowed within 24h of the customer's last message
client.send_text(to="34600000000", body="Your order #123 has shipped!")

# Template message — required to start a conversation, or after the 24h window.
# The template must already be approved in Meta > WhatsApp > Message Templates.
client.send_template(to="34600000000", template_name="order_confirmation", language_code="en_US")
```

`to` is the recipient's number in international format, digits only (no `+`,
no spaces).

## 6. React to incoming messages (e.g. for sales analytics)

Pass your own callback when creating the router, instead of relying on the
env-based auto-mount, if you want custom handling:

```python
from fastapi import FastAPI
from g4f.integration.whatsapp import create_whatsapp_router

def on_message(message: dict):
    # message is Meta's raw WhatsApp message object, e.g.:
    # {"from": "3460...", "id": "...", "type": "text", "text": {"body": "..."}}
    ...  # log it, feed it into your sales pipeline, auto-reply, etc.

app = FastAPI()
app.include_router(create_whatsapp_router(on_message=on_message))
```

## Notes / limits

- This is the **official** API: sending is rate-limited and template-gated by
  Meta, and requires an approved template to message someone who hasn't
  messaged you in the last 24h. There is no way around this without violating
  Meta's policies.
- Never commit `.env` or paste your token/app secret anywhere public — anyone
  with `WHATSAPP_TOKEN` can send messages as your business number.
- Pricing: conversations are billed per category once you exceed the free
  tier; see Meta's current WhatsApp pricing page for your country.
