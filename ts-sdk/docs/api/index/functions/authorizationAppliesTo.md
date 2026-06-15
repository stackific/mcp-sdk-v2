[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / authorizationAppliesTo

# Function: authorizationAppliesTo()

> **authorizationAppliesTo**(`transport`): `boolean`

Defined in: [protocol/authorization.ts:69](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization.ts#L69)

Returns `true` when the §23 authorization flow applies to `transport`.

Authorization as defined in §23 applies ONLY to HTTP-based transports
(R-23.1-a). The stdio transport MUST NOT use it — for stdio, credentials are
conveyed out of band through the child-process environment (R-23.1-b). Any
other transport MUST follow its own established security best practices and is
outside §23 (R-23.1-c).

## Parameters

### transport

[`TransportFamily`](../type-aliases/TransportFamily.md)

The transport family the request rides on.

## Returns

`boolean`
