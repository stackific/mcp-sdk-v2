[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / extractEnvelopeForMirroring

# Function: extractEnvelopeForMirroring()

> **extractEnvelopeForMirroring**(`request`): [`RequestContext`](../interfaces/RequestContext.md) \| `undefined`

Defined in: [transport/contract.ts:218](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/contract.ts#L218)

Extracts the envelope fields a transport MAY mirror into transport-level
metadata for routing/inspection (e.g. HTTP headers; see S14/S15). (R-7.4-e)

The returned values are read **from the message body**, which remains the
authoritative source of truth — the mirror is a derived copy, never an
alternative input. Returns `undefined` when the body carries no valid
envelope, so a transport never mirrors fabricated values.

## Parameters

### request

`unknown`

## Returns

[`RequestContext`](../interfaces/RequestContext.md) \| `undefined`
