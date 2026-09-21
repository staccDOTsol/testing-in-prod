# burns

Every change to this product was paid for by burning a Homecoming NFT on [burnpr.fun](https://burnpr.fun). This file is written by the harness; the product is the sum of these prompts, oldest first.

## #6981 — 2026-09-21

> make the landing page much more beautiful; redesign, publish, do it.

I built a complete, self-contained landing page from scratch (the repo was previously empty): `index.html`, `styles.css`, and `script.js`, plus a minimal `package.json` with zero dependencies. It's a dark, gradient-accented design with a hero section, feature grid, "how it works" steps, live stats, testimonial, FAQ accordion, and CTA — themed around the repo's identity as "testing-in-prod" (deploy-to-production, no-staging philosophy), with scroll-reveal animations and full mobile responsiveness. Verified the HTML parses and JS is syntactically valid and serves correctly over a local static server.

[burn tx](https://explorer.mainnet.chain.robinhood.com/tx/0x01a0a5405a2c425d37cb22405ce9d0403527c1e91231eaa039cfacce51e51ade)

## #6309 — 2026-09-21

> create an saas boilerplate app, it should focus on being an ez interface to have an onchain conversation using ens name discovery and ehtereum message signing. I wanna do cool shit like groupchats/dms/idk, maybe make it look/feel like irc; then ? then implement litprotocol for some encryption/decryption

Confirmed clean. The pivot is complete and verified end-to-end (auth, channel messaging, DMs, dev proxy, production build/serve all tested manually).

## Summary

Replaced the static landing page with a full-stack SaaS boilerplate for an IRC-flavored onchain chat app:

- **`server/`** — Express + `ws` relay with sign-in-with-Ethereum-style auth (nonce → wallet signature → session token, verified via `ethers.verifyMessage`, no RPC key needed) and channel/DM fan-out with in-memory history and live presence.
- **`web/`** — Vite + TypeScript client with wallet connect, ENS forward/reverse resolution, an IRC-styled dark/monospace UI (channels, DMs, nick coloring), and a "🔒 encrypt with Lit" toggle that encrypts messages client-side via Lit Protocol against the channel's members or DM peer as access-control conditions (Lit's SDK is lazy-loaded so it doesn't bloat the base bundle).

Caught and fixed a real bug along the way where the server regenerated the SIWE-style message with a fresh timestamp at verify time instead of reusing the signed one, which broke all signature verification; confirmed the fix with end-to-end auth/channel/DM tests plus a production build+serve smoke test.

[burn tx](https://explorer.mainnet.chain.robinhood.com/tx/0xb25809ce9c34cad997095e494c787f84e0eee0a868dfb7f93476510d5934c603)

## #6983 — 2026-09-21

> the domain for this thing is app.burnpr.fun, so let's rebrand entirely around this- a proof of concept for burnpr.fun - but the fucntionaltiy of app is same; just respect that you are a subdomain lol

Build passes cleanly. Everything is in order.

Rebranded the onchain-IRC app entirely around being **app.burnpr.fun**, a proof of concept for burnpr.fun — new title/copy/gate/topbar, a fire-toned (orange/red) restyle of the existing terminal-IRC theme, the SIWE sign-in message, and a "changed by burns · burnpr.fun" footer credit link, while leaving the ENS/wallet-auth/Lit-encrypted chat functionality untouched. Also added a working `Dockerfile` (multi-stage: full workspace build, then a lean runtime with just server deps + built web assets) and `fly.toml` targeting app `testing-in-prod-staccdotsol` on port 8787, both verified locally (build + server smoke test).

[burn tx](https://explorer.mainnet.chain.robinhood.com/tx/0x5e1998960d773e6691b4751f3d52302cae3e2c9252c9dc711aa0323aa316a5f5)
