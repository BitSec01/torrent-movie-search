/**
 * A metadata source refused the request for a reason that will repeat: a key
 * that was never activated, or a quota that is spent. Callers looping over rows
 * use this to abandon the whole batch instead of buying the same 401 once per
 * row.
 */
export class MetadataSourceError extends Error {
  constructor(
    readonly source: string,
    message: string,
    readonly reason: "invalid-key" | "rate-limited" | "unknown"
  ) {
    super(message);
    this.name = `${source}Error`;
  }
}
