/**
 * Per-request capability negotiation model (§1.5, §2.2.2).
 *
 * Capabilities are declared per request, not once per connection. A client
 * attaches its declared capabilities to each request it sends. A server MUST
 * NOT infer a capability from any prior request, connection, or stream.
 * (R-2.2.2-a, AC-01.14)
 *
 * An endpoint MUST NOT exercise a feature the peer has not declared. If
 * processing a request requires a capability the client did not declare, the
 * server MUST reject the request with the dedicated missing-capability error.
 * (R-2.2.2-b, R-2.2.2-c, AC-01.12, AC-01.13, AC-01.15)
 *
 * The concrete error code for the missing-capability error is defined in S09.
 * The concrete `ClientCapabilities` and `ServerCapabilities` shapes are defined
 * in S10 (§6).
 */

/**
 * Error thrown when a server receives a request that requires a capability the
 * client did not declare for that request. (R-2.2.2-c, AC-01.15)
 *
 * The concrete numeric error code is defined in S09. This class uses a symbolic
 * string code as a stable programmatic identifier until S09 is implemented.
 */
export class MissingCapabilityError extends Error {
  /** Symbolic code; numeric wire value assigned in S09. */
  readonly code = 'MISSING_CAPABILITY' as const;

  /** The name of the capability that was required but not declared. */
  readonly capability: string;

  constructor(capability: string) {
    super(`Missing required capability: ${capability}`);
    this.name = 'MissingCapabilityError';
    this.capability = capability;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Asserts that a required capability has been declared by the peer for the
 * current request.
 *
 * This function is intentionally stateless: it takes the set of declared
 * capabilities as a parameter rather than reading stored state. This design
 * enforces the per-request rule (R-2.2.2-a): callers must supply the
 * capabilities declared on the current request, not any accumulated state.
 * (AC-01.14)
 *
 * @param declaredCapabilities - Set of capability names declared by the peer
 *   for the current request.
 * @param required - The capability name required to process this request.
 * @throws {MissingCapabilityError} When `required` is not in
 *   `declaredCapabilities`. (R-2.2.2-c, AC-01.15)
 *
 * @example
 * assertCapability(new Set(['tools', 'resources']), 'tools'); // OK
 * assertCapability(new Set(['tools']), 'resources'); // throws MissingCapabilityError
 */
export function assertCapability(
  declaredCapabilities: ReadonlySet<string>,
  required: string,
): void {
  if (!declaredCapabilities.has(required)) {
    throw new MissingCapabilityError(required);
  }
}

/**
 * Returns `true` when a required capability has been declared; `false` otherwise.
 * Prefer `assertCapability` in enforcement code; use this predicate for
 * conditional logic. (R-2.2.2-b, AC-01.12, AC-01.13)
 *
 * Like `assertCapability`, this function is stateless — capabilities must be
 * supplied from the current request. (R-2.2.2-a, AC-01.14)
 */
export function hasCapability(
  declaredCapabilities: ReadonlySet<string>,
  required: string,
): boolean {
  return declaredCapabilities.has(required);
}
