[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildAuthorizationUrl

# Function: buildAuthorizationUrl()

> **buildAuthorizationUrl**(`authorizationEndpoint`, `params`): `string`

Defined in: [protocol/authorization-flow.ts:905](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L905)

Serializes authorization-request parameters into a full authorization-endpoint
URL with a percent-encoded query string. (§23.5, Step 2 wire example)

Parameters are emitted in the spec's example order. Existing query parameters on
`authorizationEndpoint` are preserved.

## Parameters

### authorizationEndpoint

`string`

The authorization server's `authorization_endpoint`.

### params

[`AuthorizationRequestParams`](../interfaces/AuthorizationRequestParams.md)

The authorization-request parameters.

## Returns

`string`
