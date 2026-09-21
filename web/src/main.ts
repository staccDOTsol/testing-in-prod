import "./style.css";
import { connectWallet, hasInjectedWallet, onAccountsChanged } from "./lib/wallet";
import { lookupEnsName, resolveToAddress, shortAddress } from "./lib/ens";
import { loadStoredSession, signInWithEthereum, clearStoredSession } from "./lib/auth";
import { ChatSocket } from "./lib/ws";
import { isEncryptedPayload } from "./lib/lit-payload";
import type { ServerEnvelope, ChatMessage, Identity } from "./lib/types";
import type { JsonRpcSigner } from "ethers";

const DEFAULT_CHANNELS = ["general", "random", "dev"];

type View = { kind: "channel"; name: string } | { kind: "dm"; peer: string };

const state = {
  identity: null as Identity | null,
  signer: null as JsonRpcSigner | null,
  socket: null as ChatSocket | null,
  view: { kind: "channel", name: "general" } as View,
  channelMembers: new Map<string, string[]>(),
  joinedChannels: new Set<string>(),
  dmPeers: new Set<string>(),
  messages: new Map<string, ChatMessage[]>(), // viewKey -> messages
  ensNames: new Map<string, string | null>(), // address -> ens
};

const app = document.getElementById("app")!;

function viewKey(view: View): string {
  return view.kind === "channel" ? `#${view.name}` : `@${view.peer}`;
}

function messagesFor(view: View): ChatMessage[] {
  const key = viewKey(view);
  if (!state.messages.has(key)) state.messages.set(key, []);
  return state.messages.get(key)!;
}

function nickColor(address: string): string {
  let hash = 0;
  for (const ch of address) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360} 70% 65%)`;
}

async function displayName(address: string): Promise<string> {
  if (state.ensNames.has(address)) {
    const cached = state.ensNames.get(address);
    return cached || shortAddress(address);
  }
  const name = await lookupEnsName(address);
  state.ensNames.set(address, name);
  return name || shortAddress(address);
}

// ---------- top-level mount ----------
// The gate (pre-connect) and the shell (post-connect) are only rebuilt on
// identity changes. Everything that happens afterwards (new messages,
// presence, view switches) patches the already-mounted shell in place so an
// in-progress composer draft is never wiped out from under the user.

function mount() {
  app.innerHTML = "";
  if (!state.identity) {
    app.appendChild(renderGate());
    return;
  }
  app.appendChild(buildShell());
  renderSidebar();
  renderChatPane();
}

function renderGate(): HTMLElement {
  const el = document.createElement("div");
  el.className = "gate";
  el.innerHTML = `
    <div class="gate__box">
      <div class="gate__title">⌗ onchain-irc</div>
      <p class="gate__tagline">ENS identities. Wallet-signed sign-in. Lit-encrypted DMs and groupchats.</p>
      <button id="connect-btn" class="btn">${hasInjectedWallet() ? "Connect Wallet" : "No wallet found"}</button>
      <p class="gate__status" id="gate-status"></p>
    </div>
  `;
  const btn = el.querySelector<HTMLButtonElement>("#connect-btn")!;
  btn.disabled = !hasInjectedWallet();
  btn.addEventListener("click", handleConnect);
  return el;
}

function buildShell(): HTMLElement {
  const el = document.createElement("div");
  el.className = "app-shell";
  const identity = state.identity!;
  el.innerHTML = `
    <header class="topbar">
      <div class="brand">⌗ onchain-irc</div>
      <div class="identity">
        <span class="identity__dot"></span>
        <span id="identity-name">${identity.ens || shortAddress(identity.address)}</span>
        <button id="disconnect-btn" class="btn btn--ghost">sign out</button>
      </div>
    </header>
    <div class="body">
      <aside class="sidebar">
        <div class="sidebar__section">channels</div>
        <ul class="list" id="channel-list"></ul>
        <div class="sidebar__section">direct messages</div>
        <ul class="list" id="dm-list"></ul>
        <form id="new-dm-form" class="new-dm">
          <input id="new-dm-input" type="text" placeholder="ens or 0x… address" autocomplete="off" />
          <button type="submit" class="btn btn--ghost">+</button>
        </form>
      </aside>
      <main class="chat">
        <div class="chat__header">
          <span id="chat-title"></span>
          <span class="chat__meta" id="chat-meta"></span>
        </div>
        <div class="chat__log" id="chat-log"></div>
        <form id="composer" class="composer">
          <label class="composer__encrypt">
            <input type="checkbox" id="encrypt-toggle" /> 🔒 encrypt with Lit
          </label>
          <input id="composer-input" type="text" placeholder="say something…" autocomplete="off" />
          <button type="submit" class="btn">send</button>
        </form>
      </main>
    </div>
  `;
  el.querySelector("#disconnect-btn")!.addEventListener("click", handleDisconnect);
  el.querySelector<HTMLFormElement>("#new-dm-form")!.addEventListener("submit", handleNewDm);
  el.querySelector<HTMLFormElement>("#composer")!.addEventListener("submit", handleSend);
  return el;
}

// ---------- targeted (patch) rendering ----------

function renderSidebar() {
  const channelList = document.getElementById("channel-list");
  const dmList = document.getElementById("dm-list");
  if (!channelList || !dmList) return;

  channelList.innerHTML = "";
  for (const name of new Set([...DEFAULT_CHANNELS, ...state.joinedChannels])) {
    const li = document.createElement("li");
    const active = state.view.kind === "channel" && state.view.name === name;
    li.className = `list__item${active ? " list__item--active" : ""}`;
    li.textContent = `#${name}`;
    li.addEventListener("click", () => switchView({ kind: "channel", name }));
    channelList.appendChild(li);
  }

  dmList.innerHTML = "";
  for (const peer of state.dmPeers) {
    const li = document.createElement("li");
    const active = state.view.kind === "dm" && state.view.peer === peer;
    li.className = `list__item${active ? " list__item--active" : ""}`;
    li.textContent = shortAddress(peer);
    li.addEventListener("click", () => switchView({ kind: "dm", peer }));
    dmList.appendChild(li);
    displayName(peer).then((name) => {
      if (name) li.textContent = name;
    });
  }
}

function renderChatPane() {
  const title = document.getElementById("chat-title");
  const meta = document.getElementById("chat-meta");
  if (!title || !meta) return;
  if (state.view.kind === "channel") {
    title.textContent = `#${state.view.name}`;
    const members = state.channelMembers.get(state.view.name) || [];
    meta.textContent = `${members.length} online`;
  } else {
    title.textContent = `@ ${shortAddress(state.view.peer)}`;
    meta.textContent = "direct message · Lit-encrypted";
  }
  renderLog();
}

function renderLog() {
  const log = document.getElementById("chat-log");
  if (!log) return;
  log.innerHTML = "";
  for (const msg of messagesFor(state.view)) log.appendChild(renderMessage(msg));
  log.scrollTop = log.scrollHeight;
}

function renderMessage(msg: ChatMessage): HTMLElement {
  const row = document.createElement("div");
  row.className = "msg";
  const time = new Date(msg.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const nick = document.createElement("span");
  nick.className = "msg__nick";
  nick.style.color = nickColor(msg.from);
  nick.textContent = shortAddress(msg.from);
  displayName(msg.from).then((name) => {
    if (name) nick.textContent = name;
  });

  const body = document.createElement("span");
  body.className = "msg__body";

  if (msg.encrypted) {
    if (msg.decrypted !== undefined) {
      body.textContent = msg.decrypted;
    } else {
      const btn = document.createElement("button");
      btn.className = "btn btn--ghost btn--sm";
      btn.textContent = "🔒 decrypt";
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.textContent = "decrypting…";
        try {
          const payload = isEncryptedPayload(msg.body);
          if (!payload || !state.signer || !state.identity) throw new Error("cannot decrypt");
          const { decryptPayload } = await import("./lib/lit");
          msg.decrypted = await decryptPayload(payload, state.signer, state.identity.address);
          renderLog();
        } catch (err) {
          btn.disabled = false;
          btn.textContent = "🔒 decrypt failed — retry";
          console.error(err);
        }
      });
      body.appendChild(btn);
    }
  } else {
    body.textContent = msg.body;
  }

  row.append(`[${time}] `, nick, ": ", body);
  return row;
}

// ---------- actions ----------

async function handleConnect() {
  const statusEl = document.getElementById("gate-status");
  try {
    setStatus(statusEl, "requesting wallet connection…");
    const { address, signer } = await connectWallet();
    setStatus(statusEl, "resolving ENS name…");
    const ens = await lookupEnsName(address);
    state.ensNames.set(address, ens);

    const stored = loadStoredSession();
    let token = stored?.address === address ? stored.token : null;
    if (!token) {
      setStatus(statusEl, "sign the message in your wallet to authenticate…");
      token = await signInWithEthereum(address, signer);
    }

    state.identity = { address, ens, token };
    state.signer = signer;
    connectSocket();
    onAccountsChanged(() => window.location.reload());
    mount();
  } catch (err) {
    console.error(err);
    setStatus(statusEl, err instanceof Error ? err.message : "connection failed");
  }
}

function setStatus(el: HTMLElement | null, text: string) {
  if (el) el.textContent = text;
}

function handleDisconnect() {
  state.socket?.close();
  state.socket = null;
  state.identity = null;
  state.signer = null;
  clearStoredSession();
  mount();
}

function connectSocket() {
  if (!state.identity) return;
  const socket = new ChatSocket(state.identity.token);
  state.socket = socket;
  socket.on(handleServerMessage);
  socket.send({ type: "join", channel: state.view.kind === "channel" ? state.view.name : "general" });
}

function handleServerMessage(msg: ServerEnvelope) {
  switch (msg.type) {
    case "joined":
    case "presence": {
      state.channelMembers.set(msg.channel, msg.members);
      state.joinedChannels.add(msg.channel);
      renderSidebar();
      if (state.view.kind === "channel" && state.view.name === msg.channel) renderChatPane();
      return;
    }
    case "message": {
      const key = viewKey({ kind: "channel", name: msg.channel });
      messagesFor({ kind: "channel", name: msg.channel }).push({
        id: crypto.randomUUID(),
        scope: { kind: "channel", name: msg.channel },
        from: msg.from,
        body: msg.body,
        encrypted: msg.encrypted,
        ts: msg.ts,
      });
      if (viewKey(state.view) === key) renderLog();
      return;
    }
    case "dm": {
      const me = state.identity?.address;
      const peer = msg.from === me ? msg.to : msg.from;
      const isNewPeer = !state.dmPeers.has(peer);
      state.dmPeers.add(peer);
      const key = viewKey({ kind: "dm", peer });
      messagesFor({ kind: "dm", peer }).push({
        id: crypto.randomUUID(),
        scope: { kind: "dm", peer },
        from: msg.from,
        body: msg.body,
        encrypted: msg.encrypted,
        ts: msg.ts,
      });
      if (isNewPeer) renderSidebar();
      if (viewKey(state.view) === key) renderLog();
      return;
    }
    case "error":
      console.warn("server error:", msg.message);
  }
}

function switchView(view: View) {
  state.view = view;
  if (view.kind === "channel" && !state.joinedChannels.has(view.name)) {
    state.socket?.send({ type: "join", channel: view.name });
  }
  renderSidebar();
  renderChatPane();
}

async function handleNewDm(e: SubmitEvent) {
  e.preventDefault();
  const input = (e.target as HTMLFormElement).querySelector<HTMLInputElement>("#new-dm-input")!;
  const value = input.value.trim();
  if (!value) return;
  const address = await resolveToAddress(value);
  if (!address) {
    alert(`could not resolve "${value}" to an address`);
    return;
  }
  state.dmPeers.add(address);
  input.value = "";
  switchView({ kind: "dm", peer: address });
}

async function handleSend(e: SubmitEvent) {
  e.preventDefault();
  const form = e.target as HTMLFormElement;
  const input = form.querySelector<HTMLInputElement>("#composer-input")!;
  const encryptToggle = form.querySelector<HTMLInputElement>("#encrypt-toggle")!;
  const text = input.value.trim();
  if (!text || !state.socket || !state.identity) return;

  let body = text;
  const encrypted = encryptToggle.checked;
  if (encrypted) {
    input.disabled = true;
    try {
      const recipients =
        state.view.kind === "dm"
          ? [state.identity.address, state.view.peer]
          : [...(state.channelMembers.get(state.view.name) || [state.identity.address])];
      const { encryptForAddresses } = await import("./lib/lit");
      const payload = await encryptForAddresses(text, recipients);
      body = JSON.stringify(payload);
    } catch (err) {
      console.error(err);
      alert("encryption failed — see console");
      input.disabled = false;
      return;
    }
    input.disabled = false;
  }

  if (state.view.kind === "channel") {
    state.socket.send({ type: "message", channel: state.view.name, body, encrypted });
  } else {
    state.socket.send({ type: "dm", to: state.view.peer, body, encrypted });
  }
  input.value = "";
}

// ---------- boot ----------

mount();
