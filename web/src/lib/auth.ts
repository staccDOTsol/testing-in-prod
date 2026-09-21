import type { JsonRpcSigner } from "ethers";

const SESSION_KEY = "app.burnpr.fun:session";

interface StoredSession {
  address: string;
  token: string;
}

export function loadStoredSession(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

function storeSession(session: StoredSession) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearStoredSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

/** Sign-in-with-Ethereum-flavored flow: fetch a nonce, sign it, trade the signature for a session token. */
export async function signInWithEthereum(address: string, signer: JsonRpcSigner): Promise<string> {
  const nonceRes = await fetch(`/api/auth/nonce?address=${address}`);
  if (!nonceRes.ok) throw new Error("could not fetch sign-in nonce");
  const { message } = (await nonceRes.json()) as { message: string };

  const signature = await signer.signMessage(message);

  const verifyRes = await fetch("/api/auth/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address, signature }),
  });
  if (!verifyRes.ok) {
    const { error } = await verifyRes.json().catch(() => ({ error: "sign-in failed" }));
    throw new Error(error || "sign-in failed");
  }
  const { token } = (await verifyRes.json()) as { token: string };
  storeSession({ address, token });
  return token;
}
