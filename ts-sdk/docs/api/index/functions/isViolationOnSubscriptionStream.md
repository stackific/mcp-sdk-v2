[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isViolationOnSubscriptionStream

# Function: isViolationOnSubscriptionStream()

> **isViolationOnSubscriptionStream**(`method`): `boolean`

Defined in: [protocol/streaming.ts:514](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/streaming.ts#L514)

Returns `true` when receiving notification `method` on a subscription stream is
a protocol violation — i.e. it is a request-scoped (progress/logging) kind, which
MUST NOT appear there. A client SHOULD treat such a message as a violation.
(§10.6, R-10.6-b, R-10.6-e, R-10.6-g)

## Parameters

### method

`string`

## Returns

`boolean`
