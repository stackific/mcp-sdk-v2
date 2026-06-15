[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isViolationOnRequestStream

# Function: isViolationOnRequestStream()

> **isViolationOnRequestStream**(`method`): `boolean`

Defined in: [protocol/streaming.ts:524](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/streaming.ts#L524)

Returns `true` when receiving notification `method` on an unrelated request's
response stream is a protocol violation — i.e. it is one of the four change
kinds, which MUST NOT appear on a non-`subscriptions/listen` response stream.
(§10.6, R-10.6-d, R-10.6-f, R-10.6-g)

## Parameters

### method

`string`

## Returns

`boolean`
