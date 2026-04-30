export interface NonceCache {
  issueNonce(nonce: string, expiresAt: number, now?: number): void;
  getIssuedNonceExpiry(nonce: string, now?: number): number | null;
  hasNonce(nonce: string, now?: number): boolean;
  consumeNonce(nonce: string, expiresAt: number, now?: number): boolean;
  prune(now?: number): void;
}

export function createNonceCache(): NonceCache {
  const issued = new Map<string, number>();
  const consumed = new Map<string, number>();

  function prune(now = Date.now()): void {
    for (const [nonce, expiresAt] of issued) {
      if (expiresAt <= now) {
        issued.delete(nonce);
      }
    }
    for (const [nonce, expiresAt] of consumed) {
      if (expiresAt <= now) {
        consumed.delete(nonce);
      }
    }
  }

  function issueNonce(
    nonce: string,
    expiresAt: number,
    now = Date.now(),
  ): void {
    prune(now);
    issued.set(nonce, expiresAt);
  }

  function getIssuedNonceExpiry(
    nonce: string,
    now = Date.now(),
  ): number | null {
    prune(now);
    return issued.get(nonce) ?? null;
  }

  function hasNonce(nonce: string, now = Date.now()): boolean {
    prune(now);
    return consumed.has(nonce);
  }

  function consumeNonce(
    nonce: string,
    expiresAt: number,
    now = Date.now(),
  ): boolean {
    prune(now);
    if (consumed.has(nonce)) {
      return false;
    }
    if (issued.get(nonce) !== expiresAt) {
      return false;
    }
    issued.delete(nonce);
    consumed.set(nonce, expiresAt);
    return true;
  }

  return {
    issueNonce,
    getIssuedNonceExpiry,
    hasNonce,
    consumeNonce,
    prune,
  };
}
