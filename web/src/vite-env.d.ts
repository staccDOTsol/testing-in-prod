/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MAINNET_RPC_URL?: string;
  readonly VITE_LIT_NETWORK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
