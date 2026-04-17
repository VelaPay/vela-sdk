import type { PublicKey } from "@solana/web3.js";

function fixPrototype(instance: Error, ctor: Function) {
  Object.setPrototypeOf(instance, ctor.prototype);
}

export class TokenConfigNotFound extends Error {
  constructor(readonly mint: PublicKey) {
    super(`TokenConfig not found for mint ${mint.toBase58()}`);
    this.name = "TokenConfigNotFound";
    fixPrototype(this, new.target);
  }
}

export class TokenConfigDisabled extends Error {
  constructor(readonly mint: PublicKey) {
    super(`TokenConfig for mint ${mint.toBase58()} is currently disabled`);
    this.name = "TokenConfigDisabled";
    fixPrototype(this, new.target);
  }
}

export class AmountPrecisionExceeded extends Error {
  constructor(
    readonly value: string,
    readonly decimals: number,
  ) {
    super(`Amount "${value}" exceeds the allowed precision of ${decimals} decimals`);
    this.name = "AmountPrecisionExceeded";
    fixPrototype(this, new.target);
  }
}

export class TokenChangeNotSupported extends Error {
  constructor(
    readonly currentMint: PublicKey,
    readonly nextMint: PublicKey,
  ) {
    super(
      `Token changes are not supported (${currentMint.toBase58()} -> ${nextMint.toBase58()})`,
    );
    this.name = "TokenChangeNotSupported";
    fixPrototype(this, new.target);
  }
}
