[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildAuthorizationRequest

# Function: buildAuthorizationRequest()

> **buildAuthorizationRequest**(`options`): [`AuthorizationRequestParams`](../interfaces/AuthorizationRequestParams.md)

Defined in: [protocol/authorization-flow.ts:874](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L874)

Builds the authorization-request query parameters for Step 2, fixing
`response_type=code`, `code_challenge_method=S256`, the `code_challenge` and
`state` from the Step-1 record, and the REQUIRED `resource` parameter. (R-23.5-d,
R-23.5-e, R-23.5-g, R-23.5-i, R-23.5-j, R-23.6-b)

## Parameters

### options

[`BuildAuthorizationRequestOptions`](../interfaces/BuildAuthorizationRequestOptions.md)

The client/redirect/resource and the Step-1 record.

## Returns

[`AuthorizationRequestParams`](../interfaces/AuthorizationRequestParams.md)
