[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / authorizationForbiddenFor

# Function: authorizationForbiddenFor()

> **authorizationForbiddenFor**(`transport`): `boolean`

Defined in: [protocol/authorization.ts:82](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization.ts#L82)

Returns `true` when `transport` MUST NOT use the §23 authorization flow.

Only stdio is explicitly forbidden from using it (R-23.1-b); `other`
transports are merely outside §23's scope (R-23.1-c), not forbidden, so this
is `true` only for `stdio`.

## Parameters

### transport

[`TransportFamily`](../type-aliases/TransportFamily.md)

The transport family the request rides on.

## Returns

`boolean`
