# burnpr

Proof-of-concept front end for **app.burnpr.fun**.

Burn one Homecoming NFT on Robinhood Chain. In return you get one prompt that changes a real
product — whatever you want, however you want it. An agent does the work, opens the PR, merges
it, and redeploys. Nobody reviews it. That's the whole thing.

This deploy is itself an artifact of the mechanic it describes: it was shipped by burning a
prompt against this repo.

## Structure

```
public/        static site: index.html, styles.css, script.js
server.js      zero-dependency Node static file server ($PORT, defaults to 8080)
```

No build step, no framework, no dependencies — just static files served over plain `http`.

## Running locally

```bash
npm start
```

Open http://localhost:8080.

## Deploying

The repo ships with a `Dockerfile` and `fly.toml` targeting Fly.io:

```bash
flyctl deploy --remote-only
```
