[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / grantTypesWithRefresh

# Function: grantTypesWithRefresh()

> **grantTypesWithRefresh**(`grantTypes`): `string`[]

Defined in: [protocol/authorization-registration.ts:1192](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L1192)

Returns the `grant_types` a client wanting refresh tokens SHOULD register: the
given grant types plus `refresh_token` (deduplicated). (R-23.19-r)

A client that wants refresh tokens SHOULD include `refresh_token` in its
`grant_types` client metadata; this ensures it is present without duplicating it.

## Parameters

### grantTypes

readonly `string`[]

The grant types the client already declares.

## Returns

`string`[]
