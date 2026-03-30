export class VelaError extends Error {
  constructor(
    message: string,
    public readonly code: number,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "VelaError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
