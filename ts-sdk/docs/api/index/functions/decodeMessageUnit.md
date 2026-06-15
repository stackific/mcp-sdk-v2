[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / decodeMessageUnit

# Function: decodeMessageUnit()

> **decodeMessageUnit**(`bytes`): [`JSONRPCMessage`](../type-aliases/JSONRPCMessage.md)

Defined in: [transport/framing.ts:70](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/framing.ts#L70)

Decodes one framed unit's bytes (framing already removed) into a
`JSONRPCMessage`. (§7.1, §7.6)

Enforces, in order:
  1. **UTF-8.** The bytes MUST be well-formed UTF-8; an invalid unit is
     rejected with a `TransportError`, never silently substituted. (R-7.6-a,
     R-7.6-b, R-7.6-c)
  2. **Single JSON value.** The text MUST parse as exactly one JSON value;
     trailing or multiple values are rejected. (R-7.1-b, R-7.6-b)
  3. **Well-formed message.** The value MUST classify as one of the three
     `JSONRPCMessage` kinds (via S03's `classifyMessage`); otherwise rejected.

The function never returns a substituted or partial message and never returns
`undefined` for a malformed unit — every failure is an observable throw
(R-7.2-q, R-7.6-c).

## Parameters

### bytes

`Uint8Array`

## Returns

[`JSONRPCMessage`](../type-aliases/JSONRPCMessage.md)

## Throws

When the unit is not well-formed UTF-8, not a single
  JSON value, or not a valid JSON-RPC message.
