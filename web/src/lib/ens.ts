import { JsonRpcProvider, isAddress } from "ethers";

// ENS only lives on mainnet, so resolution always goes through a dedicated
// mainnet RPC regardless of which chain the connected wallet is on.
const RPC_URL = import.meta.env.VITE_MAINNET_RPC_URL || "https://ethereum-rpc.publicnode.com";

let provider: JsonRpcProvider | null = null;
function mainnetProvider(): JsonRpcProvider {
  provider ??= new JsonRpcProvider(RPC_URL, 1, { staticNetwork: true });
  return provider;
}

const nameCache = new Map<string, string | null>();
const addressCache = new Map<string, string | null>();

export async function lookupEnsName(address: string): Promise<string | null> {
  const key = address.toLowerCase();
  if (nameCache.has(key)) return nameCache.get(key)!;
  try {
    const name = await mainnetProvider().lookupAddress(key);
    nameCache.set(key, name);
    return name;
  } catch {
    nameCache.set(key, null);
    return null;
  }
}

/** Accepts either a 0x address or an ENS name and returns a checksummed address. */
export async function resolveToAddress(input: string): Promise<string | null> {
  const trimmed = input.trim();
  if (isAddress(trimmed)) return trimmed.toLowerCase();
  if (addressCache.has(trimmed)) return addressCache.get(trimmed)!;
  try {
    const resolved = await mainnetProvider().resolveName(trimmed);
    const lower = resolved ? resolved.toLowerCase() : null;
    addressCache.set(trimmed, lower);
    return lower;
  } catch {
    addressCache.set(trimmed, null);
    return null;
  }
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
