import http from "node:http";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import { ethers } from "ethers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIST = path.join(__dirname, "../../web/dist");

const PORT = process.env.PORT || 8787;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const NONCE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_CHANNELS = ["general", "random", "dev"];
const HISTORY_LIMIT = 200;

// --- in-memory state (swap for a real DB in production) ---
const nonces = new Map(); // address -> { nonce, expires }
const sessions = new Map(); // token -> { address, expires }
const channels = new Map(); // name -> { messages: [] }
for (const name of DEFAULT_CHANNELS) channels.set(name, { messages: [] });

const sockets = new Map(); // ws -> { address, channels: Set<string> }

function getOrCreateChannel(name) {
  if (!channels.has(name)) channels.set(name, { messages: [] });
  return channels.get(name);
}

function pushHistory(channel, entry) {
  channel.messages.push(entry);
  if (channel.messages.length > HISTORY_LIMIT) channel.messages.shift();
}

function buildSignInMessage(address, nonce) {
  const issuedAt = new Date().toISOString();
  return [
    `app.burnpr.fun wants you to sign in with your Ethereum account:`,
    address,
    ``,
    `Sign in to app.burnpr.fun, a proof of concept for burnpr.fun. This request will not trigger a blockchain transaction or cost any gas.`,
    ``,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");
}

function requireSession(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  const session = token && sessions.get(token);
  if (!session || session.expires < Date.now()) {
    return res.status(401).json({ error: "unauthorized" });
  }
  req.address = session.address;
  next();
}

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/auth/nonce", (req, res) => {
  const address = String(req.query.address || "").toLowerCase();
  if (!ethers.isAddress(address)) {
    return res.status(400).json({ error: "invalid address" });
  }
  const nonce = crypto.randomBytes(16).toString("hex");
  const message = buildSignInMessage(address, nonce);
  nonces.set(address, { message, expires: Date.now() + NONCE_TTL_MS });
  res.json({ message });
});

app.post("/api/auth/verify", (req, res) => {
  const { address, signature } = req.body || {};
  if (!ethers.isAddress(address) || typeof signature !== "string") {
    return res.status(400).json({ error: "invalid request" });
  }
  const lower = address.toLowerCase();
  const stored = nonces.get(lower);
  if (!stored || stored.expires < Date.now()) {
    return res.status(400).json({ error: "nonce expired, request a new one" });
  }
  let recovered;
  try {
    recovered = ethers.verifyMessage(stored.message, signature);
  } catch {
    return res.status(400).json({ error: "bad signature" });
  }
  if (recovered.toLowerCase() !== lower) {
    return res.status(401).json({ error: "signature does not match address" });
  }
  nonces.delete(lower);
  const token = crypto.randomUUID();
  sessions.set(token, { address: lower, expires: Date.now() + SESSION_TTL_MS });
  res.json({ token, address: lower, expiresIn: SESSION_TTL_MS });
});

app.get("/api/channels", (_req, res) => {
  res.json({
    channels: [...channels.entries()].map(([name, ch]) => ({
      name,
      lastMessageAt: ch.messages.at(-1)?.ts ?? null,
    })),
  });
});

app.get("/api/channels/:name/messages", requireSession, (req, res) => {
  const ch = channels.get(req.params.name);
  res.json({ messages: ch ? ch.messages : [] });
});

app.use(express.static(WEB_DIST));
app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(WEB_DIST, "index.html"), (err) => {
    if (err) res.status(404).send("not built yet — run `npm run build`");
  });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

function send(ws, payload) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
}

function broadcastToChannel(channelName, payload) {
  for (const [ws, meta] of sockets) {
    if (meta.channels.has(channelName)) send(ws, payload);
  }
}

function findSocketsForAddress(address) {
  const found = [];
  for (const [ws, meta] of sockets) {
    if (meta.address === address) found.push(ws);
  }
  return found;
}

function membersOf(channelName) {
  const members = new Set();
  for (const meta of sockets.values()) {
    if (meta.address && meta.channels.has(channelName)) members.add(meta.address);
  }
  return [...members];
}

wss.on("connection", (ws) => {
  sockets.set(ws, { address: null, channels: new Set() });

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return send(ws, { type: "error", message: "invalid json" });
    }
    const meta = sockets.get(ws);

    if (msg.type === "auth") {
      const session = sessions.get(msg.token);
      if (!session || session.expires < Date.now()) {
        return send(ws, { type: "error", message: "invalid or expired session" });
      }
      meta.address = session.address;
      return send(ws, { type: "auth-ok", address: session.address });
    }

    if (!meta.address) {
      return send(ws, { type: "error", message: "authenticate first" });
    }

    if (msg.type === "join" && typeof msg.channel === "string") {
      getOrCreateChannel(msg.channel);
      meta.channels.add(msg.channel);
      const members = membersOf(msg.channel);
      send(ws, { type: "joined", channel: msg.channel, members });
      return broadcastToChannel(msg.channel, { type: "presence", channel: msg.channel, members });
    }

    if (msg.type === "message" && typeof msg.channel === "string" && typeof msg.body === "string") {
      const ch = getOrCreateChannel(msg.channel);
      const entry = {
        type: "message",
        channel: msg.channel,
        from: meta.address,
        body: msg.body,
        encrypted: !!msg.encrypted,
        ts: Date.now(),
      };
      pushHistory(ch, entry);
      return broadcastToChannel(msg.channel, entry);
    }

    if (msg.type === "dm" && typeof msg.to === "string" && typeof msg.body === "string") {
      const to = msg.to.toLowerCase();
      const entry = {
        type: "dm",
        from: meta.address,
        to,
        body: msg.body,
        encrypted: !!msg.encrypted,
        ts: Date.now(),
      };
      for (const target of findSocketsForAddress(to)) send(target, entry);
      for (const target of findSocketsForAddress(meta.address)) send(target, entry);
      return;
    }

    send(ws, { type: "error", message: `unknown message type: ${msg.type}` });
  });

  ws.on("close", () => {
    const meta = sockets.get(ws);
    sockets.delete(ws);
    if (meta) {
      for (const channel of meta.channels) {
        broadcastToChannel(channel, { type: "presence", channel, members: membersOf(channel) });
      }
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`app.burnpr.fun server listening on 0.0.0.0:${PORT}`);
});
