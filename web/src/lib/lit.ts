import { LitNodeClient } from "@lit-protocol/lit-node-client";
import { encryptString, decryptToString } from "@lit-protocol/encryption";
import { LitAccessControlConditionResource, createSiweMessageWithRecaps, generateAuthSig } from "@lit-protocol/auth-helpers";
import { LIT_NETWORK, LIT_ABILITY } from "@lit-protocol/constants";
import type { AccessControlConditions, SessionSigsMap } from "@lit-protocol/types";
import type { JsonRpcSigner } from "ethers";
import type { EncryptedPayload } from "./lit-payload";

const CHAIN = "ethereum";
const NETWORK = (import.meta.env.VITE_LIT_NETWORK ||
  LIT_NETWORK.DatilDev) as (typeof LIT_NETWORK)[keyof typeof LIT_NETWORK];

// Lit's public node endpoints have gotten flaky (TLS/handshake failures against
// yellowstone-rpc.litprotocol.com) as Lit rolls out network upgrades. Bound the connect
// attempt so a bad node doesn't hang the UI, and drop the cached promise on failure —
// otherwise every future call would just replay the same stuck rejection forever.
const CONNECT_TIMEOUT_MS = 12_000;

let clientPromise: Promise<LitNodeClient> | null = null;
function getClient(): Promise<LitNodeClient> {
  clientPromise ??= connectClient().catch((err) => {
    clientPromise = null;
    throw err;
  });
  return clientPromise;
}

async function connectClient(): Promise<LitNodeClient> {
  const client = new LitNodeClient({ litNetwork: NETWORK, debug: false });
  await Promise.race([
    client.connect(),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("Lit Protocol's network is unreachable right now — try again in a bit.")),
        CONNECT_TIMEOUT_MS,
      ),
    ),
  ]);
  return client;
}

/** "Any of these wallets can decrypt" — used for both 2-party DMs and groupchat members. */
function accessControlConditionsFor(addresses: string[]): AccessControlConditions {
  const unique = [...new Set(addresses.map((a) => a.toLowerCase()))];
  const conditions: AccessControlConditions = [];
  unique.forEach((address, i) => {
    if (i > 0) conditions.push({ operator: "or" } as never);
    conditions.push({
      contractAddress: "",
      standardContractType: "",
      chain: CHAIN,
      method: "",
      parameters: [":userAddress"],
      returnValueTest: { comparator: "=", value: address },
    } as never);
  });
  return conditions;
}

export async function encryptForAddresses(text: string, addresses: string[]): Promise<EncryptedPayload> {
  const litNodeClient = await getClient();
  const accessControlConditions = accessControlConditionsFor(addresses);
  const { ciphertext, dataToEncryptHash } = await encryptString(
    { accessControlConditions, dataToEncrypt: text },
    litNodeClient,
  );
  return { v: 1, accessControlConditions, ciphertext, dataToEncryptHash };
}

const sessionSigsCache = new Map<string, { sigs: SessionSigsMap; expires: number }>();

async function getSessionSigsForAddress(signer: JsonRpcSigner, address: string): Promise<SessionSigsMap> {
  const cached = sessionSigsCache.get(address);
  if (cached && cached.expires > Date.now()) return cached.sigs;

  const litNodeClient = await getClient();
  const expiration = new Date(Date.now() + 1000 * 60 * 30).toISOString();

  const sessionSigs = await litNodeClient.getSessionSigs({
    chain: CHAIN,
    expiration,
    resourceAbilityRequests: [
      {
        resource: new LitAccessControlConditionResource("*"),
        ability: LIT_ABILITY.AccessControlConditionDecryption,
      },
    ],
    authNeededCallback: async ({ uri, expiration: exp, resourceAbilityRequests, nonce }) => {
      const toSign = await createSiweMessageWithRecaps({
        uri: uri!,
        expiration: exp!,
        resources: resourceAbilityRequests ?? [],
        walletAddress: address,
        nonce: nonce!,
        litNodeClient,
      });
      return generateAuthSig({ signer, toSign, address });
    },
  });

  sessionSigsCache.set(address, { sigs: sessionSigs, expires: Date.now() + 1000 * 60 * 25 });
  return sessionSigs;
}

export async function decryptPayload(
  payload: EncryptedPayload,
  signer: JsonRpcSigner,
  address: string,
): Promise<string> {
  const litNodeClient = await getClient();
  const sessionSigs = await getSessionSigsForAddress(signer, address);
  return decryptToString(
    {
      accessControlConditions: payload.accessControlConditions,
      ciphertext: payload.ciphertext,
      dataToEncryptHash: payload.dataToEncryptHash,
      chain: CHAIN,
      sessionSigs,
    },
    litNodeClient,
  );
}
