[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / httpStatusForCapabilityError

# Function: httpStatusForCapabilityError()

> **httpStatusForCapabilityError**(`code`): `400` \| `undefined`

Defined in: [protocol/capability-negotiation.ts:354](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/capability-negotiation.ts#L354)

Returns `400` for the capability-negotiation error codes — `-32003`
(missing required client capability) and `-32602` (malformed request omitting
a required `_meta` field) — both of which map to `400 Bad Request` on the
HTTP transport; `undefined` otherwise. (R-6.4-i, R-6.4-k)

## Parameters

### code

`number`

## Returns

`400` \| `undefined`
