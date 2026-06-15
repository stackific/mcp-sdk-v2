[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildRefreshTokenRequest

# Function: buildRefreshTokenRequest()

> **buildRefreshTokenRequest**(`options`): [`RefreshTokenRequest`](../interfaces/RefreshTokenRequest.md)

Defined in: [protocol/authorization-flow.ts:1292](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1292)

Builds the refresh-token token-request body, fixing `grant_type=refresh_token`
and carrying the same `resource` parameter so the refreshed token stays
audience-bound. (R-23.9-e, R-23.9-f)

## Parameters

### options

[`BuildRefreshTokenRequestOptions`](../interfaces/BuildRefreshTokenRequestOptions.md)

The refresh token, client, resource, and OPTIONAL narrowed scope.

## Returns

[`RefreshTokenRequest`](../interfaces/RefreshTokenRequest.md)
