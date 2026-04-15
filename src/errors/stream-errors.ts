import type { PublicKey } from "@solana/web3.js";

function fixPrototype(instance: Error, ctor: Function) {
  Object.setPrototypeOf(instance, ctor.prototype);
}

export class StreamInsufficientBalanceError extends Error {
  constructor(
    readonly mandate: PublicKey,
    readonly required: bigint,
    readonly available: bigint,
  ) {
    super(
      `Stream ${mandate.toBase58()}: insufficient balance — need ${required}, have ${available}`,
    );
    this.name = "StreamInsufficientBalanceError";
    fixPrototype(this, new.target);
  }
}

export class StreamMinIntervalError extends Error {
  constructor(
    readonly mandate: PublicKey,
    readonly elapsed: bigint,
    readonly minInterval: bigint,
  ) {
    super(
      `Stream ${mandate.toBase58()}: ${elapsed}s < ${minInterval}s min_settle_interval`,
    );
    this.name = "StreamMinIntervalError";
    fixPrototype(this, new.target);
  }
}

export class StreamTerminalStatusError extends Error {
  constructor(
    readonly mandate: PublicKey,
    readonly status: string,
  ) {
    super(`Stream ${mandate.toBase58()} is ${status}; no mutations permitted`);
    this.name = "StreamTerminalStatusError";
    fixPrototype(this, new.target);
  }
}

export class WrongAccountTypeError extends Error {
  constructor(
    readonly address: PublicKey,
    readonly expected: string,
    readonly gotDiscriminator: string,
  ) {
    super(
      `Expected ${expected} at ${address.toBase58()}, got discriminator ${gotDiscriminator}`,
    );
    this.name = "WrongAccountTypeError";
    fixPrototype(this, new.target);
  }
}
