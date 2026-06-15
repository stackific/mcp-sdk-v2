/**
 * S12 — Transport framing, UTF-8 decoding, and integrity (§7.1, §7.2, §7.6).
 *
 * A transport carries each `JSONRPCMessage` as a single complete UTF-8 JSON
 * value (R-7.1-b) and MUST define an unambiguous, body-independent way to find
 * the byte boundaries of one message (R-7.2-b – R-7.2-d). This module provides:
 *
 *   - `MessageFramer` / `FrameDecoder` — the abstract framing contract: encode a
 *     message to a delimited byte unit, and split a byte stream back into units
 *     using the framing alone, without parsing the JSON body (R-7.2-c).
 *   - `NewlineFramer` — newline-delimited JSON over a byte stream. This is the
 *     framing a custom transport running over a reliable byte stream SHOULD
 *     reuse rather than inventing its own (R-7.3-e). (The stdio transport, S13,
 *     layers process lifecycle on top of exactly this framing.)
 *   - `decodeMessageUnit` — turn one framed unit's bytes back into a
 *     `JSONRPCMessage`, rejecting (never silently substituting/dropping) any
 *     unit that is not well-formed UTF-8 or does not parse as a single JSON
 *     value (R-7.1-b, R-7.6-a – R-7.6-c).
 *
 * Together with `RequestCorrelator` (correlation.ts) and the `Transport`
 * contract (contract.ts) these are the reusable mechanisms every transport —
 * defined or custom — composes to uphold §7.2.
 */

import {
  classifyMessage,
  MalformedMessageError,
  type JSONRPCMessage,
} from '../jsonrpc/framing.js';
import { TransportError } from './contract.js';

// ─── Byte helpers ──────────────────────────────────────────────────────────────

/** The newline byte (`\n`, U+000A) used by `NewlineFramer` as the delimiter. */
export const NEWLINE_BYTE = 0x0a;

/**
 * Encodes a `JSONRPCMessage` to its UTF-8 JSON bytes, **without** any framing.
 *
 * `JSON.stringify` escapes any embedded newline inside a string as the two-byte
 * sequence `\` `n`, so the produced bytes never contain a raw `0x0a` — which is
 * what makes newline framing unambiguous (R-7.2-d).
 */
export function encodeMessageUnit(message: JSONRPCMessage): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(message));
}

// ─── decodeMessageUnit ───────────────────────────────────────────────────────

/**
 * Decodes one framed unit's bytes (framing already removed) into a
 * `JSONRPCMessage`. (§7.1, §7.6)
 *
 * Enforces, in order:
 *   1. **UTF-8.** The bytes MUST be well-formed UTF-8; an invalid unit is
 *      rejected with a `TransportError`, never silently substituted. (R-7.6-a,
 *      R-7.6-b, R-7.6-c)
 *   2. **Single JSON value.** The text MUST parse as exactly one JSON value;
 *      trailing or multiple values are rejected. (R-7.1-b, R-7.6-b)
 *   3. **Well-formed message.** The value MUST classify as one of the three
 *      `JSONRPCMessage` kinds (via S03's `classifyMessage`); otherwise rejected.
 *
 * The function never returns a substituted or partial message and never returns
 * `undefined` for a malformed unit — every failure is an observable throw
 * (R-7.2-q, R-7.6-c).
 *
 * @throws {TransportError} When the unit is not well-formed UTF-8, not a single
 *   JSON value, or not a valid JSON-RPC message.
 */
export function decodeMessageUnit(bytes: Uint8Array): JSONRPCMessage {
  let text: string;
  try {
    // `fatal: true` makes the decoder throw on any ill-formed UTF-8 sequence
    // instead of inserting U+FFFD replacement characters (R-7.6-c).
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (cause) {
    throw new TransportError('received unit is not well-formed UTF-8', { cause });
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (cause) {
    throw new TransportError('received unit does not parse as a single JSON value', { cause });
  }

  try {
    return classifyMessage(value).message;
  } catch (cause) {
    if (cause instanceof MalformedMessageError) {
      throw new TransportError(`received unit is not a valid JSON-RPC message: ${cause.message}`, { cause });
    }
    throw cause;
  }
}

/** Result of {@link tryDecodeMessageUnit}. */
export type DecodeResult =
  | { ok: true; message: JSONRPCMessage }
  | { ok: false; error: TransportError };

/**
 * Non-throwing variant of {@link decodeMessageUnit}: returns an `ok: false`
 * result carrying the `TransportError` instead of throwing. The failure is
 * still observable (it is returned, not swallowed) so the no-silent-drop rule
 * (R-7.6-c) holds.
 */
export function tryDecodeMessageUnit(bytes: Uint8Array): DecodeResult {
  try {
    return { ok: true, message: decodeMessageUnit(bytes) };
  } catch (error) {
    if (error instanceof TransportError) {
      return { ok: false, error };
    }
    throw error;
  }
}

// ─── Framing contract ──────────────────────────────────────────────────────────

/**
 * Splits a byte stream back into the byte boundaries of individual messages,
 * using framing alone — the decoder MUST NOT parse the JSON body to find where
 * one message ends and the next begins. (R-7.2-b, R-7.2-c, R-7.2-d)
 *
 * A decoder is stateful: it buffers bytes that do not yet form a complete unit
 * and emits each complete unit as soon as its delimiter arrives.
 */
export interface FrameDecoder {
  /**
   * Feeds a chunk of received bytes and returns every complete message unit now
   * available (framing removed). Incomplete trailing bytes are retained.
   */
  push(chunk: Uint8Array): Uint8Array[];
  /** Number of buffered bytes not yet forming a complete unit (never dropped). */
  readonly pending: number;
  /** A copy of the buffered, not-yet-complete bytes. */
  remainder(): Uint8Array;
}

/**
 * Encodes messages to delimited byte units and produces decoders that recover
 * them. A `MessageFramer` is the §7.2 framing guarantee made concrete.
 */
export interface MessageFramer {
  /** A short identifier for the framing (useful when documenting a transport). */
  readonly name: string;
  /** Encodes a message to one self-delimited byte unit. */
  encode(message: JSONRPCMessage): Uint8Array;
  /** Creates a fresh stateful decoder for one inbound byte stream. */
  createDecoder(): FrameDecoder;
}

// ─── NewlineFramer ───────────────────────────────────────────────────────────

/** Concatenates two byte arrays into a new (`ArrayBuffer`-backed) one. */
function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/** Copies a byte range into a fresh (`ArrayBuffer`-backed) `Uint8Array`. */
function copyBytes(src: Uint8Array, start = 0, end = src.length): Uint8Array {
  const out = new Uint8Array(end - start);
  out.set(src.subarray(start, end));
  return out;
}

class NewlineFrameDecoder implements FrameDecoder {
  private buffer: Uint8Array = new Uint8Array(0);

  push(chunk: Uint8Array): Uint8Array[] {
    this.buffer = concatBytes(this.buffer, chunk);
    const units: Uint8Array[] = [];

    let start = 0;
    for (let i = 0; i < this.buffer.length; i++) {
      // Boundaries are found by scanning for the delimiter byte only — the JSON
      // body is never parsed to locate them (R-7.2-c). UTF-8 multi-byte
      // sequences never contain a 0x0a byte, so this scan is unambiguous.
      if (this.buffer[i] === NEWLINE_BYTE) {
        units.push(copyBytes(this.buffer, start, i));
        start = i + 1;
      }
    }
    // Retain any bytes after the last delimiter — never dropped (R-7.2-q).
    this.buffer = copyBytes(this.buffer, start);
    return units;
  }

  get pending(): number {
    return this.buffer.length;
  }

  remainder(): Uint8Array {
    return copyBytes(this.buffer);
  }
}

/**
 * Newline-delimited JSON-RPC framing over a byte stream. (§7.2, §7.3, §8 framing)
 *
 * Each message is its UTF-8 JSON serialization followed by a single `\n`. A
 * receiver recovers messages by splitting on `\n` without parsing the body
 * (R-7.2-c, R-7.2-d). This is the framing a custom transport over a reliable
 * bidirectional byte stream (Unix socket, TCP) SHOULD reuse rather than
 * defining a new one (R-7.3-e); the stdio transport (S13) is this framing plus
 * process-lifecycle rules.
 */
export class NewlineFramer implements MessageFramer {
  readonly name = 'newline';

  encode(message: JSONRPCMessage): Uint8Array {
    const body = encodeMessageUnit(message);
    return concatBytes(body, Uint8Array.from([NEWLINE_BYTE]));
  }

  createDecoder(): FrameDecoder {
    return new NewlineFrameDecoder();
  }
}
