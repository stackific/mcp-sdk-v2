[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / streamableHttpStatusForProtocolError

# Function: streamableHttpStatusForProtocolError()

> **streamableHttpStatusForProtocolError**(`code`): `number` \| `undefined`

Defined in: [protocol/conformance-requirements.ts:782](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L782)

Maps a protocol error `code` to the HTTP status it MUST ride on the Streamable
HTTP transport for the §29.8 negotiation/envelope conditions. (§29.8 item 3,
R-29.8-c) `-32602` (malformed/missing field) and `-32003` (missing required
client capability) both map to `400 Bad Request`; any other code returns
`undefined` (its mapping is governed by §9 / S34, not this conformance point).

## Parameters

### code

`number`

## Returns

`number` \| `undefined`
