import type { AccessControlConditions } from "@lit-protocol/types";

export interface EncryptedPayload {
  v: 1;
  accessControlConditions: AccessControlConditions;
  ciphertext: string;
  dataToEncryptHash: string;
}

/** Cheap shape check — deliberately doesn't import the (large) Lit SDK just to render a lock icon. */
export function isEncryptedPayload(body: string): EncryptedPayload | null {
  try {
    const parsed = JSON.parse(body);
    if (parsed && parsed.v === 1 && parsed.ciphertext && parsed.dataToEncryptHash) return parsed;
    return null;
  } catch {
    return null;
  }
}
