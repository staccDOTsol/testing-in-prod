import { BrowserProvider, type JsonRpcSigner } from "ethers";

declare global {
  interface Window {
    ethereum?: import("ethers").Eip1193Provider & {
      on?: (event: string, cb: (...args: unknown[]) => void) => void;
      removeListener?: (event: string, cb: (...args: unknown[]) => void) => void;
    };
  }
}

export function hasInjectedWallet(): boolean {
  return typeof window !== "undefined" && !!window.ethereum;
}

export async function connectWallet(): Promise<{
  address: string;
  signer: JsonRpcSigner;
  provider: BrowserProvider;
}> {
  if (!window.ethereum) {
    throw new Error("No injected wallet found. Install MetaMask or another EIP-1193 wallet.");
  }
  const provider = new BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  const signer = await provider.getSigner();
  const address = (await signer.getAddress()).toLowerCase();
  return { address, signer, provider };
}

export function onAccountsChanged(cb: (accounts: string[]) => void): () => void {
  window.ethereum?.on?.("accountsChanged", cb as (...args: unknown[]) => void);
  return () => window.ethereum?.removeListener?.("accountsChanged", cb as (...args: unknown[]) => void);
}
