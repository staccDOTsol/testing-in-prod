export type ClientEnvelope =
  | { type: "auth"; token: string }
  | { type: "join"; channel: string }
  | { type: "message"; channel: string; body: string; encrypted: boolean }
  | { type: "dm"; to: string; body: string; encrypted: boolean };

export type ServerEnvelope =
  | { type: "auth-ok"; address: string }
  | { type: "error"; message: string }
  | { type: "joined"; channel: string; members: string[] }
  | { type: "presence"; channel: string; members: string[] }
  | {
      type: "message";
      channel: string;
      from: string;
      body: string;
      encrypted: boolean;
      ts: number;
    }
  | {
      type: "dm";
      from: string;
      to: string;
      body: string;
      encrypted: boolean;
      ts: number;
    };

export interface Identity {
  address: string;
  ens: string | null;
  token: string;
}

export interface ChatMessage {
  id: string;
  scope: { kind: "channel"; name: string } | { kind: "dm"; peer: string };
  from: string;
  body: string;
  encrypted: boolean;
  decrypted?: string;
  ts: number;
}
