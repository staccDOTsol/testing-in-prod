# app.burnpr.fun

A proof of concept for [burnpr.fun](https://burnpr.fun) — a product where every feature exists because someone burned an NFT and spent one prompt on it. This app is deployed at the `app.burnpr.fun` subdomain, itself a burn: an IRC-flavored onchain chat SaaS boilerplate, unchanged in function, restyled around its home:

- **Identity**: your ENS name, resolved client-side — no separate account system.
- **Auth**: sign-in-with-Ethereum-style flow — sign a nonce with your wallet, trade it for a session token. No passwords, no email.
- **Chat**: IRC-style channels (`#general`, `#random`, `#dev`, or any `#channel` you join) plus wallet-to-wallet DMs, all over a WebSocket relay.
- **Encryption**: toggle "🔒 encrypt with Lit" on any message to encrypt it client-side with [Lit Protocol](https://litprotocol.com) against the current channel's members (or the DM peer) as access-control conditions. Only wallets that were in the recipient set can decrypt — the server only ever relays and stores ciphertext.

## Structure

```
server/   Express + ws relay: nonce/verify auth, channel + DM fan-out, in-memory history
web/      Vite + TypeScript client: wallet connect, ENS lookups, Lit encrypt/decrypt, the UI
```

The server is intentionally storage-light (in-memory Maps) so it's easy to read end to end — swap in a real datastore before you ship this for real. It has no RPC dependency of its own: signature verification is pure crypto (`ethers.verifyMessage`), so no API keys are required to run it.

## Running locally

```bash
npm install               # installs both workspaces
npm run dev                # runs the server (:8787) and the Vite dev server (:5173) together
```

Open http://localhost:5173, connect a wallet, and sign the sign-in message. The Vite dev server proxies `/api` and `/ws` to the backend.

Copy `web/.env.example` to `web/.env` to point ENS lookups at your own RPC or switch the Lit network (defaults: a public mainnet RPC, and Lit's `datil-dev` test network).

> Lit Protocol's network generations move fast — `@lit-protocol/lit-node-client@7.x` (used here, targeting `datil-*`) is npm's current `latest`, but Lit's next generation (`naga`) was in alpha at the time this was written. Check [Lit's docs](https://developer.litprotocol.com) before shipping this to production.

## Building for production

```bash
npm run build              # builds web/dist
npm start                  # serves web/dist from the same Express process, on $PORT (default 8787)
```

## Extending

- Swap the in-memory `Map`s in `server/src/index.js` for a real database once you need persistence across restarts.
- The Lit access-control conditions in `web/src/lib/lit.ts` gate on wallet address (`accessControlConditionsFor`) — swap in `evmContractConditions` if you want token-gated rooms instead.
- Slash-command style extensions (`/join`, `/msg`) are a natural next step for the composer in `web/src/main.ts`.
