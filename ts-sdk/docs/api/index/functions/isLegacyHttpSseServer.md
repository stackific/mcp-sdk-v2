[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isLegacyHttpSseServer

# Function: isLegacyHttpSseServer()

> **isLegacyHttpSseServer**(`firstEventName`): `boolean`

Defined in: [transport/http/responses.ts:637](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/responses.ts#L637)

Interprets the first event of the SSE stream a fallback `GET` opens. (R-9.12-h)

Returns `true` when the first event is an `endpoint` event, in which case the
client SHOULD treat the server as running the deprecated HTTP+SSE transport
and use that transport for subsequent communication.

## Parameters

### firstEventName

`string` \| `undefined`

The `event:` field of the first SSE event, if any.

## Returns

`boolean`
