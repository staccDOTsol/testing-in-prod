import type { ClientEnvelope, ServerEnvelope } from "./types";

type Listener = (msg: ServerEnvelope) => void;

export class ChatSocket {
  private ws: WebSocket;
  private listeners = new Set<Listener>();
  private queue: ClientEnvelope[] = [];
  private open = false;

  constructor(token: string) {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    this.ws = new WebSocket(`${proto}//${location.host}/ws`);
    this.ws.addEventListener("open", () => {
      this.open = true;
      this.send({ type: "auth", token });
      for (const msg of this.queue.splice(0)) this.rawSend(msg);
    });
    this.ws.addEventListener("message", (event) => {
      let parsed: ServerEnvelope;
      try {
        parsed = JSON.parse(event.data);
      } catch {
        return;
      }
      for (const listener of this.listeners) listener(parsed);
    });
  }

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  send(msg: ClientEnvelope) {
    if (this.open) this.rawSend(msg);
    else this.queue.push(msg);
  }

  private rawSend(msg: ClientEnvelope) {
    this.ws.send(JSON.stringify(msg));
  }

  close() {
    this.ws.close();
  }
}
