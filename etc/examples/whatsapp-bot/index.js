const path = require("path");
const qrcode = require("qrcode-terminal");
const pino = require("pino");
const { Boom } = require("@hapi/boom");
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");

// "g4f" (default, talks to a local g4f API server) or "anthropic" (official Claude API, needs ANTHROPIC_API_KEY)
const BACKEND = process.env.BACKEND || "g4f";

const G4F_API_URL = process.env.G4F_API_URL || "http://localhost:1337/v1/chat/completions";
const G4F_MODEL = process.env.G4F_MODEL || "gpt-4o-mini";
const G4F_API_KEY = process.env.G4F_API_KEY || "";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";
const ANTHROPIC_MAX_TOKENS = parseInt(process.env.ANTHROPIC_MAX_TOKENS || "1024", 10);

const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || "You are a helpful assistant answering over WhatsApp. Keep replies short.";
// Comma-separated list of phone numbers (with country code, no "+") allowed to talk to the bot.
// Leave empty to accept messages from anyone who writes to this WhatsApp number.
const ALLOWED_NUMBERS = (process.env.ALLOWED_NUMBERS || "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);

const AUTH_DIR = path.join(__dirname, "auth");

async function askG4f(userText) {
    const response = await fetch(G4F_API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(G4F_API_KEY ? { Authorization: `Bearer ${G4F_API_KEY}` } : {}),
        },
        body: JSON.stringify({
            model: G4F_MODEL,
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: userText },
            ],
        }),
    });
    if (!response.ok) {
        throw new Error(`g4f API returned ${response.status}: ${await response.text()}`);
    }
    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || "(empty response)";
}

async function askAnthropic(userText) {
    if (!ANTHROPIC_API_KEY) {
        throw new Error("ANTHROPIC_API_KEY is not set. Get one at https://console.anthropic.com/");
    }
    const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
            model: ANTHROPIC_MODEL,
            max_tokens: ANTHROPIC_MAX_TOKENS,
            system: SYSTEM_PROMPT,
            messages: [{ role: "user", content: userText }],
        }),
    });
    if (!response.ok) {
        throw new Error(`Anthropic API returned ${response.status}: ${await response.text()}`);
    }
    const data = await response.json();
    return data.content?.[0]?.text?.trim() || "(empty response)";
}

function askAI(userText) {
    return BACKEND === "anthropic" ? askAnthropic(userText) : askG4f(userText);
}

function isAllowed(jid) {
    if (ALLOWED_NUMBERS.length === 0) return true;
    const number = jid.split("@")[0];
    return ALLOWED_NUMBERS.includes(number);
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: "warn" }),
        printQRInTerminal: false,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log("\nScan this QR code with WhatsApp (Linked Devices > Link a device):\n");
            qrcode.generate(qr, { small: true });
        }

        if (connection === "close") {
            const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log("Connection closed.", { statusCode, shouldReconnect });
            if (shouldReconnect) {
                startBot();
            } else {
                console.log("Logged out. Delete the 'auth' folder and restart to link again.");
            }
        } else if (connection === "open") {
            console.log("Connected to WhatsApp.");
        }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
        if (type !== "notify") return;

        for (const msg of messages) {
            if (!msg.message || msg.key.fromMe) continue;

            const jid = msg.key.remoteJid;
            if (!jid || jid === "status@broadcast") continue;
            if (!isAllowed(jid)) continue;

            const text =
                msg.message.conversation ||
                msg.message.extendedTextMessage?.text ||
                msg.message.imageMessage?.caption ||
                "";
            if (!text) continue;

            try {
                await sock.sendPresenceUpdate("composing", jid);
                const reply = await askAI(text);
                await sock.sendMessage(jid, { text: reply });
            } catch (err) {
                console.error("Failed to answer message:", err);
                await sock.sendMessage(jid, {
                    text: "Sorry, something went wrong talking to the AI backend.",
                });
            }
        }
    });
}

startBot().catch((err) => {
    console.error("Fatal error starting the bot:", err);
    process.exit(1);
});
