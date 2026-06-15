/**
 * S12 — Transport Model & Transport-Agnostic Guarantees (§7).
 *
 * The transport contract and the reusable mechanisms every transport composes
 * to uphold the §7.2 guarantees:
 *
 *   contract.ts    — `Transport`, `TransportError`, `TransportCloseInfo`,
 *                    directionality (`isDirectionPermitted`), statelessness
 *                    (`deriveRequestContext`, `requestCarriesMetaEnvelope`,
 *                    `extractEnvelopeForMirroring`), and the §7.2/§7.3/§7.5/§7.6
 *                    documentation-constant maps.
 *   framing.ts     — `MessageFramer`/`FrameDecoder`, `NewlineFramer`,
 *                    `decodeMessageUnit` (UTF-8 + single-JSON-value validation).
 *   correlation.ts — `RequestCorrelator` (id-correlation, multiplexing, ordering,
 *                    disconnection failure) and the malformed-id error helpers.
 *   in-memory.ts   — `InMemoryTransport` reference pair upholding every guarantee.
 *
 * The two transports the specification *defines* (stdio, Streamable HTTP) are
 * built on this contract in S13 and S14/S15.
 */

export * from './contract.js';
export * from './framing.js';
export * from './correlation.js';
export * from './in-memory.js';
export * from './stdio.js';
export * from './http/index.js';
