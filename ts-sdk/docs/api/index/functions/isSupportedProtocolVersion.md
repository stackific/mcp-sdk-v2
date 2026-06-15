[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isSupportedProtocolVersion

# Function: isSupportedProtocolVersion()

> **isSupportedProtocolVersion**(`version`): `boolean`

Defined in: [protocol/meta.ts:143](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/meta.ts#L143)

Returns `true` when the server recognizes and supports `version`.
A server that does not support the requested revision MUST reject the request
with the unsupported-protocol-version error (§5 / S09). (R-4.3-f)

## Parameters

### version

`string`

## Returns

`boolean`
