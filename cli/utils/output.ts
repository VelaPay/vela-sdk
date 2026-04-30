import { PublicKey } from "@solana/web3.js";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

export function serializeForJson(value: unknown): unknown {
  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof PublicKey) {
    return value.toBase58();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => serializeForJson(entry));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        serializeForJson(entry),
      ]),
    );
  }

  return value;
}

export function renderOutput<T>(
  value: T,
  options: {
    json?: boolean;
    formatHuman: (value: T) => string;
  },
): string {
  if (options.json) {
    return JSON.stringify(serializeForJson(value), null, 2);
  }

  return options.formatHuman(value);
}

export function printOutput<T>(
  value: T,
  options: {
    json?: boolean;
    formatHuman: (value: T) => string;
  },
): void {
  console.log(renderOutput(value, options));
}
